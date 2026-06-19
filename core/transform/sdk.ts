/**
 * The response transform tier (@flex/sdk/transform).
 *
 * Tier 2 of the route model: a pass-through that reshapes the upstream response
 * in the gateway with VTL, no Lambda and no cold start. Contributors author a
 * declarative spec in route.ts; the builder compiles it to a VTL integration
 * response template at synth.
 *
 * This is a config interpreter, not a compiler. It reads a fixed, declarative
 * vocabulary (a typed object, data not code) and emits VTL. It deliberately
 * does not parse TypeScript source: that is the general TS-to-VTL path that the
 * prior art (Functionless) showed is brittle and hard to maintain. Anything the
 * vocabulary cannot express (cross-field logic, external lookups, multi-source
 * composition) is a tier-3 execution Lambda, not a bigger DSL.
 *
 * Vocabulary, all expressed as an output-shape map (output key -> source):
 *  - pick / rename / flatten: select a source JSONPath into an output key.
 *  - omit: implicit. List what you keep; an unlisted field never appears.
 *  - default: substitute a literal when the source is missing or empty.
 *  - coalesce: first non-empty of several source paths, then an optional default.
 *  - const: a literal value, no source.
 */

/** A literal usable as a const value or a default. Kept to JSON scalars. */
export type TransformLiteral = string | number | boolean;

/**
 * How one output field is produced.
 *  - string shorthand: a source JSONPath, e.g. "$.User.first_name".
 *  - { from, default? }: a source path, with an optional fallback literal.
 *  - { coalesce, default? }: first non-empty source path, then a fallback.
 *  - { const }: a literal, no source.
 */
export type TransformField =
  | string
  | { from: string; default?: TransformLiteral }
  | { coalesce: string[]; default?: TransformLiteral }
  | { const: TransformLiteral };

export interface TransformSpec {
  /** Output key -> source. Keys not listed are omitted (pick semantics). */
  fields: Record<string, TransformField>;
}

/**
 * Compile a transform spec to a VTL integration response template.
 *
 * It builds the JSON object as text, reading each value with $input.json (which
 * returns the value already correctly typed and quoted, numbers bare and strings
 * quoted) rather than $util.toJson of a built map. API Gateway's $util.toJson
 * returns empty for values pulled via $input.path, so the map-and-toJson idiom
 * silently produces an empty body; $input.json is the reliable primitive. Every
 * declared field always emits (the spec is bound to the output contract, so all
 * keys are required), which keeps comma placement static and removes the classic
 * conditional-comma fragility. Presence is detected with $input.path so default
 * and coalesce fall back when a source is missing.
 */
export function compileToVtl(spec: TransformSpec): string {
  const preamble: string[] = [];
  const members: string[] = [];
  let i = 0;
  for (const [key, field] of Object.entries(spec.fields)) {
    const { setup, value } = compileValue(field, i++);
    preamble.push(...setup);
    members.push(`  ${JSON.stringify(key)}: ${value}`);
  }
  return [...preamble, "{", members.join(",\n"), "}"].join("\n");
}

/**
 * Compile a VTL request template that publishes the request to EventBridge
 * (PutEvents) off the hot path, no Lambda. The detail spec maps the request
 * (read via $input) into the event detail; the authoriser userId is stamped in
 * so the async consumer can scope the write. PutEvents needs Detail to be a JSON
 * string, so it is built as an escaped string of string-valued members (string
 * paths via escapeJavaScript, const as a literal).
 */
export function compilePutEvents(opts: {
  source: string;
  detailType: string;
  busName: string;
  detail: TransformSpec;
}): string {
  const members = ['\\"userId\\": \\"$context.authorizer.userId\\"'];
  for (const [key, field] of Object.entries(opts.detail.fields)) {
    members.push(eventDetailMember(key, field));
  }
  const detail = `{ ${members.join(", ")} }`;
  return [
    "{",
    '  "Entries": [{',
    `    "Source": ${JSON.stringify(opts.source)},`,
    `    "DetailType": ${JSON.stringify(opts.detailType)},`,
    `    "EventBusName": ${JSON.stringify(opts.busName)},`,
    `    "Detail": "${detail}"`,
    "  }]",
    "}",
  ].join("\n");
}

/** A field's VTL: `setup` lines run before the object, `value` goes after the key. */
function compileValue(
  field: TransformField,
  i: number,
): { setup: string[]; value: string } {
  if (typeof field === "string") {
    return { setup: [], value: `$input.json('${field}')` };
  }
  if ("const" in field) {
    return { setup: [], value: literal(field.const) };
  }
  if ("coalesce" in field) {
    const v = `$v${i}`;
    const setup = [`#set(${v} = "")`];
    field.coalesce.forEach((path, j) => {
      const p = `p${i}_${j}`;
      setup.push(`#set($${p} = $input.path('${path}'))`);
      setup.push(
        `#if(${v} == "")#if("$!${p}" != "")#set(${v} = $input.json('${path}'))#end#end`,
      );
    });
    if (field.default !== undefined) {
      setup.push(`#if(${v} == "")#set(${v} = '${literal(field.default)}')#end`);
    }
    return { setup, value: v };
  }
  // { from, default? }
  if (field.default === undefined) {
    return { setup: [], value: `$input.json('${field.from}')` };
  }
  const v = `$v${i}`;
  const p = `$p${i}`;
  return {
    setup: [
      `#set(${p} = $input.path('${field.from}'))`,
      `#set(${v} = $input.json('${field.from}'))`,
      `#if("$!${p.slice(1)}" == "")#set(${v} = '${literal(field.default)}')#end`,
    ],
    value: v,
  };
}

/** A PutEvents detail member as escaped JSON: string paths escaped, const literal. */
function eventDetailMember(key: string, field: TransformField): string {
  if (typeof field === "string") {
    return `\\"${key}\\": \\"$util.escapeJavaScript($input.path('${field}'))\\"`;
  }
  if ("const" in field) {
    return `\\"${key}\\": \\"${String(field.const)}\\"`;
  }
  if ("from" in field) {
    return `\\"${key}\\": \\"$util.escapeJavaScript($input.path('${field.from}'))\\"`;
  }
  throw new Error(
    `event detail field "${key}": coalesce is not supported in publish routes`,
  );
}

/** Render a TS literal as a JSON-text VTL value: strings quoted, numbers/bools bare. */
function literal(value: TransformLiteral): string {
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}
