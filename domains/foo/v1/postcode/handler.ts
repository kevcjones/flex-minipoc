import { createHandler } from "@flex/sdk/http";
import { request } from "@flex/sdk/request";

/**
 * A domain making an outbound call. It just asks the SDK to fetch a URL and
 * shapes the result. It has no idea the call is relayed through the egress
 * gateway or that an allow-list let it through.
 *
 * Try ?postcode=SW1A1AA
 */
export const handler = createHandler(async ({ query }) => {
  const postcode = (query.postcode ?? "SW1A1AA").replace(/\s/g, "");

  const res = await request.get<{ result?: Record<string, unknown> }>(
    `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`,
  );

  const r = res.result ?? {};
  return {
    postcode,
    region: r.region,
    country: r.country,
    location: { lat: r.latitude, lng: r.longitude },
  };
});
