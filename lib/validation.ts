import { z } from "zod";

const trustLevel = z.enum([
  "trusted",
  "untrusted",
  "protected",
  "external",
  "neutral",
]);

const actor = z.enum(["user", "agent", "tool", "policy", "detector"]);
const decision = z.enum(["allowed", "blocked", "approval_required", "observed"]);
const violation = z.enum([
  "exfiltration",
  "untrusted_to_action",
  "confused_deputy",
  "destructive_write",
]);

export const securityEventSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  timestamp: z.string().datetime(),
  title: z.string().min(1),
  actor,
  trust: trustLevel,
  summary: z.string().min(1),
  details: z.string().min(1),
  sourceIds: z.array(z.string()).optional(),
  toolName: z.string().optional(),
  target: z.string().optional(),
  targetClass: trustLevel.optional(),
  destinationClass: trustLevel.optional(),
  influencedBy: z.array(z.string()).optional(),
  decision: decision.optional(),
  violation: violation.optional(),
});

export const securityTraceSchema = z.object({
  schemaVersion: z.literal("0.1"),
  runId: z.string().min(1),
  projectId: z.string().min(1),
  agentName: z.string().min(1),
  scenarioName: z.string().min(1),
  captureMode: z.enum(["metadata-only", "redacted-preview", "full-debug"]),
  startedAt: z.string().datetime(),
  userTask: z.string().min(1),
  riskSummary: z.string().min(1),
  events: z.array(securityEventSchema).min(1),
});
