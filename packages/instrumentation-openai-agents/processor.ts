import {
  getAgentGraphAttributes,
  getCustomAttributes,
  getFunctionAttributes,
  getGenerationAttributes,
  getGenerationLiftedIO,
  getHandoffAttributes,
  getMCPListToolsAttributes,
  getResponseAttributes,
  getResponseLiftedIO,
  getSpanKind,
  getSpanName,
  liftedIOAttributes,
  mergeLiftedIO,
  recordHandoff,
  type LiftedIO,
} from "./attributes";
import { getActiveContext } from "./memory-tracer";
import { MemorySpanExporter } from "./memory-tracer";
import { OpenInferenceSpanKind, SemanticConventions as SC } from "./semantics";
import { TraceConfig, type TraceConfigOptions } from "./trace-config";
import type {
  AgentTrace,
  AgentTraceSpan,
  CompletedTrace,
  OpenAITraceExport,
  TracingProcessor,
} from "./types";
import { boundMap, boundSet } from "./utils";

const DEFAULT_MAX_ROOT_SPANS_IN_FLIGHT = 1000;
const MAX_HANDOFFS_IN_FLIGHT = 1000;
const MAX_AGENT_IO_IN_FLIGHT = 1000;
const MAX_SPANS_IN_FLIGHT = 5000;
const MAX_SUPPRESSED_IDS_RETAINED = 5000;

export type AgentBreachTracingProcessorOptions = {
  traceConfig?: TraceConfigOptions;
  maxRootSpansInFlight?: number;
  exporter?: MemorySpanExporter;
};

export class AgentBreachTracingProcessor implements TracingProcessor {
  private enabled = true;
  private readonly traceConfig: TraceConfig;
  private readonly exporter: MemorySpanExporter;
  private readonly maxRootSpansInFlight: number;

  private readonly rootSpanIds = new Map<string, string>();
  private readonly reverseHandoffs = new Map<string, string>();
  private readonly traceIO = new Map<string, LiftedIO>();
  private readonly agentIO = new Map<string, LiftedIO>();
  private readonly suppressedTraceIds = new Set<string>();
  private readonly suppressedSpanIds = new Set<string>();

  constructor(options: AgentBreachTracingProcessorOptions = {}) {
    this.traceConfig = new TraceConfig(options.traceConfig);
    this.exporter =
      options.exporter ?? new MemorySpanExporter(this.traceConfig);
    this.maxRootSpansInFlight = Math.max(
      1,
      Math.floor(options.maxRootSpansInFlight ?? DEFAULT_MAX_ROOT_SPANS_IN_FLIGHT),
    );
  }

  getExporter() {
    return this.exporter;
  }

