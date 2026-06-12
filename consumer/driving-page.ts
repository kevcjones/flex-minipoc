import { call } from "./client";

/**
 * A channel-owned composition: the "driving page" view, assembled from two
 * front-door resources in one server-side fan-out. This is the shape a channel
 * team owns; the platform hosts it.
 *
 * Build-time proof: every field access below is typed from the contracts. Remove
 * `name` from the User schema or `categories` from DrivingLicence and this file
 * stops compiling, before anything deploys. Run `npm run typecheck:consumer`.
 */
export async function drivingPage(userId: string) {
  const [user, licence] = await Promise.all([
    call("GET /dvla/v1/user", userId),
    call("GET /dvla/v1/driving-licence", userId),
  ]);

  return {
    title: `${user.name}'s driving licence`,
    licenceNumber: licence.licenceNumber,
    categories: licence.categories.join(", "),
    validTo: licence.validTo,
  };
}
