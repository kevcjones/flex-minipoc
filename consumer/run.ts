import { drivingPage } from "./driving-page";

/**
 * Verification helper (not deployed). Calls the live front door and assembles
 * the driving page.
 *
 *   FLEX_BASE_URL=https://<public-host> npx ts-node consumer/run.ts [userId]
 */
async function main() {
  const userId = process.argv[2] ?? "demo-user";
  const page = await drivingPage(userId);
  console.log(JSON.stringify(page, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
