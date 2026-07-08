import type {
  CaptureMode,
  SecurityEvent,
  SecurityTrace,
  TrustLevel,
} from "../trace-schema";

export type OpenAITraceSpanLike = {
  id: string;
  type?: string;
  name?: string;
  started_at?: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
};

export type OpenAITraceLike = {
  id: string;
  workflow_name?: string;
  created_at?: string;
  spans: OpenAITraceSpanLike[];
};

function stringMeta(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function trustFromSpan(span: OpenAITraceSpanLike): TrustLevel {
  const explicit = stringMeta(span.metadata, "trust");
  if (
    explicit === "trusted" ||
    explicit === "untrusted" ||
    explicit === "protected" ||
    explicit === "external" ||
    explicit === "neutral"
  ) {
    return explicit;
  }

  if (span.type?.includes("tool")) return "neutral";
  return "neutral";
}

export function normalizeOpenAITrace(
  trace: OpenAITraceLike,
  options: {
    projectId: string;
    userTask: string;
    captureMode?: CaptureMode;
    riskSummary?: string;
  },
): SecurityTrace {
  const events: SecurityEvent[] = trace.spans.map((span, index) => {
    const trust = trustFromSpan(span);
    const toolName = stringMeta(span.metadata, "toolName") ?? span.name;
    const targetClass = stringMeta(span.metadata, "targetClass") as
      | TrustLevel
      | undefined;
    const influencedBy = stringMeta(span.metadata, "influencedBy")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    return {
      id: span.id,
      runId: trace.id,
      timestamp:
        span.started_at ??
        new Date(Date.UTC(2026, 6, 8, 12, index, 0)).toISOString(),
      title: span.name ?? span.type ?? "OpenAI trace span",
      actor: span.type?.includes("tool") ? "tool" : "agent",
      trust,
      summary:
        stringMeta(span.metadata, "summary") ??
        "Imported OpenAI trace span with security metadata where available.",
      details:
        stringMeta(span.metadata, "details") ??
        "Unknown fields are kept explicit so missing trust labels are visible.",
      toolName,
      target: stringMeta(span.metadata, "target"),
      targetClass,
      destinationClass: targetClass,
      influencedBy,
      decision:
        (stringMeta(span.metadata, "decision") as SecurityEvent["decision"]) ??
        "observed",
    };
  });

  return {
    schemaVersion: "0.1",
    runId: trace.id,
    projectId: options.projectId,
    agentName: trace.workflow_name ?? "OpenAI Agent",
    scenarioName: trace.workflow_name ?? "OpenAI Agent Trace",
    captureMode: options.captureMode ?? "metadata-only",
    startedAt: trace.created_at ?? new Date().toISOString(),
    userTask: options.userTask,
    riskSummary:
      options.riskSummary ??
      "Imported trace requires security enrichment for trust and influence labels.",
    events,
  };
}
