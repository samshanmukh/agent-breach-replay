import legacyTrace from "../examples/openai-agents/sample-trace.json";
import sdkTrace from "../examples/openai-agents/sample-sdk-trace.json";
import { normalizeOpenAITrace } from "../packages/adapters/openai-agents";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const legacyNormalized = normalizeOpenAITrace(legacyTrace, {
  projectId: "test-project",
  userTask: "Summarize vendor emails.",
});

assert(legacyNormalized.runId === legacyTrace.id, "legacy run id should be preserved");
assert(legacyNormalized.events.length === 2, "legacy trace should produce two events");
assert(
  legacyNormalized.events[0]?.trust === "untrusted",
  "trust metadata should be preserved",
);
assert(
  legacyNormalized.events[1]?.influencedBy?.includes("span_email_read") ?? false,
  "influence metadata should be preserved",
);

const sdkNormalized = normalizeOpenAITrace(sdkTrace, {
  projectId: "test-project",
  userTask: "Summarize vendor emails.",
});

assert(
  sdkNormalized.runId === "trace_vendor_email_unsafe",
  "sdk trace id should be preserved",
);
assert(sdkNormalized.events.length === 5, "sdk trace should produce five events");
assert(
  sdkNormalized.events.some((event) => event.toolName === "email.read"),
  "function span should map tool name",
);
assert(
  sdkNormalized.events.some((event) => event.actor === "policy"),
  "guardrail span should map to policy actor",
);
assert(
  sdkNormalized.events.some(
    (event) =>
      event.id === "span_secret_read" &&
      (event.influencedBy?.includes("span_email_read") ||
        event.influencedBy?.includes("span_root_agent")),
  ),
  "parent influence should be inferred when explicit metadata is absent",
);

console.log("adapter tests passed");
