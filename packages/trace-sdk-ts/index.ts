import {
  assertSecurityTrace,
  type Actor,
  type CaptureMode,
  type PolicyDecision,
  type SecurityEvent,
  type SecurityTrace,
  type TrustLevel,
  type ViolationType,
} from "@agent-breach/trace-schema";

type CreateTraceOptions = {
  projectId: string;
  agentName: string;
  scenarioName: string;
  userTask: string;
  riskSummary: string;
  captureMode?: CaptureMode;
  runId?: string;
  startedAt?: string;
};

type EventInput = Omit<SecurityEvent, "id" | "runId" | "timestamp"> & {
  id?: string;
  timestamp?: string;
};

let eventCounter = 0;

function nextId(prefix: string) {
  eventCounter += 1;
  return `${prefix}_${eventCounter.toString().padStart(4, "0")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function createEvent(
  runId: string,
  prefix: string,
  input: EventInput,
): SecurityEvent {
  return {
    ...input,
    id: input.id ?? nextId(prefix),
    runId,
    timestamp: input.timestamp ?? nowIso(),
  };
}

export function createSecurityTrace(options: CreateTraceOptions) {
  const runId = options.runId ?? `run_${Date.now().toString(36)}`;
  const events: SecurityEvent[] = [];

  function record(prefix: string, input: EventInput) {
    const event = createEvent(runId, prefix, input);
    events.push(event);
    return event;
  }

  return {
    source(
      id: string,
      input: {
        kind: string;
        trust: TrustLevel;
        label: string;
        summary?: string;
        details?: string;
      },
    ) {
      return record("source", {
        id,
        title: input.label,
        actor: "tool",
        trust: input.trust,
        summary: input.summary ?? `${input.kind} source read`,
        details:
          input.details ??
          "Source captured with security metadata only; raw content omitted.",
        sourceIds: [id],
        targetClass: input.trust,
        decision: "observed",
      });
    },

    step(
      title: string,
      input: {
        actor?: Actor;
        trust?: TrustLevel;
        summary: string;
        details: string;
        influencedBy?: string[];
      },
    ) {
      return record("step", {
        title,
        actor: input.actor ?? "agent",
        trust: input.trust ?? "neutral",
        summary: input.summary,
        details: input.details,
        influencedBy: input.influencedBy,
        decision: "observed",
      });
    },

    tool(
      id: string,
      input: {
        name: string;
        target: string;
        targetClass: TrustLevel;
        summary: string;
        details: string;
        influencedBy?: string[];
        decision?: PolicyDecision;
      },
    ) {
      return record("tool", {
        id,
        title: `${input.name} requested`,
        actor: "tool",
        trust: input.targetClass,
        summary: input.summary,
        details: input.details,
        toolName: input.name,
        target: input.target,
        targetClass: input.targetClass,
        destinationClass: input.targetClass,
        influencedBy: input.influencedBy,
        decision: input.decision ?? "allowed",
      });
    },

    policyDecision(
      actionId: string,
      input: {
        decision: PolicyDecision;
        reason: string;
        influencedBy?: string[];
      },
    ) {
      return record("policy", {
        id: `${actionId}_policy`,
        title: "Policy decision",
        actor: "policy",
        trust: "neutral",
        summary: input.reason,
        details: input.reason,
        influencedBy: input.influencedBy,
        decision: input.decision,
      });
    },

    violation(input: {
      type: ViolationType;
      severitySummary: string;
      details: string;
      influencedBy?: string[];
    }) {
      return record("violation", {
        title: `${input.type.replaceAll("_", " ")} detected`,
        actor: "detector",
        trust: "neutral",
        summary: input.severitySummary,
        details: input.details,
        influencedBy: input.influencedBy,
        decision: "observed",
        violation: input.type,
      });
    },

    toReplay(): SecurityTrace {
      return assertSecurityTrace({
        schemaVersion: "0.1",
        runId,
        projectId: options.projectId,
        agentName: options.agentName,
        scenarioName: options.scenarioName,
        captureMode: options.captureMode ?? "metadata-only",
        startedAt: options.startedAt ?? nowIso(),
        userTask: options.userTask,
        riskSummary: options.riskSummary,
        events,
      });
    },

    async submit(input: { endpoint: string; apiKey?: string }) {
      const response = await fetch(input.endpoint.replace(/\/$/, "") + "/api/traces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(input.apiKey ? { "x-agent-breach-key": input.apiKey } : {}),
        },
        body: JSON.stringify(this.toReplay()),
      });

      if (!response.ok) {
        throw new Error(`Trace submission failed with ${response.status}`);
      }

      return response.json() as Promise<{
        runId: string;
        findings: unknown[];
        report: unknown;
        similarIncidents: unknown[];
      }>;
    },
  };
}

export type SecurityTraceRecorder = ReturnType<typeof createSecurityTrace>;
