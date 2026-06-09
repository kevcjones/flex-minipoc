#!/usr/bin/env node
import "source-map-support/register";
import { App } from "aws-cdk-lib";

import { REGION } from "../config";
import { discoverDomains } from "../lib/discover";
import { CoreStack } from "../lib/core-stack";
import { DomainStack } from "../lib/domain-stack";

const app = new App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: REGION,
};

// Flex core: the front door. CloudFront -> one custom domain. Deployed once.
new CoreStack(app, "FlexMiniCore", { env });

// Domains and their routes come entirely from the domains/ folder tree.
// Add a folder with a handler.ts to add a route; add a top-level folder to add
// a domain. Deploy only the affected stack.
for (const domain of discoverDomains()) {
  const stackId = `FlexMini${domain.name.charAt(0).toUpperCase()}${domain.name.slice(1)}`;
  new DomainStack(app, stackId, {
    env,
    domainName: domain.name,
    routes: domain.routes,
  });
}
