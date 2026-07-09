import {
  AgentBreachTracingProcessor,
  OpenInferenceSpanKind,
  RealtimeSessionTracer,
  SemanticConventions as SC,
  TraceConfig,
  pcm16ToWavDataUri,
  suppressTracing,
  usingSession,
} from "../packages/instrumentation-openai-agents";
import { normalizeInstrumentedSpans } from "../packages/adapters/openai-agents";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function testProcessorSpanKinds() {
  const processor = new AgentBreachTracingProcessor();
  const traceId = "trace_test_kinds";

  await processor.onTraceStart({ traceId, name: "Test Workflow" });
  const rootSpanId = "span_root";

  await processor.onSpanStart({
    spanId: rootSpanId,
    traceId,
    parentId: null,
    startedAt: "2026-07-08T12:00:00.000Z",
    spanData: { type: "agent", name: "Primary Agent" },
  });

  await processor.onSpanStart({
    spanId: "span_generation",
    traceId,
    parentId: rootSpanId,
    startedAt: "2026-07-08T12:00:01.000Z",
    spanData: { type: "generation", model: "gpt-4.1-mini" },
  });
  await processor.onSpanEnd({
    spanId: "span_generation",
    traceId,
    parentId: rootSpanId,
    startedAt: "2026-07-08T12:00:01.000Z",
    endedAt: "2026-07-08T12:00:02.000Z",
    spanData: {
      type: "generation",
      model: "gpt-4.1-mini",
      input: [{ role: "user", content: "hello" }],
      output: [{ choices: [{ message: { role: "assistant", content: "hi" } }] }],
      usage: { input_tokens: 3, output_tokens: 1 },
    },
  });

  await processor.onSpanStart({
    spanId: "span_function",
    traceId,
    parentId: rootSpanId,
    startedAt: "2026-07-08T12:00:02.100Z",
    spanData: { type: "function", name: "lookup" },
  });
  await processor.onSpanEnd({
    spanId: "span_function",
    traceId,
    parentId: rootSpanId,
    startedAt: "2026-07-08T12:00:02.100Z",
    endedAt: "2026-07-08T12:00:02.500Z",
    spanData: {
      type: "function",
      name: "lookup",
      input: { q: "vendor" },
      output: "vendor@example.net",
    },
  });

  await processor.onSpanStart({
    spanId: "span_guardrail",
    traceId,
    parentId: rootSpanId,
    startedAt: "2026-07-08T12:00:02.600Z",
    spanData: { type: "guardrail", name: "tripwire", triggered: true },
  });
  await processor.onSpanEnd({
    spanId: "span_guardrail",
    traceId,
    parentId: rootSpanId,
    startedAt: "2026-07-08T12:00:02.600Z",
    endedAt: "2026-07-08T12:00:02.700Z",
    spanData: { type: "guardrail", name: "tripwire", triggered: true },
  });

  await processor.onSpanEnd({
    spanId: rootSpanId,
    traceId,
    parentId: null,
    startedAt: "2026-07-08T12:00:00.000Z",
    endedAt: "2026-07-08T12:00:03.000Z",
    spanData: { type: "agent", name: "Primary Agent" },
  });
  await processor.onTraceEnd({ traceId, name: "Test Workflow" });

  const completed = processor.getExporter().getTrace(traceId);
  assert(Boolean(completed), "completed trace should exist");
  assert((completed?.spans.length ?? 0) >= 5, "trace should include root + child spans");

  const kinds = new Set(completed?.spans.map((span) => span.kind));
  assert(kinds.has(OpenInferenceSpanKind.AGENT), "agent kind expected");
  assert(kinds.has(OpenInferenceSpanKind.LLM), "llm kind expected");
  assert(kinds.has(OpenInferenceSpanKind.TOOL), "tool kind expected");
  assert(kinds.has(OpenInferenceSpanKind.GUARDRAIL), "guardrail kind expected");

  const toolSpan = completed?.spans.find((span) => span.kind === OpenInferenceSpanKind.TOOL);
  assert(toolSpan?.attributes[SC.TOOL_NAME] === "lookup", "tool name attribute expected");

  const llmSpan = completed?.spans.find((span) => span.kind === OpenInferenceSpanKind.LLM);
  assert(llmSpan?.attributes[SC.LLM_TOKEN_COUNT_PROMPT] === 3, "token counts expected");

  const normalized = normalizeInstrumentedSpans(
    {
      traceId,
      workflowName: "Test Workflow",
      spans: completed!.spans,
    },
    {
      projectId: "test",
      userTask: "hello",
    },
  );
  assert(normalized.events.length >= 4, "normalized events should be produced");
}

