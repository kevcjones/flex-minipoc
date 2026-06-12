import { call } from "./client";

/**
 * A channel-owned composition: the "driving page" view, assembled from two
 * front-door resources in one server-side fan-out. This is the shape a channel
 * team owns; the platform hosts it.
 *
 * Build-time proof: every field access below is typed from the contracts. The
 * user is the wrapped pass-through shape (`user.User.*`); the vehicle is the
 * unwrapped execution shape (`vehicle.*`). Remove `first_name` from the User
 * schema or `car_vin` from Vehicle and this file stops compiling, before
 * anything deploys. Run `npm run typecheck:consumer`.
 */
export async function drivingPage(userId: string) {
  const [user, vehicle] = await Promise.all([
    call("GET /dvla/v1/user", userId),
    call("GET /dvla/v1/vehicle", userId),
  ]);

  return {
    title: `${user.User.first_name} ${user.User.last_name}`,
    vehicle: `${vehicle.car} ${vehicle.car_model} (${vehicle.car_model_year})`,
    vin: vehicle.car_vin,
  };
}
