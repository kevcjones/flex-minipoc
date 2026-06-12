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

/**
 * A stand-in for the external DVLA system. NOT part of Flex. It exists only so
 * the pass-through has a real upstream to forward to and the execution route has
 * something to fetch.
 *
 * Mounted on the internal custom domain (base path "mock-dvla") purely to avoid
 * cross-stack URL plumbing in the POC; conceptually it is a third party reached
 * over the internet. Its handlers require x-dvla-linking-id and support
 * ?break=1 to force a contract-violating response.
 */
export class MockDvlaStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const makeFn = (name: string, entry: string) =>
      new NodejsFunction(this, name, {
        entry: join(__dirname, "handlers", entry),
        handler: "handler",
        runtime: Runtime.NODEJS_20_X,
        timeout: Duration.seconds(10),
      });

    const userFn = makeFn("UserFn", "user.ts");
    const licenceFn = makeFn("LicenceFn", "driving-licence.ts");

    const api = new RestApi(this, "Gateway", {
      restApiName: "flex-mini-mock-dvla",
      description: "Stand-in for external DVLA",
      deployOptions: { stageName: "prod" },
    });

    const v1 = api.root;
    v1.addResource("user").addMethod("GET", new LambdaIntegration(userFn));
    v1.addResource("driving-licence").addMethod(
      "GET",
      new LambdaIntegration(licenceFn),
    );

    new CfnBasePathMapping(this, "Mapping", {
      domainName: INTERNAL_HOST,
      basePath: "mock-dvla",
      restApiId: api.restApiId,
      stage: api.deploymentStage.stageName,
    });

    new CfnOutput(this, "MockDvlaUrl", {
      value: `https://${INTERNAL_HOST}/mock-dvla`,
    });
  }
}
