import { join } from "path";

import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import {
  CfnBasePathMapping,
  LambdaIntegration,
  RestApi,
} from "aws-cdk-lib/aws-apigateway";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

import { INTERNAL_HOST } from "../../config";
import { allowlist } from "./allowlist";

/**
 * Flex core capability: the egress gateway. A single owned exit through which
 * domains make outbound calls, reached via the SDK as request.fetch(url).
 *
 * The platform team maintains the allow-list (allowlist.ts), injected here as
 * config. Domains never hold credentials, never get raw internet egress, and
 * never know this gateway exists.
 *
 * NOTE (POC simplification): the forwarder enforces the allow-list in code and
 * runs with default Lambda internet egress. Real Flex would enforce this at the
 * network layer (egress firewall) inside a VPC with fixed egress IPs.
 */
export class RequestStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const forwardFn = new NodejsFunction(this, "ForwardFn", {
      entry: join(__dirname, "handlers", "forward.ts"),
      handler: "handler",
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(15),
      environment: { ALLOWLIST: JSON.stringify(allowlist) },
    });

    const api = new RestApi(this, "Gateway", {
      restApiName: "flex-mini-request",
      description: "Flex core egress gateway",
      deployOptions: { stageName: "prod" },
    });

    api.root
      .addResource("v1")
      .addResource("send")
      .addMethod("POST", new LambdaIntegration(forwardFn));

    new CfnBasePathMapping(this, "Mapping", {
      domainName: INTERNAL_HOST,
      basePath: "request",
      restApiId: api.restApiId,
      stage: api.deploymentStage.stageName,
    });

    new CfnOutput(this, "RequestUrl", {
      value: `https://${INTERNAL_HOST}/request`,
    });
  }
}
