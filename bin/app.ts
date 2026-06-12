#!/usr/bin/env node
import "source-map-support/register";
import { App } from "aws-cdk-lib";

import { INTERNAL_HOST, REGION } from "../config";
import { UdpStack } from "../core/udp/stack";
import { TelemetryStack } from "../core/telemetry/stack";
import { RequestStack } from "../core/request/stack";
import { MockDvlaStack } from "../external/mock-dvla/stack";
import { FrontDoorStack } from "../platform/front-door/stack";
import { DomainStack } from "../platform/domains/stack";
import { discoverDomains } from "../platform/domains/discover";

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

// A stand-in for the external DVLA system (not part of Flex). Gives the
// pass-through a real upstream to forward to and the execution route something
// to fetch.
const mockDvla = new MockDvlaStack(app, "FlexMiniMockDvla", { env });
mockDvla.addDependency(frontDoor);

// Placeholders that pass-through targets ({mockDvla}) resolve to. Literal URLs
// (the internal host), so no cross-stack token plumbing.
const targets = { mockDvla: `https://${INTERNAL_HOST}/mock-dvla` };

// Domains and their routes come entirely from the domains/ folder tree.
for (const domain of discoverDomains()) {
  const stackId = `FlexMini${domain.name.charAt(0).toUpperCase()}${domain.name.slice(1)}`;
  const stack = new DomainStack(app, stackId, {
    env,
    domainName: domain.name,
    routes: domain.routes,
    targets,
  });
  stack.addDependency(frontDoor);
}
