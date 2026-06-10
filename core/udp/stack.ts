import { join } from "path";

import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import {
  CfnBasePathMapping,
  LambdaIntegration,
  RestApi,
} from "aws-cdk-lib/aws-apigateway";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

import { INTERNAL_HOST } from "../../config";

/**
 * Flex core capability: a tiny UDP-like store. Read/write keyed data.
 *
 * Gateway-fronted, backed by one DynamoDB table (pay-per-request), mounted on
 * the shared custom domain at base path "udp". Domains reach it only through
 * the SDK fragment in ./sdk.ts.
 *
 * NOTE (POC simplification): public and unauthenticated. Real Flex fronts UDP
 * with the private gateway + IAM / SigV4. Do not store anything sensitive.
 */
export class UdpStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const table = new Table(this, "Store", {
      partitionKey: { name: "id", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const makeFn = (name: string, entry: string) =>
      new NodejsFunction(this, name, {
        entry: join(__dirname, "handlers", entry),
        handler: "handler",
        runtime: Runtime.NODEJS_20_X,
        timeout: Duration.seconds(10),
        environment: { TABLE_NAME: table.tableName },
        bundling: { externalModules: ["@aws-sdk/*"] },
      });

    const storeFn = makeFn("StoreFn", "store.ts");
    const retrieveFn = makeFn("RetrieveFn", "retrieve.ts");
    const removeFn = makeFn("RemoveFn", "remove.ts");

    table.grantWriteData(storeFn);
    table.grantReadData(retrieveFn);
    table.grantWriteData(removeFn);

    const api = new RestApi(this, "Gateway", {
      restApiName: "flex-mini-udp",
      description: "Flex core UDP-like store",
      deployOptions: { stageName: "prod" },
    });

    const data = api.root
      .addResource("v1")
      .addResource("data")
      .addResource("{key}");
    data.addMethod("GET", new LambdaIntegration(retrieveFn));
    data.addMethod("PUT", new LambdaIntegration(storeFn));
    data.addMethod("DELETE", new LambdaIntegration(removeFn));

    new CfnBasePathMapping(this, "Mapping", {
      domainName: INTERNAL_HOST,
      basePath: "udp",
      restApiId: api.restApiId,
      stage: api.deploymentStage.stageName,
    });

    new CfnOutput(this, "UdpUrl", { value: `https://${INTERNAL_HOST}/udp` });
  }
}
