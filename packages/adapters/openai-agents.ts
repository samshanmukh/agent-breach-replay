import type {
  CaptureMode,
  SecurityEvent,
  SecurityTrace,
  TrustLevel,
} from "../trace-schema";
import {
  actorFromSpan,
  completedSpansToOpenAITrace,
  decisionFromSpan,
  enrichSpanMetadata,
  inferInfluenceEdges,
  spanId,
  traceId,
  type OpenAITraceLike,
  type OpenAITraceSpanLike,
} from "./openai-span-mappers";
import type { CompletedSpan } from "../instrumentation-openai-agents/types";

function stringMeta(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function trustFromSpan(span: OpenAITraceSpanLike): TrustLevel {
  const metadata = enrichSpanMetadata(span);
  const explicit = stringMeta(metadata, "trust");
  if (
    explicit === "trusted" ||
    explicit === "untrusted" ||
    explicit === "protected" ||
    explicit === "external" ||
    explicit === "neutral"
  ) {
    return explicit;
  }
  return "neutral";
}

function influencedByForSpan(
  span: OpenAITraceSpanLike,
  edges: Map<string, string[]>,
) {
  const metadata = enrichSpanMetadata(span);
  const explicit = stringMeta(metadata, "influencedBy")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (explicit && explicit.length > 0) return explicit;
  return edges.get(spanId(span)) ?? [];
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
  const edges = inferInfluenceEdges(trace.spans);
  const run = traceId(trace);

  const events: SecurityEvent[] = trace.spans.map((span, index) => {
    const metadata = enrichSpanMetadata(span);
    const trust = trustFromSpan(span);
    const toolName = stringMeta(metadata, "toolName") ?? span.span_data?.name ?? span.name;
    const targetClass = stringMeta(metadata, "targetClass") as TrustLevel | undefined;

    return {
      id: spanId(span) || `span_${index}`,
      runId: run,
      timestamp:
        span.started_at ??
        new Date(Date.UTC(2026, 6, 8, 12, index, 0)).toISOString(),
      title: span.span_data?.name ?? span.name ?? span.span_data?.type ?? "OpenAI trace span",
      actor: actorFromSpan(span),
      trust,
      summary:
        stringMeta(metadata, "summary") ??
        "Imported OpenAI trace span with security metadata where available.",
      details:
        stringMeta(metadata, "details") ??
        "Unknown fields are kept explicit so missing trust labels are visible.",
      toolName,
      target: stringMeta(metadata, "target"),
      targetClass,
      destinationClass: targetClass,
      influencedBy: influencedByForSpan(span, edges),
      decision: decisionFromSpan({ ...span, metadata }),
    };
  });

  return {
    schemaVersion: "0.1",
    runId: run,
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

export function normalizeInstrumentedSpans(
  input: {
    traceId: string;
    workflowName: string;
    spans: CompletedSpan[];
    createdAt?: string;
  },
  options: {
    projectId: string;
    userTask: string;
    captureMode?: CaptureMode;
    riskSummary?: string;
  },
) {
  return normalizeOpenAITrace(
    completedSpansToOpenAITrace({
      traceId: input.traceId,
      workflowName: input.workflowName,
      spans: input.spans,
    }),
    options,
  );
}

export type { OpenAITraceLike, OpenAITraceSpanLike };