  async onTraceStart(agentTrace: AgentTrace): Promise<void> {
    if (!this.enabled) return;
    if (getActiveContext().suppressTracing) {
      this.suppressedTraceIds.add(agentTrace.traceId);
      boundSet(this.suppressedTraceIds, MAX_SUPPRESSED_IDS_RETAINED);
      return;
    }

    const rootSpanId = `root_${agentTrace.traceId}`;
    this.rootSpanIds.set(agentTrace.traceId, rootSpanId);
    this.exporter.startTrace(agentTrace.traceId, agentTrace.name);
    this.exporter.startSpan({
      spanId: rootSpanId,
      traceId: agentTrace.traceId,
      name: agentTrace.name,
      kind: OpenInferenceSpanKind.AGENT,
      attributes: {
        [SC.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.AGENT,
        [SC.LLM_SYSTEM]: "openai",
      },
    });
    this.evictOldestRootSpans();
  }

  async onTraceEnd(agentTrace: AgentTrace): Promise<void> {
    this.suppressedTraceIds.delete(agentTrace.traceId);
    const liftedIO = this.traceIO.get(agentTrace.traceId);
    this.traceIO.delete(agentTrace.traceId);
    const rootSpanId = this.rootSpanIds.get(agentTrace.traceId);
    if (!rootSpanId) return;

    this.exporter.endSpan({
      spanId: rootSpanId,
      status: "ok",
      attributes: liftedIOAttributes(liftedIO),
    });
    this.exporter.endTrace(agentTrace.traceId);
    this.rootSpanIds.delete(agentTrace.traceId);
  }

  async onSpanStart(span: AgentTraceSpan): Promise<void> {
    if (!span.startedAt || !this.enabled) return;
    if (this.shouldSuppressSpan(span)) {
      this.suppressedSpanIds.add(span.spanId);
      boundSet(this.suppressedSpanIds, MAX_SUPPRESSED_IDS_RETAINED);
      return;
    }

    this.exporter.startSpan({
      spanId: span.spanId,
      traceId: span.traceId,
      parentId: span.parentId ?? this.rootSpanIds.get(span.traceId),
      name: getSpanName(span),
      kind: getSpanKind(span.spanData),
      startedAt: span.startedAt,
      attributes: {
        [SC.OPENINFERENCE_SPAN_KIND]: getSpanKind(span.spanData),
        [SC.LLM_SYSTEM]: "openai",
      },
    });
    this.evictOldestSpans();
  }

  async onSpanEnd(span: AgentTraceSpan): Promise<void> {
    if (this.suppressedSpanIds.delete(span.spanId)) return;

    let attributes: Record<string, string | number | boolean> = {};
    const data = span.spanData;

    switch (data.type) {
      case "generation":
        attributes = getGenerationAttributes(data);
        this.recordLiftedIO(span, getGenerationLiftedIO(data));
        break;
      case "function":
        attributes = getFunctionAttributes(data);
        break;
      case "response":
        attributes = getResponseAttributes(data);
        this.recordLiftedIO(span, getResponseLiftedIO(data));
        break;
      case "mcp_tools":
        attributes = getMCPListToolsAttributes(data);
        break;
      case "custom":
        attributes = getCustomAttributes(data);
        break;
      case "handoff":
        attributes = getHandoffAttributes(data);
        recordHandoff(
          data,
          span.traceId,
          this.reverseHandoffs,
          MAX_HANDOFFS_IN_FLIGHT,
        );
        break;
      case "agent":
        attributes = {
          ...getAgentGraphAttributes(
            data,
            span.traceId,
            this.reverseHandoffs,
          ),
          ...liftedIOAttributes(this.agentIO.get(span.spanId)),
        };
        this.agentIO.delete(span.spanId);
        break;
      case "guardrail":
        attributes = {
          [SC.TOOL_NAME]: data.name,
          [SC.GUARDRAIL_TRIGGERED]: data.triggered,
        };
        break;
      case "speech":
      case "speech_group":
      case "transcription":
        break;
    }

    this.exporter.endSpan({
      spanId: span.spanId,
      endedAt: span.endedAt,
      status: span.error ? "error" : "ok",
      statusMessage: span.error?.message,
      attributes,
    });

    this.endDanglingRootSpanOnTopLevelAgentError(span);
  }

  async shutdown(): Promise<void> {}
  async forceFlush(): Promise<void> {}

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
    for (const rootSpanId of this.rootSpanIds.values()) {
      this.exporter.endSpan({ spanId: rootSpanId, status: "ok" });
    }
    this.rootSpanIds.clear();
    this.suppressedSpanIds.clear();
    this.suppressedTraceIds.clear();
    this.reverseHandoffs.clear();
    this.traceIO.clear();
    this.agentIO.clear();
  }

  private recordLiftedIO(span: AgentTraceSpan, liftedIO: LiftedIO) {
    if (liftedIO.input === undefined && liftedIO.output === undefined) return;

    if (this.rootSpanIds.has(span.traceId)) {
      let traceEntry = this.traceIO.get(span.traceId);
      if (!traceEntry) {
        traceEntry = {};
        this.traceIO.set(span.traceId, traceEntry);
      }
      mergeLiftedIO(traceEntry, liftedIO);
    }

    if (span.parentId != null) {
      let agentEntry = this.agentIO.get(span.parentId);
      if (!agentEntry) {
        agentEntry = {};
        this.agentIO.set(span.parentId, agentEntry);
        boundMap(this.agentIO, MAX_AGENT_IO_IN_FLIGHT);
      }
      mergeLiftedIO(agentEntry, liftedIO);
    }
  }

