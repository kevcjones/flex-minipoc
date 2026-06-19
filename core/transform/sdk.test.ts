import assert from "node:assert/strict";
import test from "node:test";

import { compilePutEvents, compileToVtl } from "./sdk";

test("emits a JSON object literal (map-free, no toJson)", () => {
  const vtl = compileToVtl({ fields: { id: "$.User.id" } });
  assert.doesNotMatch(vtl, /toJson/);
  assert.match(vtl, /\{\n {2}"id": \$input\.json\('\$\.User\.id'\)\n\}/);
});

test("string field reads its source path with $input.json (typed, quoted)", () => {
  const vtl = compileToVtl({ fields: { firstName: "$.User.first_name" } });
  assert.match(vtl, /"firstName": \$input\.json\('\$\.User\.first_name'\)/);
});

test("omit is implicit: an unlisted source field never appears", () => {
  const vtl = compileToVtl({ fields: { id: "$.User.id" } });
  assert.doesNotMatch(vtl, /password/);
});

test("default falls back to a literal when the source path is absent", () => {
  const vtl = compileToVtl({
    fields: { title: { from: "$.User.job_title", default: "Unknown" } },
  });
  assert.match(vtl, /\$input\.path\('\$\.User\.job_title'\)/);
  assert.match(vtl, /#set\(\$v0 = '"Unknown"'\)#end/);
  assert.match(vtl, /"title": \$v0/);
});

test("coalesce tries each path in order, then the default", () => {
  const vtl = compileToVtl({
    fields: { name: { coalesce: ["$.a", "$.b"], default: "n/a" } },
  });
  const aAt = vtl.indexOf("$.a");
  const bAt = vtl.indexOf("$.b");
  assert.ok(aAt !== -1 && bAt !== -1 && aAt < bAt, "paths tried in order");
  assert.match(vtl, /#set\(\$v0 = '"n\/a"'\)#end/);
  assert.match(vtl, /"name": \$v0/);
});

test("const emits a JSON literal with correct typing", () => {
  assert.match(
    compileToVtl({ fields: { source: { const: "dvla" } } }),
    /"source": "dvla"/,
  );
  assert.match(compileToVtl({ fields: { version: { const: 1 } } }), /"version": 1/);
  assert.match(compileToVtl({ fields: { live: { const: true } } }), /"live": true/);
});

test("the profile demo shape exercises pick, omit, default, coalesce and const", () => {
  const vtl = compileToVtl({
    fields: {
      id: "$.User.id",
      firstName: "$.User.first_name",
      lastName: "$.User.last_name",
      email: "$.User.email",
      jobTitle: { from: "$.User.job_title", default: "Unknown" },
      displayName: {
        coalesce: ["$.User.first_name", "$.User.email"],
        default: "Anonymous",
      },
      source: { const: "dvla" },
    },
  });
  assert.doesNotMatch(vtl, /password/);
  assert.doesNotMatch(vtl, /toJson/);
  for (const key of ["id", "firstName", "lastName", "email"]) {
    assert.match(vtl, new RegExp(`"${key}": \\$input\\.json`));
  }
  assert.match(vtl, /'"Unknown"'/);
  assert.match(vtl, /'"Anonymous"'/);
  assert.match(vtl, /"source": "dvla"/);
});

test("compilePutEvents builds a PutEvents request: stamped userId, escaped detail", () => {
  const vtl = compilePutEvents({
    source: "flex.dvla.activity",
    detailType: "activity.recorded",
    busName: "flex-mini-dvla",
    detail: { fields: { note: "$.note" } },
  });
  assert.match(vtl, /"Source": "flex\.dvla\.activity"/);
  assert.match(vtl, /"DetailType": "activity\.recorded"/);
  assert.match(vtl, /"EventBusName": "flex-mini-dvla"/);
  assert.doesNotMatch(vtl, /toJson/);
  // userId stamped from the authoriser, as an escaped JSON string member
  assert.match(vtl, /\\"userId\\": \\"\$context\.authorizer\.userId\\"/);
  // the detail value is read from the request body and escaped
  assert.match(
    vtl,
    /\\"note\\": \\"\$util\.escapeJavaScript\(\$input\.path\('\$\.note'\)\)\\"/,
  );
});
