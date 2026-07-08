# @agent-breach/trace-schema

Shared TypeScript types and runtime assertions for Agent Breach Replay security
traces.

```ts
import type { SecurityTrace } from "@agent-breach/trace-schema";
```

The schema is intentionally metadata-first: it represents source labels, tool
boundaries, influence links, policy decisions, and detector findings without
requiring raw private content.

