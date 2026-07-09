import type { Actor, PolicyDecision, TrustLevel } from "../trace-schema";
import type { CompletedSpan } from "../instrumentation-openai-agents/types";
import { SemanticConventions as SC } from "../instrumentation-openai-agents/semantics";
import { OpenInferenceSpanKind } from "../instrumentation-openai-agents/semantics";

export type OpenAITraceSpanLike = {
  id?: string;
  span_id?: string;
  type?: string;
  name?: string;
  started_at?: string;
  ended_at?: string;
  parent_id?: string | null;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  span_data?: {
    type?: string;
    name?: string;
    input?: unknown;
    output?: unknown;
    from_agent?: string;
    to_agent?: string;
    triggered?: boolean;
    data?: Record<string, unknown>;
    model?: string;
    _input?: unknown;
    _response?: Record<string, unknown>;
  };
  error?: { message?: string } | null;
};

export type OpenAITraceLike = {
  id?: string;
  trace_id?: string;
  workflow_name?: string;
  created_at?: string;
  spans: OpenAITraceSpanLike[];
};

function spanId(span: OpenAITraceSpanLike) {
  return span.span_id ?? span.id ?? "";
}

function traceId(trace: OpenAITraceLike) {
  return trace.trace_id ?? trace.id ?? "imported_trace";
}

