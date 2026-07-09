import {
  AgentBreachTracingProcessor,
  createMockAgentsModule,
  OpenAIAgentsInstrumentation,
  OpenInferenceSpanKind,
  suppressTracing,
  usingSession,
} from "../../packages/instrumentation-openai-agents";
import { normalizeInstrumentedSpans } from "../../packages/adapters/openai-agents";

async function runVendorEmailTrace() {
  const instrumentation = new OpenAIAgentsInstrumentation({
    exclusiveProcessor: true,
    traceConfig: { hideInputs: false, hideOutputs: false },
  });
  const agents = createMockAgentsModule();
  instrumentation.manuallyInstrument(agents);
  const processor = instrumentation.getProcessor()!;

  await new Promise<void>((resolve, reject) => {
    usingSession("session_vendor_17", () => {
      (async () => {
        try {
          await processor.onTraceStart({
            traceId: "trace_local_vendor_email",
            name: "Vendor Email Assistant",
          });

          const rootSpanId = "span_root_agent";
          await processor.onSpanStart({
            spanId: rootSpanId,
            traceId: "trace_local_vendor_email",
            parentId: null,
            startedAt: "2026-07-08T12:00:00.000Z",
            spanData: { type: "agent", name: "Vendor Email Assistant" },
          });

          await processor.onSpanStart({
            spanId: "span_email_read",
            traceId: "trace_local_vendor_email",
            parentId: rootSpanId,
            startedAt: "2026-07-08T12:00:01.000Z",
            spanData: { type: "function", name: "email.read" },
          });
          await processor.onSpanEnd({
            spanId: "span_email_read",
            traceId: "trace_local_vendor_email",
            parentId: rootSpanId,
            startedAt: "2026-07-08T12:00:01.000Z",
            endedAt: "2026-07-08T12:00:02.000Z",
            spanData: {
              type: "function",
              name: "email.read",
              input: { mailbox: "inbox" },
              output: { from: "vendor@example.net" },
            },
          });

          await processor.onSpanStart({
            spanId: "span_secret_read",
            traceId: "trace_local_vendor_email",
            parentId: rootSpanId,
            startedAt: "2026-07-08T12:00:03.000Z",
            spanData: { type: "function", name: "fs.read" },
          });
          await processor.onSpanEnd({
            spanId: "span_secret_read",
            traceId: "trace_local_vendor_email",
            parentId: rootSpanId,
            startedAt: "2026-07-08T12:00:03.000Z",
            endedAt: "2026-07-08T12:00:04.000Z",
            spanData: {
              type: "function",
              name: "fs.read",
              input: { path: "secret.txt" },
              output: { bytes: 128 },
            },
          });

          await processor.onSpanEnd({
            spanId: rootSpanId,
            traceId: "trace_local_vendor_email",
            parentId: null,
            startedAt: "2026-07-08T12:00:00.000Z",
            endedAt: "2026-07-08T12:00:05.000Z",
            spanData: { type: "agent", name: "Vendor Email Assistant" },
          });

          await processor.onTraceEnd({
            traceId: "trace_local_vendor_email",
            name: "Vendor Email Assistant",
          });
          resolve();
        } catch (error) {
          reject(error);
        }
      })();
    });
  });

  const completed = processor.getExporter().getTrace("trace_local_vendor_email");
  if (!completed) throw new Error("trace not captured");

  const normalized = normalizeInstrumentedSpans(
    {
      traceId: completed.traceId,
      workflowName: completed.name,
      spans: completed.spans,
    },
    {
      projectId: "local-example",
      userTask: "Summarize vendor emails and prepare next steps.",
      riskSummary: "Local instrumentation example for vendor email assistant.",
    },
  );

  console.log(
    JSON.stringify(
      {
        spanCount: completed.spans.length,
        kinds: [...new Set(completed.spans.map((span) => span.kind))],
        normalizedEvents: normalized.events.length,
        sampleSpanAttributes: completed.spans.find(
          (span) => span.kind === OpenInferenceSpanKind.TOOL,
        )?.attributes,
        securityEventTitles: normalized.events.map((event) => event.title),
      },
      null,
      2,
    ),
  );
}

async function demonstrateSuppression() {
  const processor = new AgentBreachTracingProcessor();
  await new Promise<void>((resolve) => {
    suppressTracing(() => {
      void processor
        .onTraceStart({ traceId: "suppressed", name: "hidden" })
        .then(() => processor.onTraceEnd({ traceId: "suppressed", name: "hidden" }))
        .then(() => resolve());
    });
  });
  const trace = processor.getExporter().getTrace("suppressed");
  console.log("suppressed trace spans:", trace?.spans.length ?? 0);
}

await runVendorEmailTrace();
await demonstrateSuppression();

console.log("instrumentation example complete");
