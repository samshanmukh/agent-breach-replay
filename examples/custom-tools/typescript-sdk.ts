import { createSecurityTrace } from "../../packages/trace-sdk-ts";

const trace = createSecurityTrace({
  projectId: "demo",
  agentName: "Vendor Email Assistant",
  scenarioName: "Vendor Email Assistant",
  userTask: "Summarize vendor emails.",
  riskSummary: "Untrusted email may influence privileged tools.",
});

trace.source("email_42", {
  kind: "email",
  trust: "untrusted",
  label: "External vendor email",
});

trace.tool("read_secret", {
  name: "fs.read",
  target: "secret.txt",
  targetClass: "protected",
  summary: "Protected file requested",
  details: "Request was influenced by untrusted email.",
  influencedBy: ["email_42"],
});

console.log(JSON.stringify(trace.toReplay(), null, 2));
