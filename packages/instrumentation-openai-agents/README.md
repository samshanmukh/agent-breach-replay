# @agent-breach/instrumentation-openai-agents

Local OpenAI Agents SDK instrumentation for Agent Breach Replay.

This package mirrors the feature surface of
[`openinference-instrumentation-openai-agents`](https://github.com/Arize-ai/openinference/tree/main/python/instrumentation/openinference-instrumentation-openai-agents)
without depending on Arize packages. Spans follow OpenInference semantic
conventions and are stored in a local memory exporter for replay and security
enrichment.

## Features

- `TracingProcessor` bridge for `@openai/agents` (exclusive or additive mode)
- Span kinds: `AGENT`, `LLM`, `TOOL`, `GUARDRAIL`, `CHAIN`, `AUDIO`, `USER`
- Attribute extraction for generation, response, function, handoff, guardrail,
  MCP tools, and custom spans
- Lifted I/O on agent and root spans
- Handoff graph linking via `graph.node.parent_id`
- `TraceConfig` masking with `OPENINFERENCE_*` environment variables
- Realtime audio turn tracing scaffold with PCM16 → WAV data URI encoding
- Context helpers: `usingSession`, `usingUser`, `usingAttributes`, `suppressTracing`

## Quickstart

```ts
import {
  AgentBreachTracingProcessor,
  createMockAgentsModule,
  OpenAIAgentsInstrumentation,
} from "@agent-breach/instrumentation-openai-agents";

const instrumentation = new OpenAIAgentsInstrumentation({
  exclusiveProcessor: true,
});
const agents = createMockAgentsModule();
instrumentation.manuallyInstrument(agents);

const processor = instrumentation.getProcessor()!;
await processor.onTraceStart({ traceId: "trace_1", name: "Vendor Email Assistant" });
// ... emit SDK span events ...
await processor.onTraceEnd({ traceId: "trace_1", name: "Vendor Email Assistant" });

const trace = processor.getExporter().getTrace("trace_1");
```

## Integration with Agent Breach Replay

Use `packages/adapters/openai-agents.ts` to normalize instrumented traces into
the security trace schema and submit via `POST /api/import/openai` or
`POST /api/traces`.
