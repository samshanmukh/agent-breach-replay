export type TrustLevel =
  | "trusted"
  | "untrusted"
  | "protected"
  | "external"
  | "neutral";

export type Actor = "user" | "agent" | "tool" | "policy" | "detector";

export type ViolationType =
  | "exfiltration"
  | "untrusted_to_action"
  | "confused_deputy"
  | "destructive_write";

export type CaptureMode =
  | "metadata-only"
  | "redacted-preview"
  | "full-debug";

export type PolicyDecision =
  | "allowed"
  | "blocked"
  | "approval_required"
  | "observed";

export type SecurityEvent = {
  id: string;
  runId: string;
  timestamp: string;
  title: string;
  actor: Actor;
  trust: TrustLevel;
  summary: string;
  details: string;
  sourceIds?: string[];
  toolName?: string;
  target?: string;
  targetClass?: TrustLevel;
  destinationClass?: TrustLevel;
  influencedBy?: string[];
  decision?: PolicyDecision;
  violation?: ViolationType;
};

export type SecurityFinding = {
  type: ViolationType;
  severity: "low" | "medium" | "high" | "critical";
  status: "triggered" | "blocked" | "clear";
  evidence: string[];
  recommendation: string;
};

export type SecurityTrace = {
  schemaVersion: "0.1";
  runId: string;
  projectId: string;
  agentName: string;
  scenarioName: string;
  captureMode: CaptureMode;
  startedAt: string;
  userTask: string;
  riskSummary: string;
  events: SecurityEvent[];
  findings?: SecurityFinding[];
};

export function assertSecurityTrace(trace: SecurityTrace): SecurityTrace {
  if (!trace.runId || !trace.projectId || !trace.agentName) {
    throw new Error("SecurityTrace requires runId, projectId, and agentName.");
  }

  for (const event of trace.events) {
    if (!event.id || !event.runId || event.runId !== trace.runId) {
      throw new Error(`Invalid event identity in trace ${trace.runId}.`);
    }
  }

  return trace;
}
