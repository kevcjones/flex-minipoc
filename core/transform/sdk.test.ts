import assert from "node:assert/strict";
import test from "node:test";

import { compileToVtl } from "./sdk";

test("builds a map and serialises it once with toJson", () => {
  const vtl = compileToVtl({ fields: { id: "$.User.id" } });
  assert.match(vtl, /^#set\(\$out = \{\}\)/);
  assert.match(vtl, /\$util\.toJson\(\$out\)\s*$/);
});

test("string field: reads its source path and puts the output key", () => {
  const vtl = compileToVtl({ fields: { firstName: "$.User.first_name" } });
  assert.match(vtl, /#set\(\$v = \$input\.path\('\$\.User\.first_name'\)\)/);
  assert.match(vtl, /\$out\.put\("firstName", \$v\)/);
});

test("rename and flatten are just a chosen output key over a nested path", () => {
  const vtl = compileToVtl({ fields: { firstName: "$.User.first_name" } });
  // output key differs from the leaf (rename) and the source is nested (flatten)
  assert.match(vtl, /\$out\.put\("firstName", \$v\)/);
  assert.match(vtl, /'\$\.User\.first_name'/);
});

test("omit is implicit: an unlisted source field never appears", () => {
  const vtl = compileToVtl({ fields: { id: "$.User.id" } });
  assert.doesNotMatch(vtl, /password/);
});

test("default substitutes a literal when the source is empty", () => {
  const vtl = compileToVtl({
    fields: { title: { from: "$.User.job_title", default: "Unknown" } },
  });
  assert.match(vtl, /#if\("\$!v" == ""\)#set\(\$v = "Unknown"\)#end/);
});

test("coalesce tries each path in order, then the default", () => {
  const vtl = compileToVtl({
    fields: { name: { coalesce: ["$.a", "$.b"], default: "n/a" } },
  });
  const aAt = vtl.indexOf("$.a");
  const bAt = vtl.indexOf("$.b");
  assert.ok(aAt !== -1 && bAt !== -1 && aAt < bAt, "paths tried in order");
  assert.match(vtl, /#set\(\$v = "n\/a"\)/);
});

test("const emits a literal with correct VTL typing", () => {
  const str = compileToVtl({ fields: { source: { const: "dvla" } } });
  assert.match(str, /\$out\.put\("source", "dvla"\)/);

  const num = compileToVtl({ fields: { version: { const: 1 } } });
  assert.match(num, /\$out\.put\("version", 1\)/);

  const bool = compileToVtl({ fields: { live: { const: true } } });
  assert.match(bool, /\$out\.put\("live", true\)/);
});

test("a put is captured in $d so only the final JSON is printed", () => {
  const vtl = compileToVtl({ fields: { id: "$.User.id" } });
  assert.match(vtl, /#set\(\$d = \$out\.put/);
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
  // omit: password is never selected
  assert.doesNotMatch(vtl, /password/);
  // pick/rename/flatten: each output key appears
  for (const key of ["id", "firstName", "lastName", "email"]) {
    assert.match(vtl, new RegExp(`\\$out\\.put\\("${key}"`));
  }
  // default, coalesce, const
  assert.match(vtl, /#set\(\$v = "Unknown"\)/);
  assert.match(vtl, /#set\(\$v = "Anonymous"\)/);
  assert.match(vtl, /\$out\.put\("source", "dvla"\)/);
});
