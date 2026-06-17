import { createView, reply } from "@flex/front-door";

/**
 * The mobile driving page: one server-side fan-out across two L1 resources,
 * assembled into a mobile-shaped payload. Identity is resolved once by the
 * channel gateway and carried down by the client.
 *
 * Drift-safe: ctx.get returns { ok } results, so the view degrades (drops the
 * vehicle) rather than crashing when an upstream is off-contract. Build-time
 * safe: the field reads are typed from the L1 contracts, so removing a field
 * from the User or Vehicle schema breaks this file at `npm run typecheck`.
 */
export const handler = createView(async (ctx) => {
  const [user, vehicle] = await Promise.all([
    ctx.get("GET /dvla/v1/user"),
    ctx.get("GET /dvla/v1/vehicle"),
  ]);

  if (!user.ok) return reply(502, { error: "user unavailable" });

  return {
    title: `${user.data.User.first_name} ${user.data.User.last_name}`,
    vehicle: vehicle.ok
      ? `${vehicle.data.car} ${vehicle.data.car_model} (${vehicle.data.car_model_year})`
      : null,
    vin: vehicle.ok ? vehicle.data.car_vin : null,
  };
});
