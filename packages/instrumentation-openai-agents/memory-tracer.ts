import type { SpanAttributes } from "./semantics";
import { TraceConfig } from "./trace-config";
import type { CompletedSpan, CompletedTrace } from "./types";

type ActiveSpan = {
  spanId: string;
  traceId: string;
  parentId?: string | null;
  name: string;
  kind: string;
  startedAt?: string;
  attributes: SpanAttributes;
};

export type TraceContext = {
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  suppressTracing?: boolean;
};

let activeContext: TraceContext = {};

export function usingAttributes(context: TraceContext, fn: () => void) {
  const previous = activeContext;
  activeContext = { ...previous, ...context };
  try {
    fn();
  } finally {
    activeContext = previous;
  }
}

export function usingSession(sessionId: string, fn: () => void) {
  usingAttributes({ sessionId }, fn);
}

export function usingUser(userId: string, fn: () => void) {
  usingAttributes({ userId }, fn);
}

export function suppressTracing(fn: () => void) {
  usingAttributes({ suppressTracing: true }, fn);
}

export function getActiveContext() {
  return activeContext;
}

export class MemorySpanExporter {
  private readonly traces = new Map<string, CompletedTrace>();
  private readonly activeSpans = new Map<string, ActiveSpan>();
  private readonly traceConfig: TraceConfig;

  constructor(traceConfig: TraceConfig = new TraceConfig()) {
    this.traceConfig = traceConfig;
  }

  startTrace(traceId: string, name: string, startedAt?: string) {
    if (!this.traces.has(traceId)) {
      this.traces.set(traceId, {
        traceId,
        name,
        startedAt,
        spans: [],
      });
    }
  }

  endTrace(traceId: string, endedAt?: string) {
    const trace = this.traces.get(traceId);
    if (trace) trace.endedAt = endedAt;
  }

  startSpan(input: {
    spanId: string;
    traceId: string;
    parentId?: string | null;
    name: string;
    kind: string;
    startedAt?: string;
    attributes?: SpanAttributes;
  }) {
    const context = getActiveContext();
    if (context.suppressTracing) return;

    const attributes: SpanAttributes = {
      ...(input.attributes ?? {}),
    };
    if (context.sessionId) attributes["session.id"] = context.sessionId;
    if (context.userId) attributes["user.id"] = context.userId;
    if (context.metadata) {
      attributes.metadata = JSON.stringify(context.metadata);
    }
    if (context.tags?.length) {
      attributes["tag.tags"] = JSON.stringify(context.tags);
    }

    this.activeSpans.set(input.spanId, {
      spanId: input.spanId,
      traceId: input.traceId,
      parentId: input.parentId,
      name: input.name,
      kind: input.kind,
      startedAt: input.startedAt,
      attributes: this.traceConfig.maskAttributes(attributes),
    });
  }

  endSpan(input: {
    spanId: string;
    endedAt?: string;
    status: "ok" | "error";
    statusMessage?: string;
    attributes?: SpanAttributes;
  }) {
    const active = this.activeSpans.get(input.spanId);
    if (!active) return;

    const merged = this.traceConfig.maskAttributes({
      ...active.attributes,
      ...(input.attributes ?? {}),
    });

    for (const [key, value] of Object.entries(merged)) {
      if (
        typeof value === "string" &&
        (key === "input.audio.url" || key === "output.audio.url")
      ) {
        merged[key] = this.traceConfig.truncateAudioDataUri(value);
      }
    }

    const completed: CompletedSpan = {
      spanId: active.spanId,
      traceId: active.traceId,
      parentId: active.parentId,
      name: active.name,
      kind: active.kind,
      startedAt: active.startedAt,
      endedAt: input.endedAt,
      status: input.status,
      statusMessage: input.statusMessage,
      attributes: merged,
    };

    const trace = this.traces.get(active.traceId);
    if (trace) trace.spans.push(completed);
    this.activeSpans.delete(input.spanId);
  }

  getTrace(traceId: string) {
    return this.traces.get(traceId);
  }

  getAllTraces() {
    return [...this.traces.values()];
  }

  clear() {
    this.traces.clear();
    this.activeSpans.clear();
  }
}
