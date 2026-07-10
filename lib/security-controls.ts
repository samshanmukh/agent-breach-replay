import { createHash, randomBytes, randomUUID } from "crypto";
import { detectSecurityFindings } from "@/packages/detectors";
import type {
  Actor,
  PolicyDecision,
  SecurityEvent,
  SecurityFinding,
  SecurityTrace,
  TrustLevel,
} from "@/packages/trace-schema";

export type PolicyRule = {
  id: string;
  name: string;
  enabled: boolean;
  when: {
    actor?: Actor;
    toolNamePattern?: string;
    targetClass?: TrustLevel;
    trust?: TrustLevel;
    influencedByTrust?: TrustLevel;
  };
  then: Extract<PolicyDecision, "blocked" | "approval_required" | "allowed">;
  reason: string;
};

export type Policy = {
  id: string;
  projectId: string;
  name: string;
  version: number;
  enabled: boolean;
  rules: PolicyRule[];
  updatedAt: string;
};

export type PolicySimulation = {
  id: string;
  sourceRunId: string;
  baselineFindings: SecurityFinding[];
  simulatedFindings: SecurityFinding[];
  trace: SecurityTrace;
  changes: Array<{
    eventId: string;
    previous: PolicyDecision;
    next: PolicyDecision;
    ruleId: string;
    reason: string;
  }>;
};

export type ApprovalRequest = {
  id: string;
  projectId: string;
  runId: string;
  eventId: string;
  status: "pending" | "approved" | "denied" | "expired";
  requestedAction: string;
  reason: string;
  evidence: string[];
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionNote?: string;
};

export type ProjectSettings = {
  projectId: string;
  defaultCaptureMode: "metadata-only" | "redacted-preview" | "full-debug";
  retention: {
    metadataOnlyDays: number;
    redactedPreviewDays: number;
    fullDebugDays: number;
  };
  requireApprovalForExternal: boolean;
  auditRunViews: boolean;
  allowedOrigins: string[];
};

export type ApiKeyRecord = {
  id: string;
  projectId: string;
  name: string;
  prefix: string;
  hash: string;
  scopes: Array<"ingest" | "read" | "simulate" | "approve">;
  createdAt: string;
  createdBy: string;
  lastUsedAt?: string;
  revokedAt?: string;
};

