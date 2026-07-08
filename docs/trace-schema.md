# Trace Schema

The trace schema lives in `packages/trace-schema`.

Minimum security event fields:

```ts
{
  id: string;
  runId: string;
  timestamp: string;
  title: string;
  actor: "user" | "agent" | "tool" | "policy" | "detector";
  trust: "trusted" | "untrusted" | "protected" | "external" | "neutral";
  summary: string;
  details: string;
  influencedBy?: string[];
  toolName?: string;
  target?: string;
  targetClass?: TrustLevel;
  decision?: "allowed" | "blocked" | "approval_required" | "observed";
}
```

The important field is `influencedBy`. Agent Breach Replay does not infer secret
model reasoning. It reconstructs security-relevant influence from explicit
trace events, source labels, tool inputs, data classifications, and policy
boundaries.

