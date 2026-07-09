export type SpanError = {
  message?: string;
  data?: unknown;
};

export type AgentSpanData = {
  type: "agent";
  name: string;
};

export type GenerationSpanData = {
  type: "generation";
  name?: string;
  model?: string;
  model_config?: Record<string, unknown>;
  input?: ReadonlyArray<Record<string, unknown>>;
  output?: ReadonlyArray<Record<string, unknown>>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { cache_read?: number };
    output_tokens_details?: { reasoning?: number };
  };
};

export type ResponseSpanData = {
  type: "response";
  name?: string;
  _input?: string | ReadonlyArray<Record<string, unknown>>;
  _response?: Record<string, unknown>;
};

export type FunctionSpanData = {
  type: "function";
  name: string;
  input?: unknown;
  output?: unknown;
};

export type HandoffSpanData = {
  type: "handoff";
  from_agent?: string;
  to_agent?: string;
};

export type GuardrailSpanData = {
  type: "guardrail";
  name: string;
  triggered: boolean;
};

export type MCPListToolsSpanData = {
  type: "mcp_tools";
  name?: string;
  result?: unknown;
};

export type CustomSpanData = {
  type: "custom";
  name: string;
  data?: Record<string, unknown>;
};

export type SpeechSpanData = { type: "speech" };
export type SpeechGroupSpanData = { type: "speech_group" };
export type TranscriptionSpanData = { type: "transcription" };

export type SpanData =
  | AgentSpanData
  | GenerationSpanData
  | ResponseSpanData
  | FunctionSpanData
  | HandoffSpanData
  | GuardrailSpanData
  | MCPListToolsSpanData
  | CustomSpanData
  | SpeechSpanData
  | SpeechGroupSpanData
  | TranscriptionSpanData;

export type AgentTraceSpan = {
  spanId: string;
  traceId: string;
  parentId?: string | null;
  startedAt?: string;
  endedAt?: string;
  error?: SpanError | null;
  spanData: SpanData;
};

export type AgentTrace = {
  traceId: string;
  name: string;
  groupId?: string | null;
  metadata?: Record<string, unknown>;
};

export type TracingProcessor = {
  onTraceStart?(trace: AgentTrace): void | Promise<void>;
  onTraceEnd?(trace: AgentTrace): void | Promise<void>;
  onSpanStart?(span: AgentTraceSpan): void | Promise<void>;
  onSpanEnd?(span: AgentTraceSpan): void | Promise<void>;
  shutdown?(timeout?: number): void | Promise<void>;
  forceFlush?(): void | Promise<void>;
};

export type AgentsTracingModule = {
  setTraceProcessors(processors: TracingProcessor[]): void;
  addTraceProcessor(processor: TracingProcessor): void;
  agentBreachPatched?: boolean;
};

export type CompletedSpan = {
  spanId: string;
  traceId: string;
  parentId?: string | null;
  name: string;
  kind: string;
  startedAt?: string;
  endedAt?: string;
  status: "ok" | "error";
  statusMessage?: string;
  attributes: Record<string, string | number | boolean>;
};

export type CompletedTrace = {
  traceId: string;
  name: string;
  startedAt?: string;
  endedAt?: string;
  spans: CompletedSpan[];
};

export type OpenAITraceExport = {
  trace_id: string;
  workflow_name?: string;
  group_id?: string | null;
  metadata?: Record<string, unknown>;
  spans: Array<{
    span_id: string;
    trace_id: string;
    parent_id?: string | null;
    started_at?: string;
    ended_at?: string;
    error?: SpanError | null;
    span_data: SpanData;
  }>;
};
