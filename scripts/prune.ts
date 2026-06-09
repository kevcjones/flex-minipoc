/**
 * Prune orphaned stacks.
 *
 * Deleting a domain folder removes its stack from synthesis, but `cdk deploy`
 * never deletes a stack that simply vanished. This makes removal symmetric with
 * addition: it deletes any deployed FlexMini* stack the app no longer defines.
 *
 *   npx ts-node scripts/prune.ts            # delete orphans
 *   npx ts-node scripts/prune.ts --dry-run  # just report
 *
 * Safety: the app's synthesized list is the source of truth. If synthesis
 * produces nothing (a build error), we abort rather than delete everything.
 */
import { execSync } from "node:child_process";

const REGION = "us-east-1";
const PREFIX = "FlexMini";
const dryRun = process.argv.includes("--dry-run");

function sh(cmd: string): string {
  return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] });
}

// 1. Stacks the app currently defines (source of truth).
const synthesized = new Set(
  sh("npx cdk list")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith(PREFIX)),
);

// Safety: a healthy app always has the front door + core stacks. An empty set
// means synthesis failed; do not prune.
if (synthesized.size === 0) {
  console.error("No synthesized stacks found; aborting to avoid deleting live stacks.");
  process.exit(1);
}

// 2. Deployed FlexMini* stacks in an active state.
const deployed: string[] = JSON.parse(
  sh(
    `aws cloudformation list-stacks --region ${REGION} ` +
      "--stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE " +
      "UPDATE_ROLLBACK_COMPLETE ROLLBACK_COMPLETE " +
      `--query "StackSummaries[?starts_with(StackName, '${PREFIX}')].StackName" ` +
      "--output json",
  ),
);

// 3. Orphans = deployed but no longer defined by the app.
const orphans = deployed.filter((name) => !synthesized.has(name));

if (orphans.length === 0) {
  console.log("Nothing to prune; deployed stacks all match the app.");
  process.exit(0);
}

console.log(`Orphaned stacks: ${orphans.join(", ")}`);

if (dryRun) {
  console.log("Dry run; nothing deleted.");
  process.exit(0);
}

for (const name of orphans) {
  console.log(`Deleting ${name} ...`);
  sh(`aws cloudformation delete-stack --region ${REGION} --stack-name ${name}`);
  sh(`aws cloudformation wait stack-delete-complete --region ${REGION} --stack-name ${name}`);
  console.log(`Deleted ${name}.`);
}

console.log("Prune complete.");
