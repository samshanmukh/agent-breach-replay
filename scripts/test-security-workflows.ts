import {
  createApiKey,
  decideApproval,
  getPolicy,
  getProjectSettings,
  isProjectApiKeyValid,
  listApiKeys,
  listApprovals,
  listAudit,
  simulatePolicy,
  syncApprovalsFromTrace,
  updateProjectSettings,
  revokeApiKey,
} from "../lib/security-controls";
import type { SecurityTrace } from "../packages/trace-schema";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const trace: SecurityTrace = {
  schemaVersion: "0.1",
  runId: "workflow-test",
  projectId: "workflow-project",
  agentName: "Workflow agent",
  scenarioName: "Policy simulation",
  captureMode: "metadata-only",
  startedAt: new Date().toISOString(),
  userTask: "Review an external request.",
  riskSummary: "Untrusted content influences protected and external tools.",
  events: [
    {
      id: "source",
      runId: "workflow-test",
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
      runId: "workflow-test",
      timestamp: new Date().toISOString(),
      title: "Protected read",
      actor: "tool",
      trust: "protected",
      toolName: "fs.read",
      targetClass: "protected",
      influencedBy: ["source"],
      summary: "Protected read requested.",
      details: "Protected read requested.",
      decision: "allowed",
    },
    {
      id: "send",
      runId: "workflow-test",
      timestamp: new Date().toISOString(),
      title: "External send",
      actor: "tool",
      trust: "external",
      toolName: "email.send",
      targetClass: "external",
      influencedBy: ["source", "protected"],
      summary: "External send requested.",
      details: "External send requested.",
      decision: "allowed",
    },
  ],
};

const policy = getPolicy(trace.projectId);
assert(policy.rules.length === 3, "default policy should contain three rules");

const simulation = simulatePolicy(trace, policy.rules);
assert(
  simulation.changes.some(
    (change) => change.eventId === "protected" && change.next === "blocked",
  ),
  "policy should block protected access influenced by untrusted content",
);
assert(
  simulation.changes.some(
    (change) => change.eventId === "send" && change.next === "approval_required",
  ),
  "policy should require approval for external actions",
);

syncApprovalsFromTrace(simulation.trace);
const pending = listApprovals(trace.projectId);
assert(pending.length === 1, "simulation should create one approval request");
assert(pending[0].status === "pending", "approval should start pending");

const actor = {
  id: "test-owner",
  email: "owner@example.test",
};
const decided = decideApproval(
  pending[0].id,
  "approved",
  actor,
  "Reviewed evidence.",
);
assert(decided?.status === "approved", "approval decision should persist");

const settings = updateProjectSettings(trace.projectId, {
  retention: { metadataOnlyDays: 120 },
  requireApprovalForExternal: true,
});
assert(
  settings.retention.metadataOnlyDays === 120,
  "retention setting should update",
);
assert(
  getProjectSettings(trace.projectId).retention.fullDebugDays === 7,
  "partial retention update should preserve other defaults",
);

const { record, secret } = createApiKey(
  trace.projectId,
  "CI ingestion",
  ["ingest", "read"],
  actor,
);
assert(secret.startsWith("abr_"), "API key should have the abr_ prefix");
assert(
  isProjectApiKeyValid(secret, "ingest"),
  "created API key should authorize its ingest scope",
);
assert(
  !isProjectApiKeyValid(secret, "approve"),
  "created API key should reject missing scopes",
);
assert(
  listApiKeys(trace.projectId).some((key) => key.id === record.id),
  "created API key should be listed",
);
assert(
  listAudit(trace.projectId).some(
    (entry) => entry.action === "approval.approved",
  ),
  "approval decision should create an audit entry",
);
assert(
  listAudit(trace.projectId).some((entry) => entry.action === "api_key.created"),
  "API key creation should create an audit entry",
);
revokeApiKey(record.id, actor);
assert(
  !isProjectApiKeyValid(secret, "ingest"),
  "revoked API key should no longer authorize requests",
);

console.log("security workflow tests passed");
