#!/usr/bin/env node
import "source-map-support/register";
import { App } from "aws-cdk-lib";

import { DOMAINS, REGION } from "../config";
import { CoreStack } from "../lib/core-stack";
import { DomainStack } from "../lib/domain-stack";

const app = new App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: REGION,
};

// Flex core: the front door. CloudFront -> one custom domain. Deployed once.
new CoreStack(app, "FlexMiniCore", { env });

// Independent domains, one stack each. Adding a name to DOMAINS and deploying
// just that stack onboards a new domain: a new gateway that self-registers its
// base path on the shared custom domain. Nothing else changes, and no DNS is
// touched.
for (const name of DOMAINS) {
  const stackId = `FlexMini${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  new DomainStack(app, stackId, { env, domainName: name });
}
