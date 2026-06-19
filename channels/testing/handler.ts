import { createHandler, html } from "@flex/sdk/http";

/**
 * The testing report. The Lambda serves a static page instantly (API Gateway
 * buffers responses, so it cannot stream progress); the browser then runs the
 * interaction patterns against the gateway and fills each panel in live as the
 * calls return. The page and /dvla/* are same-origin on the gateway host, so the
 * browser calls them directly. Reload to run again.
 */
const PAGE = `<!doctype html>
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
  .blurb { margin: .25rem 0 1rem; color: #666; }
  .state { font-size: .95rem; }
  .tick { font-weight: 700; }
  .tick.ok { color: #2a8a2a; }
  .tick.err { color: #c33; }
  .mermaid { background: #8881; border-radius: 8px; padding: 1rem; overflow-x: auto; }
  .pending { color: #888; font-style: italic; }
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
  <p class="meta">Live from your browser against the gateway, demo user 7. Panels fill in as each call returns. Reload to run again.</p>
  <div id="app"></div>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: false, theme: 'neutral' });

    const USER = '7';
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const pretty = (b) => { try { return JSON.stringify(JSON.parse(b), null, 2); } catch (e) { return b; } };

    async function call(label, method, path, body) {
      const t = performance.now();
      try {
        const res = await fetch(path, {
          method,
          headers: Object.assign({ 'x-user-id': USER }, body ? { 'content-type': 'application/json' } : {}),
          body: body ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        return { label, method, path, status: res.status, ms: Math.round(performance.now() - t), body: text };
      } catch (e) {
        return { label, method, path, status: 0, ms: Math.round(performance.now() - t), body: String(e) };
      }
    }

    const patterns = [
      {
        title: '1. Read pass-through',
        blurb: 'The gateway forwards to the upstream and returns the bytes verbatim. Note the full record (including <code>password</code>) comes through unchanged.',
        diagram: ['sequenceDiagram', '  participant C as Browser', '  participant G as Gateway', '  participant U as Upstream', '  C->>G: GET /dvla/v1/user', '  G->>U: GET /users/{id}', '  U-->>G: User JSON', '  G-->>C: same bytes'].join('\\n'),
        run: async (add) => { add(await call('forwarded verbatim', 'GET', '/dvla/v1/user')); },
      },
      {
        title: '2. Read transform (no Lambda)',
        blurb: 'Same upstream, but the gateway reshapes the response with VTL: flattened, renamed, <code>password</code> dropped, <code>source</code> stamped.',
        diagram: ['sequenceDiagram', '  participant C as Browser', '  participant G as Gateway (VTL)', '  participant U as Upstream', '  C->>G: GET /dvla/v1/profile', '  G->>U: GET /users/{id}', '  Note over G: VTL reshape', '  G-->>C: flat Profile'].join('\\n'),
        run: async (add) => { add(await call('reshaped in the gateway', 'GET', '/dvla/v1/profile')); },
      },
      {
        title: '3. Execution + sync write to Dynamo',
        blurb: 'A Lambda fetches the vehicle and writes the <code>hasVehicle</code> preference to UDP inline. The reads before and after show the store.',
        diagram: ['sequenceDiagram', '  participant C as Browser', '  participant L as Lambda', '  participant U as Upstream', '  participant D as UDP', '  C->>L: GET /dvla/v1/vehicle', '  L->>U: GET /cars/{id}', '  L->>D: put hasVehicle (sync)', '  L-->>C: Vehicle'].join('\\n'),
        run: async (add) => {
          add(await call('preference before', 'GET', '/dvla/v1/preferences'));
          add(await call('read + sync write', 'GET', '/dvla/v1/vehicle'));
          add(await call('preference after', 'GET', '/dvla/v1/preferences'));
        },
      },
      {
        title: '4. Write off the hot path',
        blurb: 'The gateway publishes to EventBridge via VTL and returns <code>202</code> at once (no Lambda on the write). A consumer writes UDP async; the note is unique per run, so <em>after</em> appears once the consumer catches up.',
        diagram: ['sequenceDiagram', '  participant C as Browser', '  participant G as Gateway (VTL)', '  participant E as EventBridge', '  participant K as Consumer', '  participant D as UDP', '  C->>G: POST /dvla/v1/activity', '  G->>E: PutEvents (no Lambda)', '  G-->>C: 202', '  E->>K: event (async)', '  K->>D: put activity.last'].join('\\n'),
        run: async (add) => {
          add(await call('activity before', 'GET', '/dvla/v1/activity-log'));
          const note = 'run-' + new Date().toISOString();
          add(await call('publish (202)', 'POST', '/dvla/v1/activity', { note: note }));
          for (let i = 0; i < 8; i++) {
            const r = await call(i ? 'activity after (poll ' + i + ')' : 'activity after', 'GET', '/dvla/v1/activity-log');
            add(r);
            if (r.body.indexOf(note) >= 0) break;
            await sleep(700);
          }
        },
      },
      {
        title: '5. Execution + emit off the hot path',
        blurb: 'The <code>/vehicle</code> call runs two effects: <code>udpWrite</code> inline (panel 3) and <code>emitEvent</code> off the hot path, carrying the fetched vehicle. <em>vehicle-seen before/after</em> shows it land.',
        diagram: ['sequenceDiagram', '  participant C as Browser', '  participant L as Lambda (/vehicle)', '  participant E as EventBridge', '  participant K as Consumer', '  participant D as UDP', '  C->>L: GET /dvla/v1/vehicle', '  L->>D: udpWrite (inline)', '  L->>E: emitEvent (off hot path)', '  L-->>C: Vehicle', '  E->>K: event (async)', '  K->>D: put vehicle.last'].join('\\n'),
        run: async (add) => {
          add(await call('vehicle-seen before', 'GET', '/dvla/v1/vehicle-seen'));
          add(await call('read + emit', 'GET', '/dvla/v1/vehicle'));
          for (let i = 0; i < 8; i++) {
            const r = await call(i ? 'vehicle-seen after (poll ' + i + ')' : 'vehicle-seen after', 'GET', '/dvla/v1/vehicle-seen');
            add(r);
            if (r.body.indexOf('"seen":true') >= 0) break;
            await sleep(700);
          }
        },
      },
    ];

    const rowHtml = (c) => {
      const cls = c.status >= 200 && c.status < 300 ? 'ok' : 'err';
      return '<div class="call"><div class="call-head">' +
        '<span class="tick ' + cls + '">' + (cls === 'ok' ? '\\u2713' : '\\u2717') + '</span>' +
        '<span class="method">' + esc(c.method) + '</span>' +
        '<span class="path">' + esc(c.path) + '</span>' +
        '<span class="status ' + cls + '">' + c.status + '</span>' +
        '<span class="ms">' + c.ms + ' ms</span>' +
        '<span class="lbl">' + esc(c.label) + '</span></div>' +
        '<pre class="body">' + esc(pretty(c.body)) + '</pre></div>';
    };

    const app = document.getElementById('app');
    patterns.forEach((p, i) => {
      const sec = document.createElement('section');
      sec.innerHTML = '<h2>' + esc(p.title) + ' <span class="state" id="state' + i + '">\\u23f3</span></h2><p class="blurb">' + p.blurb + '</p>' +
        '<pre class="mermaid">' + esc(p.diagram) + '</pre>' +
        '<div class="calls" id="calls' + i + '"><span class="pending">running...</span></div>';
      app.appendChild(sec);
    });
    mermaid.run({ querySelector: '.mermaid' });

    patterns.forEach((p, i) => {
      const box = document.getElementById('calls' + i);
      let first = true;
      const add = (c) => {
        if (first) { box.innerHTML = ''; first = false; }
        box.insertAdjacentHTML('beforeend', rowHtml(c));
      };
      p.run(add)
        .then(() => { document.getElementById('state' + i).textContent = '\\u2705'; })
        .catch((e) => {
          document.getElementById('state' + i).textContent = '\\u274c';
          box.insertAdjacentHTML('beforeend', '<div class="call err">' + esc(String(e)) + '</div>');
        });
    });
  </script>
</body>
</html>`;

export const handler = createHandler(() => html(PAGE));
