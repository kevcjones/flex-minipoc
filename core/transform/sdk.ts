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
 * The template builds a map and serialises it once with $util.toJson, which
 * gives correct JSON types and escaping for free (rather than concatenating a
 * JSON string by hand, the classic fragile approach). $input.path reads the
 * upstream body. A put into the map is captured in $d so it is not printed; the
 * only output is the final toJson. The inter-directive newlines render as
 * harmless leading whitespace before the JSON, which every parser tolerates.
 */
export function compileToVtl(spec: TransformSpec): string {
  const lines = ["#set($out = {})"];
  for (const [key, field] of Object.entries(spec.fields)) {
    lines.push(...compileField(key, field));
  }
  lines.push("$util.toJson($out)");
  return lines.join("\n");
}

function compileField(key: string, field: TransformField): string[] {
  const k = JSON.stringify(key);

  if (typeof field === "string") {
    return emitFrom(k, field, undefined);
  }
  if ("const" in field) {
    return [`#set($d = $out.put(${k}, ${literal(field.const)}))`];
  }
  if ("coalesce" in field) {
    const lines = ['#set($v = "")'];
    for (const path of field.coalesce) {
      lines.push(`#if("$!v" == "")#set($v = $input.path('${path}'))#end`);
    }
    if (field.default !== undefined) {
      lines.push(`#if("$!v" == "")#set($v = ${literal(field.default)})#end`);
    }
    lines.push(`#if("$!v" != "")#set($d = $out.put(${k}, $v))#end`);
    return lines;
  }
  return emitFrom(k, field.from, field.default);
}

function emitFrom(
  quotedKey: string,
  from: string,
  fallback: TransformLiteral | undefined,
): string[] {
  const lines = [`#set($v = $input.path('${from}'))`];
  if (fallback !== undefined) {
    lines.push(`#if("$!v" == "")#set($v = ${literal(fallback)})#end`);
  }
  lines.push(`#if("$!v" != "")#set($d = $out.put(${quotedKey}, $v))#end`);
  return lines;
}

/** Render a TS literal as a VTL literal: strings quoted, numbers/bools bare. */
function literal(value: TransformLiteral): string {
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}
