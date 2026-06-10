/**
 * Outbound destination allow-list, maintained by the platform team.
 *
 * Default-deny: the request gateway will only forward to a host that matches an
 * entry here (exact host, or a subdomain of an entry). Everything else is
 * blocked. In production this belongs in the network layer (an egress firewall)
 * so it cannot be bypassed by application code; here it is enforced in the
 * forwarder and injected as config.
 */
export const allowlist: string[] = ["api.postcodes.io"];
