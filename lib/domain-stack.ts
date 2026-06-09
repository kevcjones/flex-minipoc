import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import {
  CfnBasePathMapping,
  LambdaIntegration,
  RestApi,
} from "aws-cdk-lib/aws-apigateway";
import { Code, Function as LambdaFunction, Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

import { GATEWAY_HOST, PUBLIC_HOST } from "../config";

interface DomainStackProps extends StackProps {
  domainName: string;
}

/**
 * One independent domain (foo or bar).
 *
 * It owns its whole surface: its RestApi, its route, its Lambda, and its own
 * Deployment + Stage (redeployed automatically by CloudFormation). It attaches
 * to the shared custom domain by NAME only, via its own base path mapping, so
 * it has no CloudFormation dependency on the core stack or on any other domain.
 *
 * The only ordering requirement is that the core stack (which creates the
 * custom domain) is deployed once before this. After that, deploy or redeploy
 * this domain freely. Nothing waits on anything.
 */
export class DomainStack extends Stack {
  constructor(scope: Construct, id: string, props: DomainStackProps) {
    super(scope, id, props);

    const { domainName } = props;

    const fn = new LambdaFunction(this, "HelloFn", {
      runtime: Runtime.NODEJS_20_X,
      handler: "index.handler",
      timeout: Duration.seconds(10),
      code: Code.fromInline(
        `exports.handler = async () => ({` +
          ` statusCode: 200,` +
          ` headers: { "Content-Type": "application/json" },` +
          ` body: JSON.stringify({ domain: "${domainName}", message: "hello from ${domainName}" }),` +
          ` });`,
      ),
    });

    const api = new RestApi(this, "Gateway", {
      restApiName: `flex-mini-${domainName}`,
      description: `Independent gateway for ${domainName}`,
      deployOptions: { stageName: "prod" },
    });

    // Base path mapping strips "<domainName>", so /<domainName>/hello arrives
    // here as /hello.
    api.root
      .addResource("hello")
      .addMethod("GET", new LambdaIntegration(fn));

    // Self-registration: claim this domain's base path on the shared custom
    // domain. Owned by this stack. L1 resource so a multi-segment base path
    // would also work without the L2 rough edge.
    new CfnBasePathMapping(this, "Mapping", {
      domainName: GATEWAY_HOST,
      basePath: domainName,
      restApiId: api.restApiId,
      stage: api.deploymentStage.stageName,
    });

    new CfnOutput(this, "TestUrl", {
      value: `https://${PUBLIC_HOST}/${domainName}/hello`,
    });
  }
}
