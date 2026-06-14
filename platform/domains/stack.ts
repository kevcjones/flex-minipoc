import { join } from "path";

import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import {
  AuthorizationType,
  CfnBasePathMapping,
  HttpIntegration,
  IdentitySource,
  IResource,
  LambdaIntegration,
  RequestAuthorizer,
  RestApi,
} from "aws-cdk-lib/aws-apigateway";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

import { GATEWAY_HOST, INTERNAL_HOST, PUBLIC_HOST } from "../../config";
import type { RouteConfig } from "../../core/routes/sdk";
import { DiscoveredRoute } from "./discover";

interface DomainStackProps extends StackProps {
  domainName: string;
  routes: DiscoveredRoute[];
}

// Provisioning a REST API Gateway cache is a paid, always-on cluster and slows
// deploys, so the POC declares cache policy but leaves the cluster off. Flip to
// true to activate (and accept the cost).
const ENABLE_CACHE = false;

/**
 * The per-domain gateway builder. Platform-owned. Turns a discovered domain
 * (folder tree of route.ts / handler.ts) into an independent gateway.
 *
 * Each route is one of:
 *  - passthrough: an HTTP integration to an upstream, authorizer injects the
 *    per-user token, no handler lambda.
 *  - execution:   a NodejsFunction from the sibling handler.ts, with post-hooks
 *    serialised into its env.
 *  - legacy:      a handler.ts with no route.ts, wired as a plain lambda route
 *    (the original POC shape, still supported).
 */
export class DomainStack extends Stack {
  constructor(scope: Construct, id: string, props: DomainStackProps) {
    super(scope, id, props);

    const { domainName, routes } = props;

    const internalBase = `https://${INTERNAL_HOST}`;
    const udpUrl = `${internalBase}/udp`;
    const telemetryUrl = `${internalBase}/telemetry`;
    const requestUrl = `${internalBase}/request`;

    const api = new RestApi(this, "Gateway", {
      restApiName: `flex-mini-${domainName}`,
      description: `Independent gateway for ${domainName}`,
      deployOptions: { stageName: "prod" },
    });

    // The udp-linked authorizer, created once and shared by routes that need it.
    let authorizer: RequestAuthorizer | undefined;
    const udpLinkedAuthorizer = (): RequestAuthorizer => {
      if (!authorizer) {
        const authFn = new NodejsFunction(this, "AuthorizerFn", {
          entry: join(__dirname, "..", "..", "core", "identity", "handlers", "authorizer.ts"),
          handler: "handler",
          runtime: Runtime.NODEJS_20_X,
          timeout: Duration.seconds(10),
          environment: { FLEX_UDP_URL: udpUrl },
        });
        authorizer = new RequestAuthorizer(this, "Authorizer", {
          handler: authFn,
          // Cache the resolved identity keyed on x-user-id, so repeat requests
          // from the same user skip the authorizer lambda and its UDP lookup.
          // (Makes x-user-id required: a missing header now 401s at the edge.)
          identitySources: [IdentitySource.header("x-user-id")],
          resultsCacheTtl: Duration.seconds(300),
        });
      }
      return authorizer;
    };

    for (const route of routes) {
      const slug = slugFor(route.apiPath);
      const config = loadConfig(route);
      const resource = addDeepResource(api.root, route.apiPath);

      const authOptions =
        config && config.auth !== "none"
          ? {
              authorizer: udpLinkedAuthorizer(),
              authorizationType: AuthorizationType.CUSTOM,
            }
          : {};

      if (config?.kind === "passthrough") {
        const { method, uri } = resolveTarget(config.target);
        // The authorizer's record id is substituted into the upstream URL path
        // ({id}) at the gateway, so the pass-through needs no handler.
        const requestParameters =
          config.auth !== "none" && uri.includes("{id}")
            ? { "integration.request.path.id": "context.authorizer.linkingId" }
            : undefined;

        resource.addMethod(
          route.method,
          new HttpIntegration(uri, {
            httpMethod: method,
            proxy: true,
            options: { requestParameters },
          }),
          {
            ...authOptions,
            ...cacheOptions(config),
          },
        );
      } else {
        // execution (route.ts kind=execution) or legacy (handler.ts only)
        if (!route.handler) {
          throw new Error(
            `Route ${domainName}/${route.apiPath} needs a handler.ts`,
          );
        }
        const post = config?.kind === "execution" ? config.post : undefined;
        const fn = new NodejsFunction(this, `Fn${slug}`, {
          entry: route.handler,
          handler: "handler",
          runtime: Runtime.NODEJS_20_X,
          timeout: Duration.seconds(10),
          environment: {
            FLEX_UDP_URL: udpUrl,
            FLEX_TELEMETRY_URL: telemetryUrl,
            FLEX_REQUEST_URL: requestUrl,
            // The back-door: channel views reach domain resources here (the
            // gateway host directly, not CloudFront), with the user identity.
            FLEX_FRONT_DOOR_URL: `https://${GATEWAY_HOST}`,
            FLEX_POST_HOOKS: JSON.stringify(post ?? []),
          },
        });

        resource.addMethod(route.method, new LambdaIntegration(fn), authOptions);
      }

      new CfnOutput(this, `Route${slug}`, {
        value: `${route.method} https://${PUBLIC_HOST}/${domainName}/${route.apiPath}`,
      });
    }

    new CfnBasePathMapping(this, "Mapping", {
      domainName: GATEWAY_HOST,
      basePath: domainName,
      restApiId: api.restApiId,
      stage: api.deploymentStage.stageName,
    });
  }
}

/** Load and normalise a route.ts declaration, or undefined for legacy routes. */
function loadConfig(route: DiscoveredRoute): RouteConfig | undefined {
  if (!route.routeConfig) return undefined;
  // ts-node transpiles the .ts on require at synth.
  const loaded = require(route.routeConfig) as { default?: RouteConfig };
  return loaded.default ?? (loaded as unknown as RouteConfig);
}

/** "GET {mockDvla}/user" -> { method, uri } with placeholders resolved. */
function resolveTarget(target: string): { method: string; uri: string } {
  const [method, uri = ""] = target.split(/\s+/);
  return { method, uri };
}

function cacheOptions(config: RouteConfig) {
  if (!ENABLE_CACHE || !config.cache) return {};
  return {
    cachingEnabled: true,
    cacheTtl: Duration.seconds(config.cache.ttl),
    cacheKeyParameters: config.cache.perUser
      ? ["method.request.header.x-user-id"]
      : [],
  };
}

function slugFor(apiPath: string): string {
  return (
    apiPath
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join("") || "Root"
  );
}

/** Walk or create nested API Gateway resources for a path like "v1/hello". */
function addDeepResource(root: IResource, path: string): IResource {
  return path
    .split("/")
    .filter(Boolean)
    .reduce<IResource>((parent, segment) => {
      const existing = parent.node.tryFindChild(segment) as
        | IResource
        | undefined;
      return existing ?? parent.addResource(segment);
    }, root);
}
