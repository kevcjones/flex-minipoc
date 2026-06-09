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

import { GATEWAY_HOST, PUBLIC_HOST } from "../../config";

/**
 * Flex core capability: telemetry. Write-only event ingest, logged to
 * CloudWatch. Gateway-fronted, mounted on the shared custom domain at base
 * path "telemetry". Domains reach it only through the SDK fragment in ./sdk.ts.
 */
export class TelemetryStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const recordFn = new NodejsFunction(this, "RecordFn", {
      entry: join(__dirname, "handlers", "record.ts"),
      handler: "handler",
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(10),
    });

    const api = new RestApi(this, "Gateway", {
      restApiName: "flex-mini-telemetry",
      description: "Flex core telemetry ingest",
      deployOptions: { stageName: "prod" },
    });

    api.root
      .addResource("v1")
      .addResource("events")
      .addMethod("POST", new LambdaIntegration(recordFn));

    new CfnBasePathMapping(this, "Mapping", {
      domainName: GATEWAY_HOST,
      basePath: "telemetry",
      restApiId: api.restApiId,
      stage: api.deploymentStage.stageName,
    });

    new CfnOutput(this, "TelemetryUrl", {
      value: `https://${PUBLIC_HOST}/telemetry`,
    });
  }
}
