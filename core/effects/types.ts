import type { HandlerInput } from "../http/sdk";

/** What every effect receives: the handler's returned data and the request input. */
export interface EffectContext {
  data: unknown;
  input: HandlerInput;
}
