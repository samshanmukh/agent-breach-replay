export {};

const baseUrl = process.env.UI_TEST_BASE_URL ?? "http://localhost:3016";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function json(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

const runId = `api-workflow-${Date.now()}`;
const securityTrace = {
  schemaVersion: "0.1",
  runId,
  projectId: "local-demo",
  agentName: "API workflow test",
  scenarioName: "External approval workflow",
  captureMode: "metadata-only",
  startedAt: new Date().toISOString(),
  userTask: "Review an external request.",
  riskSummary: "Untrusted content influences protected and external actions.",
  events: [
    {
      id: "source",
      runId,
      timestamp: new Date().toISOString(),
      title: "External source",
      actor: "tool",
      trust: "untrusted",
      targetClass: "untrusted",
      summary: "External source read.",
      details: "External source read.",
      decision: "allowed",
    },
    {
      id: "protected",
      runId,
      timestamp: new Date().toISOString(),
      title: "Protected file read",
      actor: "tool",
      trust: "protected",
      toolName: "fs.read",
      targetClass: "protected",
      influencedBy: ["source"],
      summary: "Protected read.",
      details: "Protected read.",
      decision: "allowed",
    },
    {
      id: "send",
      runId,
      timestamp: new Date().toISOString(),
      title: "External send",
      actor: "tool",
      trust: "external",
      toolName: "email.send",
      targetClass: "external",
      influencedBy: ["source", "protected"],
      summary: "External send.",
      details: "External send.",
      decision: "allowed",
    },
  ],
};

async function main() {
  const imported = await json("/api/studio/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ securityTrace }),
  });
  assert(imported.trace.runId === runId, "import should persist the trace");
  assert(imported.findings.length >= 2, "import should run detectors");

  const runs = await json("/api/studio/runs?projectId=local-demo");
  assert(
    runs.runs.some((run: { trace: { runId: string } }) => run.trace.runId === runId),
    "run list should include imported trace",
  );

  const simulation = await json("/api/studio/policy/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runId }),
  });
  assert(
    simulation.simulation.changes.some(
      (change: { eventId: string; next: string }) =>
        change.eventId === "send" && change.next === "approval_required",
    ),
    "simulation should require approval for external send",
  );

  const approvals = await json("/api/studio/approvals?projectId=local-demo");
  const pending = approvals.approvals.find(
    (approval: { runId: string; status: string }) =>
      approval.runId === `${runId}-simulation` && approval.status === "pending",
  );
  assert(Boolean(pending), "simulation should create a pending approval");

  const decided = await json(
    `/api/studio/approvals/${encodeURIComponent(pending.id)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved", note: "API test review" }),
    },
  );
  assert(decided.approval.status === "approved", "approval should be decided");

  const key = await json("/api/studio/controls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create_key",
      projectId: "local-demo",
      name: "API workflow test",
      scopes: ["ingest", "read"],
    }),
  });
  assert(key.secret.startsWith("abr_"), "control API should return key once");

  const audit = await json("/api/studio/audit?projectId=local-demo");
  assert(
    audit.audit.some(
      (entry: { action: string }) => entry.action === "approval.approved",
    ),
    "approval decision should be audited",
  );

  console.log("security workflow API tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
