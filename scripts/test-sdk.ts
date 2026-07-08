import { createSecurityTrace } from "../packages/trace-sdk-ts";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const trace = createSecurityTrace({
  projectId: "sdk-test",
  agentName: "SDK Test Agent",
  scenarioName: "SDK Test",
  userTask: "Test trace capture.",
  riskSummary: "Validate SDK trace format.",
  runId: "sdk_test_run",
});

trace.source("email_1", {
  kind: "email",
  trust: "untrusted",
  label: "External email",
});

trace.step("Agent planned action", {
  summary: "Agent plan created",
  details: "Plan influenced by email.",
  influencedBy: ["email_1"],
});

trace.tool("read_secret", {
  name: "fs.read",
  target: "secret.txt",
  targetClass: "protected",
  summary: "Read requested",
  details: "Protected file read requested.",
  influencedBy: ["email_1"],
});

trace.policyDecision("read_secret", {
  decision: "blocked",
  reason: "Untrusted influence cannot access protected file.",
  influencedBy: ["email_1"],
});

trace.violation({
  type: "untrusted_to_action",
  severitySummary: "Untrusted source influenced protected action.",
  details: "Detector evidence from SDK test.",
  influencedBy: ["email_1", "read_secret"],
});

const replay = trace.toReplay();

assert(replay.schemaVersion === "0.1", "schema version should be 0.1");
assert(replay.events.length === 5, "SDK should record five events");
assert(
  replay.events.some((event) => event.violation === "untrusted_to_action"),
  "SDK should record violation event",
);

console.log("sdk tests passed");
