import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import {
  CfnBasePathMapping,
  IResource,
  LambdaIntegration,
  RestApi,
} from "aws-cdk-lib/aws-apigateway";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

import { GATEWAY_HOST, PUBLIC_HOST } from "../config";
import { DiscoveredRoute } from "./discover";

interface DomainStackProps extends StackProps {
  domainName: string;
  routes: DiscoveredRoute[];
}

/**
 * One independent domain. Its routes are discovered from the folder tree, so
 * the gateway shape is a direct reflection of domains/<name>/...
 *
 * Adding a function under this domain (a new handler.ts) and deploying only
 * this stack adds the route. Core and the other domains are untouched.
 */
export class DomainStack extends Stack {
  constructor(scope: Construct, id: string, props: DomainStackProps) {
    super(scope, id, props);

    const { domainName, routes } = props;

    const api = new RestApi(this, "Gateway", {
      restApiName: `flex-mini-${domainName}`,
      description: `Independent gateway for ${domainName}`,
      deployOptions: { stageName: "prod" },
    });

    for (const route of routes) {
      const slug = route.apiPath.replace(/[^A-Za-z0-9]/g, "") || "root";

      const fn = new NodejsFunction(this, `Fn${slug}`, {
        entry: route.entry,
        handler: "handler",
        runtime: Runtime.NODEJS_20_X,
        timeout: Duration.seconds(10),
      });

      // Base path mapping strips "<domainName>", so /<domainName>/<apiPath>
      // arrives here as /<apiPath>.
      addDeepResource(api.root, route.apiPath).addMethod(
        route.method,
        new LambdaIntegration(fn),
      );

      new CfnOutput(this, `Route${slug}`, {
        value: `${route.method} https://${PUBLIC_HOST}/${domainName}/${route.apiPath}`,
      });
    }

    // Self-registration: claim this domain's base path on the shared custom domain.
    new CfnBasePathMapping(this, "Mapping", {
      domainName: GATEWAY_HOST,
      basePath: domainName,
      restApiId: api.restApiId,
      stage: api.deploymentStage.stageName,
    });
  }
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
