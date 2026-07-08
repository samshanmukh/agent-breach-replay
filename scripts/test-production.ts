import { scenarios, toSecurityTrace } from "../lib/traces";
import { saveTrace, listRuns, getRun } from "../lib/store";
import { securityTraceSchema } from "../lib/validation";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const unsafe = scenarios.find((scenario) => scenario.mode === "unsafe");
assert(Boolean(unsafe), "unsafe scenario missing");

const trace = toSecurityTrace(unsafe!);
const parsed = securityTraceSchema.safeParse(trace);
assert(parsed.success, "valid trace should pass validation");

const invalid = securityTraceSchema.safeParse({ ...trace, events: [] });
assert(!invalid.success, "trace with no events should fail validation");

async function main() {
  const stored = await saveTrace(trace);
  assert(stored.trace.runId === trace.runId, "stored trace should preserve run id");
  assert(stored.findings.length > 0, "stored trace should include findings");

  const runs = await listRuns(trace.projectId);
  assert(
    runs.some((run) => run.trace.runId === trace.runId),
    "listRuns should include stored trace",
  );

  const loaded = await getRun(trace.runId);
  assert(loaded?.trace.runId === trace.runId, "getRun should load stored trace");

  console.log("production tests passed");
}

void main();
