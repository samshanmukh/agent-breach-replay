import type {
  SecurityEvent,
  SecurityFinding,
  SecurityTrace,
  ViolationType,
} from "../trace-schema";

function byId(events: SecurityEvent[]) {
  return new Map(events.map((event) => [event.id, event]));
}

function influenceChainHas(
  event: SecurityEvent,
  eventsById: Map<string, SecurityEvent>,
  predicate: (event: SecurityEvent) => boolean,
  seen = new Set<string>(),
): boolean {
  if (predicate(event)) return true;
  if (!event.influencedBy) return false;

  for (const parentId of event.influencedBy) {
    if (seen.has(parentId)) continue;
    seen.add(parentId);
    const parent = eventsById.get(parentId);
    if (parent && influenceChainHas(parent, eventsById, predicate, seen)) {
      return true;
    }
  }

  return false;
}

function hasBlockedEvidence(events: SecurityEvent[], evidence: string[]) {
  const eventMap = byId(events);
  return evidence.some((id) => eventMap.get(id)?.decision === "blocked");
}

function finding(
  type: ViolationType,
  evidence: string[],
  status: SecurityFinding["status"],
  recommendation: string,
  severity: SecurityFinding["severity"],
): SecurityFinding {
  return {
    type,
    severity,
    status,
    evidence,
    recommendation,
  };
}

export function detectSecurityFindings(trace: SecurityTrace): SecurityFinding[] {
  const eventsById = byId(trace.events);
  const findings: SecurityFinding[] = [];

  const protectedReads = trace.events.filter(
    (event) =>
      event.actor === "tool" &&
      event.targetClass === "protected" &&
      event.decision !== "blocked",
  );
  const externalActions = trace.events.filter(
    (event) =>
      event.actor === "tool" &&
      event.targetClass === "external" &&
      event.decision !== "blocked",
  );

  for (const externalAction of externalActions) {
    const influencedByProtected = influenceChainHas(
      externalAction,
      eventsById,
      (event) => event.targetClass === "protected",
    );
    const influencedByUntrusted = influenceChainHas(
      externalAction,
      eventsById,
      (event) => event.trust === "untrusted" || event.targetClass === "untrusted",
    );

    if (influencedByProtected && influencedByUntrusted) {
      findings.push(
        finding(
          "exfiltration",
          externalAction.influencedBy
            ? [...externalAction.influencedBy, externalAction.id]
            : [externalAction.id],
          "triggered",
          "Block external actions that combine protected data with untrusted influence.",
          "critical",
        ),
      );
    }

    if (influencedByUntrusted) {
      findings.push(
        finding(
          "untrusted_to_action",
          externalAction.influencedBy
            ? [...externalAction.influencedBy, externalAction.id]
            : [externalAction.id],
          "triggered",
          "Treat external content as data, not authority for tool actions.",
          "high",
        ),
      );
    }
  }

  for (const protectedRead of protectedReads) {
    const influencedByUntrusted = influenceChainHas(
      protectedRead,
      eventsById,
      (event) => event.trust === "untrusted" || event.targetClass === "untrusted",
    );

    if (influencedByUntrusted) {
      findings.push(
        finding(
          "confused_deputy",
          protectedRead.influencedBy
            ? [...protectedRead.influencedBy, protectedRead.id]
            : [protectedRead.id],
          "triggered",
          "Require explicit trusted-user authority before protected tool access.",
          "medium",
        ),
      );
    }
  }

  const blockedPolicyEvents = trace.events.filter(
    (event) => event.actor === "policy" && event.decision === "blocked",
  );

  if (blockedPolicyEvents.length > 0) {
    const evidence = blockedPolicyEvents.map((event) => event.id);
    findings.push(
      finding(
        "untrusted_to_action",
        evidence,
        hasBlockedEvidence(trace.events, evidence) ? "blocked" : "clear",
        "Continue applying trust-aware policy checks before privileged tools execute.",
        "high",
      ),
    );
  }

  const approvalEvents = trace.events.filter(
    (event) => event.decision === "approval_required",
  );

  if (approvalEvents.length > 0) {
    findings.push(
      finding(
        "exfiltration",
        approvalEvents.map((event) => event.id),
        "blocked",
        "Keep external sends behind approval when trace influence is incomplete or risky.",
        "critical",
      ),
    );
  }

  return findings;
}