function stringMeta(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function trustFromMetadata(
  metadata: Record<string, unknown> | undefined,
): TrustLevel | undefined {
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
  return undefined;
}

function trustFromToolName(toolName?: string): TrustLevel {
  if (!toolName) return "neutral";
  const lower = toolName.toLowerCase();
  if (lower.includes("email") || lower.includes("web") || lower.includes("http")) {
    return "untrusted";
  }
  if (
    lower.includes("secret") ||
    lower.includes("protected") ||
    lower.includes("fs.read")
  ) {
    return "protected";
  }
  if (lower.includes("send") || lower.includes("post") || lower.includes("upload")) {
    return "external";
  }
  return "neutral";
}

function actorFromSpan(span: OpenAITraceSpanLike): Actor {
  const spanType = span.span_data?.type ?? span.type ?? "";
  if (spanType === "function" || spanType.includes("tool") || spanType === "mcp_tools") {
    return "tool";
  }
  if (spanType === "guardrail") return "policy";
  return "agent";
}

function decisionFromSpan(span: OpenAITraceSpanLike): PolicyDecision {
  const explicit = stringMeta(span.metadata, "decision");
  if (
    explicit === "allowed" ||
    explicit === "blocked" ||
    explicit === "approval_required" ||
    explicit === "observed"
  ) {
    return explicit;
  }
  if (span.span_data?.type === "guardrail") {
    return span.span_data.triggered ? "blocked" : "allowed";
  }
  return "observed";
}

export function inferInfluenceEdges(spans: OpenAITraceSpanLike[]) {
  const edges = new Map<string, string[]>();
  for (const span of spans) {
    const id = spanId(span);
    const parentId = span.parent_id;
    if (!id || !parentId) continue;
    const existing = edges.get(id) ?? [];
    if (!existing.includes(parentId)) existing.push(parentId);
    edges.set(id, existing);
  }
  return edges;
}

export function mapInstrumentedSpanToMetadata(span: CompletedSpan) {
  const metadata: Record<string, unknown> = {};
  const toolName = span.attributes[SC.TOOL_NAME];
  if (typeof toolName === "string") metadata.toolName = toolName;
  if (span.attributes[SC.GUARDRAIL_TRIGGERED] === true) {
    metadata.decision = "blocked";
  }
  const customData = span.attributes[SC.OUTPUT_VALUE];
  if (typeof customData === "string" && span.kind === OpenInferenceSpanKind.CHAIN) {
    try {
      const parsed = JSON.parse(customData) as Record<string, unknown>;
      if (parsed.trust) metadata.trust = parsed.trust;
      if (parsed.targetClass) metadata.targetClass = parsed.targetClass;
      if (parsed.influencedBy) metadata.influencedBy = parsed.influencedBy;
      if (parsed.summary) metadata.summary = parsed.summary;
      if (parsed.details) metadata.details = parsed.details;
    } catch {
      metadata.details = customData;
    }
  }
  return metadata;
}

export function completedSpansToOpenAITrace(input: {
  traceId: string;
  workflowName: string;
  spans: CompletedSpan[];
}): OpenAITraceLike {
  return {
    trace_id: input.traceId,
    workflow_name: input.workflowName,
    spans: input.spans.map((span) => ({
      span_id: span.spanId,
      parent_id: span.parentId,
      started_at: span.startedAt,
      ended_at: span.endedAt,
      error: span.status === "error" ? { message: span.statusMessage } : null,
      metadata: mapInstrumentedSpanToMetadata(span),
      span_data: spanKindToSpanData(span),
    })),
  };
}

function spanKindToSpanData(span: CompletedSpan) {
  const toolName = span.attributes[SC.TOOL_NAME];
  switch (span.kind) {
    case OpenInferenceSpanKind.TOOL:
      if (typeof toolName === "string" && toolName.startsWith("handoff_to_")) {
        return {
          type: "handoff",
          to_agent: toolName.replace("handoff_to_", ""),
        };
      }
      return {
        type: "function",
        name: typeof toolName === "string" ? toolName : span.name,
        input: span.attributes[SC.INPUT_VALUE],
        output: span.attributes[SC.OUTPUT_VALUE],
      };
    case OpenInferenceSpanKind.GUARDRAIL:
      return {
        type: "guardrail",
        name: typeof toolName === "string" ? toolName : span.name,
        triggered: Boolean(span.attributes[SC.GUARDRAIL_TRIGGERED]),
      };
    case OpenInferenceSpanKind.LLM:
      return {
        type: "generation",
        model: String(span.attributes[SC.LLM_MODEL_NAME] ?? ""),
        input: span.attributes[SC.INPUT_VALUE],
        output: span.attributes[SC.OUTPUT_VALUE],
      };
    case OpenInferenceSpanKind.AGENT:
      return {
        type: "agent",
        name: String(span.attributes[SC.GRAPH_NODE_ID] ?? span.name),
      };
    default:
      return {
        type: "custom",
        name: span.name,
        data: { attributes: span.attributes },
      };
  }
}

export function enrichSpanMetadata(span: OpenAITraceSpanLike) {
  const metadata = { ...(span.metadata ?? {}) };
  const spanType = span.span_data?.type ?? span.type;
  const toolName =
    stringMeta(metadata, "toolName") ??
    span.span_data?.name ??
    span.name ??
    (typeof span.span_data?.name === "string" ? span.span_data.name : undefined);

  if (!metadata.trust) {
    metadata.trust = trustFromMetadata(metadata) ?? trustFromToolName(toolName);
  }

  if (!metadata.toolName && toolName) metadata.toolName = toolName;

  if (!metadata.target && typeof span.span_data?.input === "string") {
    metadata.target = span.span_data.input;
  }

  if (!metadata.targetClass && metadata.trust) {
    metadata.targetClass = metadata.trust;
  }

  if (!metadata.summary) {
    if (spanType === "function") {
      metadata.summary = `Tool ${toolName ?? "call"} executed during agent run.`;
    } else if (spanType === "guardrail") {
      metadata.summary = span.span_data?.triggered
        ? "Guardrail blocked unsafe agent action."
        : "Guardrail evaluated agent action.";
    } else if (spanType === "generation" || spanType === "response") {
      metadata.summary = "Model generation step in agent workflow.";
    } else {
      metadata.summary = "Imported OpenAI agent span.";
    }
  }

  if (!metadata.details) {
    metadata.details =
      "Security metadata inferred locally from OpenAI Agents span semantics.";
  }

  return metadata;
}

export {
  spanId,
  traceId,
  trustFromMetadata,
  actorFromSpan,
  decisionFromSpan,
};
