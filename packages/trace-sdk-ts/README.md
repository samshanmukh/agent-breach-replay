# @agent-breach/replay

TypeScript SDK for capturing privacy-first security traces from tool-using AI
agents.

## Install

```bash
npm install @agent-breach/replay
```

## Usage

```ts
import { createSecurityTrace } from "@agent-breach/replay";

const trace = createSecurityTrace({
  projectId: "prod",
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

await trace.submit({
  endpoint: "https://your-agent-breach-app.vercel.app",
  apiKey: process.env.AGENT_BREACH_API_KEY,
});
```

## Privacy

The SDK is metadata-first. Do not send raw private content unless your capture
mode and retention policy explicitly allow it.

