import { appendAudit } from "../lib/security-controls";
import { purgeExpiredRuns } from "../lib/store";
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

async function main() {
  const deleted = await purgeExpiredRuns();
  appendAudit({
    projectId: process.env.DEFAULT_PROJECT_ID ?? "local-demo",
    actorId: "retention-job",
    actorEmail: "system",
    action: "retention.purged",
    resourceType: "run",
    metadata: { deleted },
  });
  console.log(`retention purge complete: ${deleted} run(s) deleted`);
}

void main();
