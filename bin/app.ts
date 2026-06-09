#!/usr/bin/env node
import "source-map-support/register";
import { App } from "aws-cdk-lib";

import { REGION } from "../config";
import { UdpStack } from "../core/udp/stack";
import { TelemetryStack } from "../core/telemetry/stack";
import { FrontDoorStack } from "../platform/front-door/stack";
import { DomainStack } from "../platform/domains/stack";
import { discoverDomains } from "../platform/domains/discover";

const app = new App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: REGION,
};

// Platform: the front door. CloudFront -> one custom domain. Deployed once.
// Stack id stays "FlexMiniCore" for continuity.
new FrontDoorStack(app, "FlexMiniCore", { env });

// Flex core capabilities, reachable by domains via the SDK fragments.
new UdpStack(app, "FlexMiniUdp", { env });
new TelemetryStack(app, "FlexMiniTelemetry", { env });

// Domains and their routes come entirely from the domains/ folder tree.
for (const domain of discoverDomains()) {
  const stackId = `FlexMini${domain.name.charAt(0).toUpperCase()}${domain.name.slice(1)}`;
  new DomainStack(app, stackId, {
    env,
    domainName: domain.name,
    routes: domain.routes,
  });
}
