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
import { runPostHooks } from "./hooks";

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

function isHandlerResult(value: unknown): value is HandlerResult {
  return (
    typeof value === "object" &&
    value !== null &&
    ("status" in value || "data" in value)
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

    const status = isHandlerResult(result) ? (result.status ?? 200) : 200;
    const data = isHandlerResult(result) ? result.data : result;

    // Post-hooks declared on the route, run inline after the handler returns.
    await runPostHooks(process.env.FLEX_POST_HOOKS, { data, input });

    return {
      statusCode: status,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  };
}
