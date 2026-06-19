/**
 * HTTP SDK module (@flex/sdk/http).
 *
 * Platform-owned framework code, not a deployable capability. It is the only
 * place that knows the API Gateway request/response shape, so domain handlers
 * never have to. A domain handler receives a clean input and returns plain
 * data; this wrapper adapts both ends.
 *
 * Convention note: a core/<name>/ folder always exposes an SDK module (sdk.ts);
 * deployable capabilities (udp, telemetry) additionally have stack.ts +
 * handlers/. http is an SDK-only module with no service behind it.
 */
import { runEffects } from "../effects/sdk";

export interface HandlerInput {
  params: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  body: unknown;
  /** Resolved by the authorizer and passed through; the handler never resolves it. */
  auth: { userId?: string; linkingId?: string };
}

export interface HandlerResult {
  status?: number;
  data?: unknown;
  /** Response content type. Defaults to application/json (data is serialised). */
  contentType?: string;
}

type DomainHandler = (
  input: HandlerInput,
) => Promise<HandlerResult | unknown> | HandlerResult | unknown;

interface ApiGatewayEvent {
  pathParameters?: Record<string, string | undefined> | null;
  queryStringParameters?: Record<string, string | undefined> | null;
  body?: string | null;
  requestContext?: {
    authorizer?: Record<string, string | undefined> | null;
  } | null;
}

const CONTROL = Symbol.for("flex.http.control");

/**
 * Return an explicit non-200 (or custom-status) response from a handler. Plain
 * data returns still become 200; use reply() only when you need to set the
 * status. A branded marker is used so that domain data which merely happens to
 * have a `status` or `data` field is never mistaken for a control envelope.
 */
export function reply(status: number, data?: unknown): HandlerResult {
  return { [CONTROL]: true, status, data } as HandlerResult;
}

/** Return an HTML response: text/html, body sent as-is rather than JSON. */
export function html(body: string, status = 200): HandlerResult {
  return {
    [CONTROL]: true,
    status,
    data: body,
    contentType: "text/html",
  } as HandlerResult;
}

function isHandlerResult(value: unknown): value is HandlerResult {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[CONTROL] === true
  );
}

/**
 * Wrap a plain domain function into an API Gateway handler. The domain function
 * returns either plain data (becomes 200) or { status, data } for control.
 */
export function createHandler(fn: DomainHandler) {
  return async (event: ApiGatewayEvent) => {
    const authorizer = event.requestContext?.authorizer ?? {};
    const input: HandlerInput = {
      params: event.pathParameters ?? {},
      query: event.queryStringParameters ?? {},
      body: event.body ? JSON.parse(event.body) : undefined,
      auth: { userId: authorizer.userId, linkingId: authorizer.linkingId },
    };

    const result = await fn(input);

    const control = isHandlerResult(result);
    const status = control ? (result.status ?? 200) : 200;
    const data = control ? result.data : result;
    const contentType = control ? result.contentType : undefined;

    // Effects declared on the route, run after the handler returns.
    await runEffects(process.env.FLEX_EFFECTS, { data, input });

    const json = !contentType || contentType.includes("json");
    return {
      statusCode: status,
      headers: { "Content-Type": contentType ?? "application/json" },
      body: json ? JSON.stringify(data) : String(data),
    };
  };
}
