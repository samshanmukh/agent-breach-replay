import { scenarios, toSecurityTrace } from "../lib/traces";
import { detectSecurityFindings } from "../packages/detectors";
import type { SecurityTrace } from "../packages/trace-schema";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const unsafe = scenarios.find((scenario) => scenario.mode === "unsafe");
const guardrailed = scenarios.find((scenario) => scenario.mode === "guardrailed");

assert(Boolean(unsafe), "unsafe scenario missing");
assert(Boolean(guardrailed), "guardrailed scenario missing");

const unsafeFindings = detectSecurityFindings(toSecurityTrace(unsafe!));
const guardrailedFindings = detectSecurityFindings(toSecurityTrace(guardrailed!));

assert(
  unsafeFindings.some(
    (finding) =>
      finding.type === "exfiltration" && finding.status === "triggered",
  ),
  "unsafe scenario should trigger exfiltration",
);

assert(
  unsafeFindings.some(
    (finding) =>
      finding.type === "untrusted_to_action" &&
      finding.status === "triggered",
  ),
  "unsafe scenario should trigger untrusted-to-action",
);

assert(
  guardrailedFindings.some(
    (finding) =>
      finding.type === "exfiltration" && finding.status === "blocked",
  ),
  "guardrailed scenario should block exfiltration",
);

const destructiveTrace: SecurityTrace = {
  schemaVersion: "0.1",
  runId: "destructive-run",
  projectId: "tests",
  agentName: "Support bot",
  scenarioName: "Untrusted delete",
  captureMode: "metadata-only",
  startedAt: new Date().toISOString(),
  userTask: "Triage support requests",
  riskSummary: "Untrusted support content causes a destructive write.",
  events: [
    {
      id: "ticket",
      runId: "destructive-run",
      timestamp: new Date().toISOString(),
      title: "Untrusted ticket",
      actor: "tool",
      trust: "untrusted",
      targetClass: "untrusted",
      summary: "External ticket read.",
      details: "External ticket read.",
      decision: "allowed",
    },
    {
      id: "delete",
      runId: "destructive-run",
      timestamp: new Date().toISOString(),
      title: "Delete records",
      actor: "tool",
      trust: "external",
      toolName: "crm.delete_records",
      targetClass: "protected",
      influencedBy: ["ticket"],
      summary: "Bulk delete requested.",
      details: "Bulk delete requested.",
      decision: "allowed",
    },
  ],
};

assert(
  detectSecurityFindings(destructiveTrace).some(
    (finding) =>
      finding.type === "destructive_write" && finding.status === "triggered",
  ),
  "untrusted destructive tool action should trigger destructive-write",
);

console.log("detector tests passed");