async function testTraceConfigMasking() {
  const processor = new AgentBreachTracingProcessor({
    traceConfig: { hideInputs: true, hideOutputs: true },
  });
  const traceId = "trace_mask";

  await processor.onTraceStart({ traceId, name: "Mask Test" });
  await processor.onSpanStart({
    spanId: "span_fn",
    traceId,
    parentId: "root_trace_mask",
    startedAt: "2026-07-08T12:00:00.000Z",
    spanData: { type: "function", name: "secret_lookup" },
  });
  await processor.onSpanEnd({
    spanId: "span_fn",
    traceId,
    parentId: "root_trace_mask",
    startedAt: "2026-07-08T12:00:00.000Z",
    endedAt: "2026-07-08T12:00:01.000Z",
    spanData: {
      type: "function",
      name: "secret_lookup",
      input: { secret: "value" },
      output: "done",
    },
  });
  await processor.onTraceEnd({ traceId, name: "Mask Test" });

  const completed = processor.getExporter().getTrace(traceId);
  const toolSpan = completed?.spans.find((span) => span.spanId === "span_fn");
  assert(toolSpan?.attributes[SC.INPUT_VALUE] === "__REDACTED__", "input should be redacted");
  assert(toolSpan?.attributes[SC.OUTPUT_VALUE] === "__REDACTED__", "output should be redacted");
}

function testRealtimeTracer() {
  const tracer = new RealtimeSessionTracer(new TraceConfig());
  tracer.onSessionCreated("session_1", "gpt-4o-realtime");
  tracer.onUserSpeechStarted("session_1", "turn_1");
  tracer.onUserAudioTranscript("session_1", "Summarize vendor emails.");
  tracer.onAssistantTranscript("session_1", "I can help with that.");
  tracer.onToolCall("session_1", "email.read", { mailbox: "inbox" }, { from: "vendor@example.net" });

  const pcm = new Uint8Array([0, 0, 1, 0]);
  const dataUri = pcm16ToWavDataUri(pcm);
  assert(dataUri.startsWith("data:audio/wav;base64,"), "wav data uri expected");

  tracer.finalizeTurn("session_1", {
    endReason: "complete",
    inputAudioDataUri: dataUri,
    outputAudioDataUri: dataUri,
    tokenCounts: { prompt: 10, completion: 5, promptAudio: 2, completionAudio: 1 },
    timeToFirstTokenMs: 120,
  });

  const spans = tracer.getSpans();
  assert(spans.length >= 4, "realtime spans should include turn, user, assistant, tool");
  assert(
    spans.some((span) => span.kind === OpenInferenceSpanKind.AUDIO),
    "audio turn span expected",
  );
}

async function testSuppressionAndSessionContext() {
  const processor = new AgentBreachTracingProcessor();
  const traceId = "trace_context";

  await new Promise<void>((resolve) => {
    usingSession("session_abc", () => {
      void processor
        .onTraceStart({ traceId, name: "Context Test" })
        .then(() => processor.onTraceEnd({ traceId, name: "Context Test" }))
        .then(() => resolve());
    });
  });

  const completed = processor.getExporter().getTrace(traceId);
  const root = completed?.spans.find((span) => span.kind === OpenInferenceSpanKind.AGENT);
  assert(root?.attributes[SC.SESSION_ID] === "session_abc", "session id should propagate");

  const suppressed = new AgentBreachTracingProcessor();
  await new Promise<void>((resolve) => {
    suppressTracing(() => {
      void suppressed
        .onTraceStart({ traceId: "hidden", name: "hidden" })
        .then(() => suppressed.onTraceEnd({ traceId: "hidden", name: "hidden" }))
        .then(() => resolve());
    });
  });
  assert(!suppressed.getExporter().getTrace("hidden"), "suppressed trace should not be stored");
}

async function main() {
  await testProcessorSpanKinds();
  await testTraceConfigMasking();
  testRealtimeTracer();
  await testSuppressionAndSessionContext();
  console.log("instrumentation tests passed");
}

void main();
