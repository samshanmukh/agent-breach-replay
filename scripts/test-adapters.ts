import sampleTrace from "../examples/openai-agents/sample-trace.json";
import { normalizeOpenAITrace } from "../packages/adapters/openai-agents";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const normalized = normalizeOpenAITrace(sampleTrace, {
  projectId: "test-project",
  userTask: "Summarize vendor emails.",
});

assert(normalized.runId === sampleTrace.id, "run id should be preserved");
assert(normalized.events.length === 2, "sample trace should produce two events");
assert(
  normalized.events[0]?.trust === "untrusted",
  "trust metadata should be preserved",
);
assert(
  normalized.events[1]?.influencedBy?.includes("span_email_read") ?? false,
  "influence metadata should be preserved",
);

console.log("adapter tests passed");