export type AuditEntry = {
  id: string;
  projectId?: string;
  actorId: string;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

const policies = new Map<string, Policy>();
const approvals = new Map<string, ApprovalRequest>();
const settings = new Map<string, ProjectSettings>();
const apiKeys = new Map<string, ApiKeyRecord>();
const auditLog: AuditEntry[] = [];

function now() {
  return new Date().toISOString();
}

function eventMap(trace: SecurityTrace) {
  return new Map(trace.events.map((event) => [event.id, event]));
}

function influenceHasTrust(
  event: SecurityEvent,
  events: Map<string, SecurityEvent>,
  trust: TrustLevel,
  seen = new Set<string>(),
): boolean {
  if (event.trust === trust || event.targetClass === trust) return true;
  for (const id of event.influencedBy ?? []) {
    if (seen.has(id)) continue;
    seen.add(id);
    const parent = events.get(id);
    if (parent && influenceHasTrust(parent, events, trust, seen)) return true;
  }
  return false;
}

function ruleMatches(
  rule: PolicyRule,
  event: SecurityEvent,
  events: Map<string, SecurityEvent>,
) {
  if (!rule.enabled) return false;
  if (rule.when.actor && event.actor !== rule.when.actor) return false;
  if (rule.when.targetClass && event.targetClass !== rule.when.targetClass) return false;
  if (rule.when.trust && event.trust !== rule.when.trust) return false;
  if (
    rule.when.toolNamePattern &&
    !new RegExp(rule.when.toolNamePattern, "i").test(event.toolName ?? "")
  ) {
    return false;
  }
  if (
    rule.when.influencedByTrust &&
    !influenceHasTrust(event, events, rule.when.influencedByTrust)
  ) {
    return false;
  }
  return true;
}

export const defaultPolicyRules: PolicyRule[] = [
  {
    id: "block-untrusted-protected",
    name: "Block untrusted influence on protected tools",
    enabled: true,
    when: {
      actor: "tool",
      targetClass: "protected",
      influencedByTrust: "untrusted",
    },
    then: "blocked",
    reason: "Untrusted content cannot authorize protected data access.",
  },
  {
    id: "approve-external-actions",
    name: "Require approval for external actions",
    enabled: true,
    when: {
      actor: "tool",
      targetClass: "external",
    },
    then: "approval_required",
    reason: "External actions require a human approval decision.",
  },
  {
    id: "block-destructive-tools",
    name: "Block destructive tools from untrusted influence",
    enabled: true,
    when: {
      actor: "tool",
      toolNamePattern: "(delete|remove|destroy|purge|truncate)",
      influencedByTrust: "untrusted",
    },
    then: "blocked",
    reason: "Destructive actions cannot be authorized by untrusted content.",
  },
];

export function getPolicy(projectId: string): Policy {
  const existing = policies.get(projectId);
  if (existing) return existing;
  const policy: Policy = {
    id: `policy-${projectId}`,
    projectId,
    name: "Default agent security policy",
    version: 1,
    enabled: true,
    rules: defaultPolicyRules.map((rule) => ({ ...rule, when: { ...rule.when } })),
    updatedAt: now(),
  };
  policies.set(projectId, policy);
  return policy;
}

export function savePolicy(
  projectId: string,
  input: Pick<Policy, "name" | "enabled" | "rules">,
) {
  const previous = getPolicy(projectId);
  const policy: Policy = {
    ...previous,
    ...input,
    projectId,
    version: previous.version + 1,
    updatedAt: now(),
  };
  policies.set(projectId, policy);
  return policy;
}

export function simulatePolicy(
  trace: SecurityTrace,
  rules: PolicyRule[] = getPolicy(trace.projectId).rules,
): PolicySimulation {
  const events = eventMap(trace);
  const changes: PolicySimulation["changes"] = [];
  const simulatedEvents = trace.events.map((event) => {
    const matched = rules.find((rule) => ruleMatches(rule, event, events));
    if (!matched || matched.then === event.decision) return { ...event };
    changes.push({
      eventId: event.id,
      previous: event.decision ?? "observed",
      next: matched.then,
      ruleId: matched.id,
      reason: matched.reason,
    });
    return {
      ...event,
      decision: matched.then,
      details: `${event.details} Policy simulation: ${matched.reason}`,
    };
  });
  const simulatedTrace: SecurityTrace = {
    ...trace,
    runId: `${trace.runId}-simulation`,
    scenarioName: `${trace.scenarioName} · simulated`,
    events: simulatedEvents.map((event) => ({
      ...event,
      runId: `${trace.runId}-simulation`,
    })),
  };
  return {
    id: randomUUID(),
    sourceRunId: trace.runId,
    baselineFindings: detectSecurityFindings(trace),
    simulatedFindings: detectSecurityFindings(simulatedTrace),
    trace: simulatedTrace,
    changes,
  };
}

export function syncApprovalsFromTrace(trace: SecurityTrace) {
  for (const event of trace.events) {
    if (event.decision !== "approval_required") continue;
    const id = `${trace.runId}:${event.id}`;
    if (approvals.has(id)) continue;
    approvals.set(id, {
      id,
      projectId: trace.projectId,
      runId: trace.runId,
      eventId: event.id,
      status: "pending",
      requestedAction: event.toolName ?? event.title,
      reason: event.summary,
      evidence: event.influencedBy ?? [event.id],
      requestedAt: now(),
    });
  }
}

export function createApproval(input: Omit<ApprovalRequest, "id" | "requestedAt">) {
  const approval: ApprovalRequest = {
    ...input,
    id: randomUUID(),
    requestedAt: now(),
  };
  approvals.set(approval.id, approval);
  return approval;
}

export function listApprovals(projectId?: string) {
  return [...approvals.values()]
    .filter((approval) => !projectId || approval.projectId === projectId)
    .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
}

export function decideApproval(
  id: string,
  decision: "approved" | "denied",
  actor: { id: string; email: string },
  note?: string,
) {
  const approval = approvals.get(id);
  if (!approval) return null;
  const updated: ApprovalRequest = {
    ...approval,
    status: decision,
    decidedAt: now(),
    decidedBy: actor.email,
    decisionNote: note,
  };
  approvals.set(id, updated);
  appendAudit({
    projectId: approval.projectId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: `approval.${decision}`,
    resourceType: "approval_request",
    resourceId: id,
    metadata: { runId: approval.runId, eventId: approval.eventId, note },
  });
  return updated;
}

export function getProjectSettings(projectId: string): ProjectSettings {
  const existing = settings.get(projectId);
  if (existing) return existing;
  const value: ProjectSettings = {
    projectId,
    defaultCaptureMode: "metadata-only",
    retention: {
      metadataOnlyDays: 90,
      redactedPreviewDays: 30,
      fullDebugDays: 7,
    },
    requireApprovalForExternal: true,
    auditRunViews: true,
    allowedOrigins: ["http://localhost:3000"],
  };
  settings.set(projectId, value);
  return value;
}

export function updateProjectSettings(
  projectId: string,
  patch: Partial<Omit<ProjectSettings, "projectId" | "retention">> & {
    retention?: Partial<ProjectSettings["retention"]>;
  },
) {
  const current = getProjectSettings(projectId);
  const updated: ProjectSettings = {
    ...current,
    ...patch,
    retention: {
      ...current.retention,
      ...(patch.retention ?? {}),
    },
    projectId,
  };
  settings.set(projectId, updated);
  return updated;
}

export function createApiKey(
  projectId: string,
  name: string,
  scopes: ApiKeyRecord["scopes"],
  actor: { id: string; email: string },
) {
  const secret = `abr_${randomBytes(24).toString("base64url")}`;
  const record: ApiKeyRecord = {
    id: randomUUID(),
    projectId,
    name,
    prefix: secret.slice(0, 12),
    hash: createHash("sha256").update(secret).digest("hex"),
    scopes,
    createdAt: now(),
    createdBy: actor.email,
  };
  apiKeys.set(record.id, record);
  appendAudit({
    projectId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: "api_key.created",
    resourceType: "api_key",
    resourceId: record.id,
    metadata: { name, scopes, prefix: record.prefix },
  });
  return { record, secret };
}

export function listApiKeys(projectId: string) {
  return [...apiKeys.values()]
    .filter((key) => key.projectId === projectId)
    .map(({ hash: _hash, ...key }) => key);
}

export function revokeApiKey(
  id: string,
  actor: { id: string; email: string },
) {
  const key = apiKeys.get(id);
  if (!key) return null;
  const updated = { ...key, revokedAt: now() };
  apiKeys.set(id, updated);
  appendAudit({
    projectId: key.projectId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: "api_key.revoked",
    resourceType: "api_key",
    resourceId: id,
    metadata: { name: key.name, prefix: key.prefix },
  });
  const { hash: _hash, ...publicKey } = updated;
  return publicKey;
}

export function isProjectApiKeyValid(
  secret: string,
  scope: ApiKeyRecord["scopes"][number],
) {
  const hash = createHash("sha256").update(secret).digest("hex");
  for (const [id, key] of apiKeys) {
    if (key.revokedAt || key.hash !== hash || !key.scopes.includes(scope)) {
      continue;
    }
    apiKeys.set(id, { ...key, lastUsedAt: now() });
    return true;
  }
  return false;
}

export function appendAudit(
  entry: Omit<AuditEntry, "id" | "createdAt">,
): AuditEntry {
  const value: AuditEntry = {
    ...entry,
    id: randomUUID(),
    createdAt: now(),
  };
  auditLog.unshift(value);
  if (auditLog.length > 1000) auditLog.length = 1000;
  return value;
}

export function listAudit(projectId?: string) {
  return auditLog.filter((entry) => !projectId || entry.projectId === projectId);
}