  private shouldSuppressSpan(span: AgentTraceSpan) {
    const context = getActiveContext();
    return (
      context.suppressTracing ||
      this.suppressedTraceIds.has(span.traceId) ||
      (span.parentId != null && this.suppressedSpanIds.has(span.parentId))
    );
  }

  private evictOldestRootSpans() {
    while (this.rootSpanIds.size > this.maxRootSpansInFlight) {
      const oldestTraceId = this.rootSpanIds.keys().next().value;
      if (oldestTraceId === undefined) break;
      const rootSpanId = this.rootSpanIds.get(oldestTraceId);
      if (rootSpanId) {
        this.exporter.endSpan({ spanId: rootSpanId, status: "ok" });
      }
      this.rootSpanIds.delete(oldestTraceId);
      this.traceIO.delete(oldestTraceId);
      this.suppressedTraceIds.delete(oldestTraceId);
    }
  }

  private evictOldestSpans() {
    // Memory exporter handles completed spans; active span cap is enforced
    // by ending orphaned spans when root traces are evicted.
  }

  private endDanglingRootSpanOnTopLevelAgentError(span: AgentTraceSpan) {
    if (!span.error || span.spanData.type !== "agent") return;
    const rootSpanId = this.rootSpanIds.get(span.traceId);
    if (!rootSpanId) return;
    if (span.parentId != null && span.parentId !== rootSpanId) return;

    this.exporter.endSpan({
      spanId: rootSpanId,
      endedAt: span.endedAt,
      status: "error",
      statusMessage: span.error.message,
      attributes: liftedIOAttributes(this.traceIO.get(span.traceId)),
    });
    this.traceIO.delete(span.traceId);
    this.rootSpanIds.delete(span.traceId);
  }
}

export function completedTraceToExport(trace: CompletedTrace): OpenAITraceExport {
  return {
    trace_id: trace.traceId,
    workflow_name: trace.name,
    spans: trace.spans.map((span) => ({
      span_id: span.spanId,
      trace_id: span.traceId,
      parent_id: span.parentId,
      started_at: span.startedAt,
      ended_at: span.endedAt,
      error: span.status === "error" ? { message: span.statusMessage } : null,
      span_data: inferSpanData(span),
    })),
  };
}

function inferSpanData(span: CompletedTrace["spans"][number]) {
  const toolName = span.attributes[SC.TOOL_NAME];
  if (span.kind === OpenInferenceSpanKind.TOOL && typeof toolName === "string") {
    if (toolName.startsWith("handoff_to_")) {
      return {
        type: "handoff" as const,
        to_agent: toolName.replace("handoff_to_", ""),
      };
    }
    return {
      type: "function" as const,
      name: toolName,
      input: span.attributes[SC.INPUT_VALUE],
      output: span.attributes[SC.OUTPUT_VALUE],
    };
  }
  if (span.kind === OpenInferenceSpanKind.GUARDRAIL) {
    return {
      type: "guardrail" as const,
      name: String(span.attributes[SC.TOOL_NAME] ?? span.name),
      triggered: Boolean(span.attributes[SC.GUARDRAIL_TRIGGERED]),
    };
  }
  if (span.kind === OpenInferenceSpanKind.LLM) {
    return {
      type: "generation" as const,
      model: String(span.attributes[SC.LLM_MODEL_NAME] ?? ""),
      input: [],
      output: [],
    };
  }
  if (span.kind === OpenInferenceSpanKind.AGENT) {
    return {
      type: "agent" as const,
      name: String(span.attributes[SC.GRAPH_NODE_ID] ?? span.name),
    };
  }
  return {
    type: "custom" as const,
    name: span.name,
    data: { attributes: span.attributes },
  };
}
