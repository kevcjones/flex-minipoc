import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import {
  DomainName,
  EndpointType,
  SecurityPolicy,
} from "aws-cdk-lib/aws-apigateway";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  OriginRequestPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { HttpOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Construct } from "constructs";

import { CERT_ARN, GATEWAY_HOST, PUBLIC_HOST } from "../config";

/**
 * Flex core. Owns the front door and nothing domain-specific.
 *
 *   client -> CloudFront (one static origin) -> custom domain -> [base path fan-out]
 *
 * DNS lives in Cloudflare, so this stack does not manage any records. It emits
 * the two targets you need to create CNAMEs for (see outputs and README).
 */
export class CoreStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Pre-created, DNS-validated cert (us-east-1) covering both hosts.
    const cert = Certificate.fromCertificateArn(this, "Cert", CERT_ARN);

    // Regional custom domain. Multi-segment base paths need Regional + TLS 1.2.
    const customDomain = new DomainName(this, "GatewayDomain", {
      domainName: GATEWAY_HOST,
      certificate: cert,
      endpointType: EndpointType.REGIONAL,
      securityPolicy: SecurityPolicy.TLS_1_2,
    });

    // CloudFront: a single static origin, the custom domain. This never changes
    // when a domain is added; the fan-out happens at the custom domain.
    //
    // Origin is the friendly GATEWAY_HOST (not the raw target) so CloudFront
    // presents that host to API Gateway, which is what it matches on. That host
    // resolves via the Cloudflare CNAME you create to the regional target below.
    const distribution = new Distribution(this, "Cdn", {
      comment: "flex-minipoc front door",
      defaultBehavior: {
        origin: new HttpOrigin(GATEWAY_HOST),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
      domainNames: [PUBLIC_HOST],
      certificate: cert,
    });

    // Create these two CNAMEs in Cloudflare, both set to DNS only (grey cloud):
    //   PUBLIC_HOST  -> CloudFrontDomain   (the apps' entry point)
    //   GATEWAY_HOST -> GatewayTarget      (CloudFront's origin)
    new CfnOutput(this, "CloudFrontDomain", {
      value: distribution.distributionDomainName,
    });
    new CfnOutput(this, "GatewayTarget", {
      value: customDomain.domainNameAliasDomainName,
    });
    new CfnOutput(this, "PublicUrl", { value: `https://${PUBLIC_HOST}` });
  }
}
