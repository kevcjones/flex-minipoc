/**
 * Identity capability (@flex/sdk/identity).
 *
 * Defines the auth strategies a route can request by name. The strategy is
 * implemented by the authorizer in ./handlers and wired onto routes by the
 * domain gateway builder. Domains never call it; they reference it by name in
 * their route declaration, so this capability's SDK surface is the strategy
 * vocabulary, not a runtime client. (It is the mirror of core/http, which is a
 * client with no service: this is a service with no client.)
 *
 * There is no stack.ts here because the authorizer lambda is deployed per
 * domain gateway by the builder, not as a standalone stack.
 */
export type AuthStrategy = "none" | "udp-linked:dvla";
