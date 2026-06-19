#!/usr/bin/env node
import "source-map-support/register";
import { App } from "aws-cdk-lib";

import { REGION } from "../config";
import { UdpStack } from "../core/udp/stack";
import { TelemetryStack } from "../core/telemetry/stack";
import { RequestStack } from "../core/request/stack";
import { FrontDoorStack } from "../platform/front-door/stack";
import { DomainStack } from "../platform/domains/stack";
import { discoverChannels, discoverDomains } from "../platform/domains/discover";

const app = new App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: REGION,
};

// Platform: the front door. Creates the public and internal custom domains and
// CloudFront. Everything else attaches to those domains by name (a loose string
// coupling, no exports), so each also declares an ordering-only dependency on
// it: that emits nothing into the templates, it just tells `cdk deploy --all`
// to do the front door first and tear it down last.
const frontDoor = new FrontDoorStack(app, "FlexMiniCore", { env });

// Flex core capabilities, reachable by domains via the SDK fragments.
const core = [
  new UdpStack(app, "FlexMiniUdp", { env }),
  new TelemetryStack(app, "FlexMiniTelemetry", { env }),
  new RequestStack(app, "FlexMiniRequest", { env }),
];
for (const stack of core) stack.addDependency(frontDoor);

// Domains (L1) and their routes come entirely from the domains/ folder tree.
for (const domain of discoverDomains()) {
  const stackId = `FlexMini${domain.name.charAt(0).toUpperCase()}${domain.name.slice(1)}`;
  const stack = new DomainStack(app, stackId, {
    env,
    domainName: domain.name,
    routes: domain.routes,
    subscriptions: domain.subscriptions,
  });
  stack.addDependency(frontDoor);
}

// Channels (L2): composition views that fan in to L1 resources. Same builder,
// each mounted at the channel's base path on the front door.
for (const channel of discoverChannels()) {
  const stackId = `FlexMiniChannel${channel.name.charAt(0).toUpperCase()}${channel.name.slice(1)}`;
  const stack = new DomainStack(app, stackId, {
    env,
    domainName: channel.name,
    routes: channel.routes,
    subscriptions: channel.subscriptions,
  });
  stack.addDependency(frontDoor);
}
