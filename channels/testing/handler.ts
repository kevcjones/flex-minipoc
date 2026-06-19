import { createHandler, html } from "@flex/sdk/http";

/**
 * Runs the interaction patterns against the DVLA domain over the back-door and
 * renders a single HTML report. Each page load performs real calls (including
 * mutations), so the before/after sections reflect live state.
 */

// The back-door (gateway host), injected by the builder for execution routes.
const BASE = (process.env.FLEX_FRONT_DOOR_URL ?? "").replace(/\/$/, "");
// A fixed demo identity so calls are consistent and UDP scoping is stable.
const USER = "7";

interface Call {
  label: string;
  method: string;
  path: string;
  status: number;
  ms: number;
  body: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(label: string, method: string, path: string, body?: unknown): Promise<Call> {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "x-user-id": USER,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { label, method, path, status: res.status, ms: Date.now() - started, body: text };
}

interface Pattern {
  title: string;
  blurb: string;
  diagram: string;
  calls: Call[];
}

async function runScenario(): Promise<Pattern[]> {
  // Independent reads and the "before" snapshots run concurrently to keep the
  // page fast (each back-door call re-runs the authorizer and hits the upstream).
  const [user, profile, prefBefore, logBefore, vehicleSeenBefore] =
    await Promise.all([
      call("forwarded verbatim", "GET", "/dvla/v1/user"),
      call("reshaped in the gateway", "GET", "/dvla/v1/profile"),
      call("preference before", "GET", "/dvla/v1/preferences"),
      call("activity before", "GET", "/dvla/v1/activity-log"),
      call("vehicle-seen before", "GET", "/dvla/v1/vehicle-seen"),
    ]);

  // C. one /vehicle call fires both effects: udpWrite (inline) and emitEvent
  // (off the hot path). Read the sync side back immediately.
  const vehicle = await call("read + 2 effects", "GET", "/dvla/v1/vehicle");
  const prefAfter = await call("preference after", "GET", "/dvla/v1/preferences");

  // D. off-hot-path write, read back (dynamic before/after via a unique note).
  const note = `run-${new Date().toISOString()}`;
  const publish = await call("publish (202, no Lambda)", "POST", "/dvla/v1/activity", { note });
  // Poll briefly for the async write, bounded to stay well under the Lambda
  // timeout (the page can be reloaded if the consumer has not caught up yet).
  let logAfter = await call("activity after", "GET", "/dvla/v1/activity-log");
  for (let i = 0; i < 8 && !logAfter.body.includes(note); i++) {
    await sleep(700);
    logAfter = await call(`activity after (poll ${i + 1})`, "GET", "/dvla/v1/activity-log");
  }

  // E. the off-hot-path emitEvent from the /vehicle call above: read it back.
  let vehicleSeenAfter = await call("vehicle-seen after", "GET", "/dvla/v1/vehicle-seen");
  for (let i = 0; i < 6 && !vehicleSeenAfter.body.includes('"seen":true'); i++) {
    await sleep(600);
    vehicleSeenAfter = await call(`vehicle-seen after (poll ${i + 1})`, "GET", "/dvla/v1/vehicle-seen");
  }

  return [
    {
      title: "1. Read pass-through (tier 1)",
      blurb:
        "The gateway forwards to the upstream and returns the bytes verbatim. No compute. Note the full record (including <code>password</code>) is passed through unchanged.",
      diagram: [
        "sequenceDiagram",
        "  participant C as Client",
        "  participant G as Gateway (HTTP_PROXY)",
        "  participant U as Upstream",
        "  C->>G: GET /dvla/v1/user",
        "  G->>U: GET /users/{id}",
        "  U-->>G: User JSON",
        "  G-->>C: same bytes (verbatim)",
      ].join("\n"),
      calls: [user],
    },
    {
      title: "2. Read transform (tier 2)",
      blurb:
        "Same upstream as above, but the gateway reshapes the response with VTL: it flattens the <code>User</code> envelope, renames fields, drops <code>password</code>, and stamps <code>source</code>. Still no Lambda.",
      diagram: [
        "sequenceDiagram",
        "  participant C as Client",
        "  participant G as Gateway (VTL, no Lambda)",
        "  participant U as Upstream",
        "  C->>G: GET /dvla/v1/profile",
        "  G->>U: GET /users/{id}",
        "  U-->>G: User envelope",
        "  Note over G: VTL reshape (flatten, drop password)",
        "  G-->>C: flat Profile",
      ].join("\n"),
      calls: [profile],
    },
    {
      title: "3. Read execution + sync write to Dynamo (tier 3)",
      blurb:
        "A Lambda fetches the vehicle and writes the <code>hasVehicle</code> preference to UDP on the hot path. The preference read before and after reflects the store (the value is a boolean preference, so it persists once set).",
      diagram: [
        "sequenceDiagram",
        "  participant C as Client",
        "  participant L as Lambda",
        "  participant U as Upstream",
        "  participant D as UDP (Dynamo)",
        "  C->>L: GET /dvla/v1/vehicle",
        "  L->>U: GET /cars/{id}",
        "  U-->>L: Car",
        "  L->>D: put hasVehicle=true (sync)",
        "  L-->>C: Vehicle",
      ].join("\n"),
      calls: [prefBefore, vehicle, prefAfter],
    },
    {
      title: "4. Write off the hot path + read back",
      blurb:
        "The gateway publishes to EventBridge via VTL and returns <code>202</code> immediately (no Lambda on the write). An async consumer writes UDP. The note is unique per page load, so <em>activity before</em> shows the previous run and <em>activity after</em> shows this one once the consumer catches up.",
      diagram: [
        "sequenceDiagram",
        "  participant C as Client",
        "  participant G as Gateway (VTL)",
        "  participant E as EventBridge",
        "  participant K as Consumer Lambda",
        "  participant D as UDP (Dynamo)",
        "  C->>G: POST /dvla/v1/activity",
        "  G->>E: PutEvents (VTL, no Lambda)",
        "  G-->>C: 202 accepted (immediately)",
        "  E->>K: event (async)",
        "  K->>D: put activity.last",
        "  Note over C,D: later GET /activity-log reads it back",
      ].join("\n"),
      calls: [logBefore, publish, logAfter],
    },
    {
      title: "5. Execution + emit off the hot path (carries the response)",
      blurb:
        "The single <code>/vehicle</code> call above ran two effects: <code>udpWrite</code> inline (pattern 3) and <code>emitEvent</code> off the hot path. Unlike the request-only publish route, this event carries <em>ctx.data</em> (the vehicle the handler fetched), so the consumer can persist the response. <em>vehicle-seen before/after</em> shows it landing.",
      diagram: [
        "sequenceDiagram",
        "  participant C as Client",
        "  participant L as Lambda (/vehicle)",
        "  participant E as EventBridge",
        "  participant K as Consumer Lambda",
        "  participant D as UDP (Dynamo)",
        "  C->>L: GET /dvla/v1/vehicle",
        "  L->>D: udpWrite hasVehicle (inline)",
        "  L->>E: emitEvent vehicle.seen (off hot path, carries the car)",
        "  L-->>C: Vehicle",
        "  E->>K: event (async)",
        "  K->>D: put vehicle.last = car",
        "  Note over C,D: GET /dvla/v1/vehicle-seen reads it back",
      ].join("\n"),
      calls: [vehicleSeenBefore, vehicle, vehicleSeenAfter],
    },
  ];
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function pretty(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function renderCall(c: Call): string {
  const cls = c.status < 300 ? "ok" : "err";
  return `
    <div class="call">
      <div class="call-head">
        <span class="method">${esc(c.method)}</span>
        <span class="path">${esc(c.path)}</span>
        <span class="status ${cls}">${c.status}</span>
        <span class="ms">${c.ms} ms</span>
        <span class="lbl">${esc(c.label)}</span>
      </div>
      <pre class="body">${esc(pretty(c.body))}</pre>
    </div>`;
}

function renderPattern(p: Pattern): string {
  const total = p.calls.reduce((n, c) => n + c.ms, 0);
  return `
  <section>
    <h2>${esc(p.title)} <span class="total">${total} ms total</span></h2>
    <p class="blurb">${p.blurb}</p>
    <pre class="mermaid">${esc(p.diagram)}</pre>
    ${p.calls.map(renderCall).join("")}
  </section>`;
}

function renderPage(patterns: Pattern[]): string {
  const when = new Date().toISOString();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FLEX interaction patterns</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 2rem; max-width: 60rem; margin-inline: auto; }
  h1 { margin-bottom: .25rem; }
  .meta { color: #888; margin-top: 0; }
  section { border: 1px solid #8884; border-radius: 10px; padding: 1rem 1.25rem; margin: 1.5rem 0; }
  h2 { margin: 0 0 .5rem; font-size: 1.15rem; }
  .total { float: right; font-weight: 400; color: #888; font-size: .85rem; }
  .blurb { margin: .25rem 0 1rem; color: #444; }
  @media (prefers-color-scheme: dark) { .blurb { color: #bbb; } }
  .mermaid { background: #8881; border-radius: 8px; padding: 1rem; overflow-x: auto; }
  .call { border: 1px solid #8883; border-radius: 8px; margin: .6rem 0; overflow: hidden; }
  .call-head { display: flex; gap: .6rem; align-items: center; padding: .4rem .6rem; background: #8881; font-size: .85rem; flex-wrap: wrap; }
  .method { font-weight: 700; }
  .path { font-family: ui-monospace, monospace; }
  .status { font-weight: 700; }
  .status.ok { color: #2a8a2a; }
  .status.err { color: #c33; }
  .ms { color: #888; }
  .lbl { color: #888; font-style: italic; margin-left: auto; }
  pre.body { margin: 0; padding: .6rem .8rem; overflow-x: auto; font-family: ui-monospace, monospace; font-size: .8rem; max-height: 22rem; }
  code { font-family: ui-monospace, monospace; background: #8882; padding: 0 .2em; border-radius: 3px; }
</style>
</head>
<body>
  <h1>FLEX interaction patterns</h1>
  <p class="meta">Live run via the <code>testing</code> channel over the back-door, demo user ${USER}. Generated ${when}. Reload to run again.</p>
  ${patterns.map(renderPattern).join("")}
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: true, theme: 'neutral' });
  </script>
</body>
</html>`;
}

export const handler = createHandler(async () => {
  if (!BASE) return html("<h1>FLEX_FRONT_DOOR_URL not set</h1>", 500);
  const patterns = await runScenario();
  return html(renderPage(patterns));
});
