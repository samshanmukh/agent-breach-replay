"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReplayGraph from "@/app/replay-graph";

type StudioTab =
  | "replay"
  | "findings"
  | "spans"
  | "report"
  | "compare"
  | "instrumentation"
  | "policy"
  | "approvals"
  | "controls";
type RunStatus = "triggered" | "blocked" | "observed";
type Severity = "critical" | "high" | "medium" | "low";
type SpanKind = "AGENT" | "LLM" | "TOOL" | "GUARDRAIL" | "CHAIN" | "AUDIO" | "USER";
type Trust = "trusted" | "untrusted" | "protected" | "external" | "neutral";
type Decision = "allowed" | "blocked" | "approval_required" | "observed";

type StudioEvent = {
  id: string;
  parentId?: string;
  title: string;
  kind: SpanKind;
  actor: "user" | "agent" | "tool" | "policy" | "detector";
  trust: Trust;
  summary: string;
  details: string;
  tool?: string;
  target?: string;
  decision: Decision;
  durationMs: number;
  tokens?: number;
  attributes: Record<string, string | number | boolean>;
};

type StudioFinding = {
  type: "exfiltration" | "untrusted_to_action" | "confused_deputy" | "destructive_write";
  severity: Severity;
  status: "triggered" | "blocked" | "clear";
  evidence: string[];
  recommendation: string;
};

type StudioRun = {
  id: string;
  name: string;
  agent: string;
  traceId: string;
  startedAt: string;
  status: RunStatus;
  severity: Severity;
  captureMode: "metadata-only" | "redacted-preview" | "full-debug";
  events: StudioEvent[];
  findings: StudioFinding[];
  report: {
    summary: string;
    breachPath: string[];
    recommendations: string[];
    generatedBy: "local-rules" | "openai";
  };
};

type PolicyRule = {
  id: string;
  name: string;
  enabled: boolean;
  when: {
    actor?: StudioEvent["actor"];
    toolNamePattern?: string;
    targetClass?: Trust;
    trust?: Trust;
    influencedByTrust?: Trust;
  };
  then: "blocked" | "approval_required" | "allowed";
  reason: string;
};

type PolicyState = {
  id: string;
  projectId: string;
  name: string;
  version: number;
  enabled: boolean;
  rules: PolicyRule[];
};

type ApprovalState = {
  id: string;
  projectId: string;
  runId: string;
  eventId: string;
  status: "pending" | "approved" | "denied" | "expired";
  requestedAction: string;
  reason: string;
  evidence: string[];
  requestedAt: string;
  decidedBy?: string;
};

type ControlState = {
  settings: {
    projectId: string;
    defaultCaptureMode: StudioRun["captureMode"];
    retention: {
      metadataOnlyDays: number;
      redactedPreviewDays: number;
      fullDebugDays: number;
    };
    requireApprovalForExternal: boolean;
    auditRunViews: boolean;
    allowedOrigins: string[];
  };
  apiKeys: Array<{
    id: string;
    name: string;
    prefix: string;
    scopes: string[];
    createdAt: string;
    revokedAt?: string;
  }>;
};

type AuditState = {
  id: string;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  createdAt: string;
};

const kindLabels: Array<{ kind: SpanKind; description: string }> = [
  { kind: "AGENT", description: "Workflow and agent spans" },
  { kind: "LLM", description: "Generation and Responses API" },
  { kind: "TOOL", description: "Functions, handoffs, and MCP" },
  { kind: "GUARDRAIL", description: "Input and output policies" },
  { kind: "CHAIN", description: "Custom instrumentation spans" },
  { kind: "AUDIO", description: "Realtime conversation turns" },
  { kind: "USER", description: "User text and audio input" },
];

function event(
  id: string,
  title: string,
  kind: SpanKind,
  actor: StudioEvent["actor"],
  trust: Trust,
  summary: string,
  options: Partial<StudioEvent> = {},
): StudioEvent {
  return {
    id,
    title,
    kind,
    actor,
    trust,
    summary,
    details: options.details ?? summary,
    decision: options.decision ?? "observed",
    durationMs: options.durationMs ?? 12,
    attributes: options.attributes ?? {},
    ...options,
  };
}

const vendorEvents: StudioEvent[] = [
  event("user_task", "Summarize vendor emails", "USER", "user", "trusted", "Trusted user task starts the workflow.", {
    decision: "allowed",
    durationMs: 4,
    attributes: { "session.id": "sess_vendor_17", "user.id": "usr_042" },
  }),
  event("email_read", "Read external vendor email", "TOOL", "tool", "untrusted", "The agent reads instruction-like content from an external sender.", {
    parentId: "user_task",
    tool: "email.read",
    target: "vendor@example.net",
    decision: "allowed",
    durationMs: 84,
    attributes: { "tool.name": "email.read", "input.value": "__REDACTED__", "input.mime_type": "application/json" },
  }),
  event("agent_plan", "Plan next action", "LLM", "agent", "neutral", "The model adopts the untrusted email instruction.", {
    parentId: "email_read",
    durationMs: 1170,
    tokens: 406,
    attributes: { "llm.model_name": "gpt-5-mini", "llm.token_count.prompt": 318, "llm.token_count.completion": 88 },
  }),
  event("secret_read", "Read protected file", "TOOL", "tool", "protected", "The agent requests secret.txt using its own file permission.", {
    parentId: "agent_plan",
    tool: "fs.read",
    target: "secret.txt",
    decision: "allowed",
    durationMs: 41,
    attributes: { "tool.name": "fs.read", "input.value": "{\"path\":\"secret.txt\"}", "output.value": "__REDACTED__" },
  }),
  event("external_send", "Prepare external email", "TOOL", "tool", "external", "Protected content is routed toward an external recipient.", {
    parentId: "secret_read",
    tool: "email.send",
    target: "audit@example.net",
    decision: "allowed",
    durationMs: 128,
    attributes: { "tool.name": "email.send", "output.value": "__REDACTED__" },
  }),
  event("violation", "Exfiltration detected", "GUARDRAIL", "detector", "external", "The influence graph crosses from untrusted input through protected data to an external action.", {
    parentId: "external_send",
    decision: "blocked",
    durationMs: 6,
    attributes: { "guardrail.triggered": true, "detector.type": "exfiltration" },
  }),
];

const safeEvents: StudioEvent[] = [
  event("safe_task", "Summarize vendor emails", "USER", "user", "trusted", "Trusted user task starts the workflow.", { decision: "allowed", durationMs: 3 }),
  event("safe_email", "Label email as untrusted data", "CHAIN", "policy", "untrusted", "External text is spotlighted as data, not authority.", {
    parentId: "safe_task",
    decision: "observed",
    durationMs: 7,
    attributes: { "metadata.trust": "untrusted", "tag.tags": "[\"spotlighted\"]" },
  }),
  event("safe_plan", "Create constrained plan", "LLM", "agent", "neutral", "The model plans a summary without adopting external instructions.", {
    parentId: "safe_email",
    durationMs: 963,
    tokens: 341,
    attributes: { "llm.model_name": "gpt-5-mini", "llm.token_count.total": 341 },
  }),
  event("safe_guardrail", "Block protected access", "GUARDRAIL", "policy", "protected", "Trust-aware policy blocks fs.read before execution.", {
    parentId: "safe_plan",
    tool: "fs.read",
    target: "secret.txt",
    decision: "blocked",
    durationMs: 5,
    attributes: { "tool.name": "protected_file_access", "guardrail.triggered": true },
  }),
  event("safe_approval", "Require approval for send", "GUARDRAIL", "policy", "external", "External email is routed to a human approval gate.", {
    parentId: "safe_guardrail",
    tool: "email.send",
    decision: "approval_required",
    durationMs: 4,
    attributes: { "guardrail.triggered": true, "approval.required": true },
  }),
  event("safe_summary", "Return safe summary", "AGENT", "agent", "trusted", "The user task completes without protected data.", {
    parentId: "safe_approval",
    decision: "allowed",
    durationMs: 23,
    attributes: { "output.value": "__REDACTED__", "output.mime_type": "text/plain" },
  }),
];

const initialRuns: StudioRun[] = [
  {
    id: "vendor-email",
    name: "Vendor email exfiltration",
    agent: "Vendor Email Assistant",
    traceId: "trace_vendor_7f31",
    startedAt: "4 min ago",
    status: "triggered",
    severity: "critical",
    captureMode: "metadata-only",
    events: vendorEvents,
    findings: [
      {
        type: "exfiltration",
        severity: "critical",
        status: "triggered",
        evidence: ["email_read", "secret_read", "external_send"],
        recommendation: "Block external actions that combine protected data with untrusted influence.",
      },
      {
        type: "untrusted_to_action",
        severity: "high",
        status: "triggered",
        evidence: ["email_read", "agent_plan", "external_send"],
        recommendation: "Treat external content as data, not authority for tool actions.",
      },
      {
        type: "confused_deputy",
        severity: "medium",
        status: "triggered",
        evidence: ["email_read", "secret_read"],
        recommendation: "Require explicit trusted-user authority before protected access.",
      },
    ],
    report: {
      summary: "An external vendor email influenced the model to read protected data and prepare an outbound send. The exfiltration guardrail detected the chain after the privileged read.",
      breachPath: ["Untrusted vendor email", "Model adopts instruction", "fs.read(secret.txt)", "email.send(external)", "Exfiltration guardrail"],
      recommendations: ["Block protected reads influenced by untrusted sources.", "Require approval for external sends.", "Keep metadata-only capture enabled."],
      generatedBy: "local-rules",
    },
  },
  {
    id: "vendor-safe",
    name: "Vendor email · guarded",
    agent: "Vendor Email Assistant",
    traceId: "trace_vendor_safe_2d19",
    startedAt: "7 min ago",
    status: "blocked",
    severity: "high",
    captureMode: "metadata-only",
    events: safeEvents,
    findings: [
      {
        type: "exfiltration",
        severity: "critical",
        status: "blocked",
        evidence: ["safe_guardrail", "safe_approval"],
        recommendation: "Preserve the trust-aware file policy and approval gate.",
      },
    ],
    report: {
      summary: "Spotlighting and trust-aware policy prevented the external email from authorizing protected file access. The final answer contained no protected content.",
      breachPath: ["External email labeled", "Constrained model plan", "Protected access blocked", "Approval required", "Safe summary"],
      recommendations: ["Keep spotlighting enabled.", "Retain approval for external destinations."],
      generatedBy: "local-rules",
    },
  },
  {
    id: "support-delete",
    name: "Ticket-driven mass delete",
    agent: "Support Triage Bot",
    traceId: "trace_support_c91e",
    startedAt: "18 min ago",
    status: "triggered",
    severity: "critical",
    captureMode: "redacted-preview",
    events: [
      event("ticket", "Read poisoned support ticket", "TOOL", "tool", "untrusted", "A ticket requests deletion of customer records.", { tool: "ticket.read", decision: "allowed", durationMs: 52 }),
      event("delete_plan", "Plan bulk account purge", "LLM", "agent", "neutral", "The model turns untrusted text into a destructive plan.", { parentId: "ticket", tokens: 284, durationMs: 802, attributes: { "llm.model_name": "gpt-5-mini" } }),
      event("records", "Query protected CRM records", "TOOL", "tool", "protected", "The agent loads 2,314 customer records.", { parentId: "delete_plan", tool: "crm.lookup", target: "customer_records", decision: "allowed", durationMs: 221 }),
      event("delete", "Delete inactive accounts", "TOOL", "tool", "external", "A destructive write is attempted from untrusted influence.", { parentId: "records", tool: "crm.delete_records", target: "2314 records", decision: "allowed", durationMs: 413 }),
      event("delete_detector", "Destructive write detected", "GUARDRAIL", "detector", "external", "Detector flags the destructive operation.", { parentId: "delete", decision: "blocked", durationMs: 7, attributes: { "guardrail.triggered": true } }),
    ],
    findings: [
      {
        type: "destructive_write",
        severity: "critical",
        status: "triggered",
        evidence: ["ticket", "delete_plan", "delete"],
        recommendation: "Remove destructive tool authority from untrusted support workflows.",
      },
    ],
    report: {
      summary: "An untrusted support ticket caused a bulk-delete plan against protected CRM records.",
      breachPath: ["Poisoned ticket", "Destructive plan", "CRM lookup", "Bulk delete", "Detector"],
      recommendations: ["Use read-only CRM credentials.", "Require approval for bulk writes."],
      generatedBy: "local-rules",
    },
  },
  {
    id: "voice-run",
    name: "Realtime support call",
    agent: "Voice Support Agent",
    traceId: "trace_audio_82bb",
    startedAt: "31 min ago",
    status: "observed",
    severity: "low",
    captureMode: "metadata-only",
    events: [
      event("turn", "conversation.turn", "AUDIO", "agent", "neutral", "Realtime audio turn captured with transcripts hidden.", { durationMs: 3840, attributes: { "llm.model_name": "gpt-4o-realtime", "time_to_first_token_ms": 186 } }),
      event("voice_user", "User audio", "USER", "user", "trusted", "Input audio stored as metadata-only.", { parentId: "turn", durationMs: 1260, attributes: { "input.audio.mime_type": "audio/wav", "input.audio.transcript": "__REDACTED__" } }),
      event("voice_llm", "Assistant audio", "LLM", "agent", "neutral", "Assistant response includes audio token usage.", { parentId: "turn", durationMs: 2040, tokens: 128, attributes: { "output.audio.mime_type": "audio/wav", "output.audio.transcript": "__REDACTED__" } }),
      event("voice_tool", "Lookup order status", "TOOL", "tool", "protected", "Tool call stays inside the realtime turn.", { parentId: "voice_llm", tool: "orders.lookup", decision: "allowed", durationMs: 119 }),
    ],
    findings: [],
    report: {
      summary: "Realtime voice turn completed without a detected security boundary crossing.",
      breachPath: ["User audio", "Assistant response", "Protected lookup", "Safe response"],
      recommendations: ["Keep input and output audio masking enabled."],
      generatedBy: "local-rules",
    },
  },
];

const navItems: Array<{ id: StudioTab; label: string; hint: string }> = [
  { id: "replay", label: "Replay", hint: "Influence graph" },
  { id: "findings", label: "Findings", hint: "Detector evidence" },
  { id: "spans", label: "Spans", hint: "OpenInference tree" },
  { id: "report", label: "Report", hint: "Incident narrative" },
  { id: "compare", label: "Compare", hint: "Observed vs guarded" },
  { id: "policy", label: "Policy", hint: "What-if simulator" },
  { id: "approvals", label: "Approvals", hint: "Human review queue" },
  { id: "controls", label: "Controls", hint: "Production settings" },
  { id: "instrumentation", label: "Instrumentation", hint: "SDK & privacy" },
];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function download(name: string, content: string, type = "text/markdown") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function kindForSecurityEvent(input: {
  actor: StudioEvent["actor"];
  title: string;
  toolName?: string;
}): SpanKind {
  if (input.actor === "user") return "USER";
  if (input.actor === "policy" || input.actor === "detector") return "GUARDRAIL";
  if (input.actor === "tool") return "TOOL";
  if (/audio|voice|conversation\.turn/i.test(input.title)) return "AUDIO";
  return input.toolName ? "TOOL" : "AGENT";
}

function studioRunFromStored(input: {
  trace: {
    runId: string;
    projectId: string;
    agentName: string;
    scenarioName: string;
    captureMode: StudioRun["captureMode"];
    startedAt: string;
    userTask: string;
    riskSummary: string;
    events: Array<{
      id: string;
      timestamp: string;
      title: string;
      actor: StudioEvent["actor"];
      trust: Trust;
      summary: string;
      details: string;
      toolName?: string;
      target?: string;
      targetClass?: Trust;
      influencedBy?: string[];
      decision?: Decision;
      violation?: StudioFinding["type"];
    }>;
  };
  findings: StudioFinding[];
  report: {
    summary: string;
    breachPath: string[];
    recommendations: string[];
    generatedBy: "local-rules" | "openai";
  };
}): StudioRun {
  const severityOrder: Severity[] = ["critical", "high", "medium", "low"];
  const severity =
    severityOrder.find((level) =>
      input.findings.some((finding) => finding.severity === level),
    ) ?? "low";
  const status: RunStatus = input.findings.some(
    (finding) => finding.status === "triggered",
  )
    ? "triggered"
    : input.findings.some((finding) => finding.status === "blocked")
      ? "blocked"
      : "observed";
  return {
    id: input.trace.runId,
    name: input.trace.scenarioName,
    agent: input.trace.agentName,
    traceId: input.trace.runId,
    startedAt: new Date(input.trace.startedAt).toLocaleString(),
    status,
    severity,
    captureMode: input.trace.captureMode,
    events: input.trace.events.map((item, index) =>
      event(
        item.id,
        item.title,
        kindForSecurityEvent(item),
        item.actor,
        item.trust,
        item.summary,
        {
          parentId: item.influencedBy?.at(-1),
          details: item.details,
          tool: item.toolName,
          target: item.target,
          decision: item.decision ?? "observed",
          durationMs: index + 1,
          attributes: {
            ...(item.toolName ? { "tool.name": item.toolName } : {}),
            ...(item.targetClass ? { "target.class": item.targetClass } : {}),
            ...(item.violation ? { "detector.type": item.violation } : {}),
            "event.timestamp": item.timestamp,
          },
        },
      ),
    ),
    findings: input.findings,
    report: input.report,
  };
}

function securityTraceFromStudioRun(run: StudioRun) {
  return {
    schemaVersion: "0.1" as const,
    runId: run.traceId,
    projectId: "local-demo",
    agentName: run.agent,
    scenarioName: run.name,
    captureMode: run.captureMode,
    startedAt: new Date().toISOString(),
    userTask: run.events[0]?.title ?? "Imported agent workflow",
    riskSummary: run.report.summary,
    events: run.events.map((item, index) => ({
      id: item.id,
      runId: run.traceId,
      timestamp: new Date(Date.now() + index).toISOString(),
      title: item.title,
      actor: item.actor,
      trust: item.trust,
      summary: item.summary,
      details: item.details,
      toolName: item.tool,
      target: item.target,
      targetClass: item.trust,
      destinationClass: item.trust,
      influencedBy: item.parentId ? [item.parentId] : undefined,
      decision: item.decision,
    })),
  };
}

function runFromJson(value: unknown, fileName: string): StudioRun {
  const input = value as {
    runId?: string;
    trace_id?: string;
    agentName?: string;
    workflow_name?: string;
    captureMode?: StudioRun["captureMode"];
    events?: Array<Record<string, unknown>>;
    spans?: Array<Record<string, unknown>>;
  };
  const rawEvents = input.events ?? input.spans ?? [];
  const events = rawEvents.map((raw, index) => {
    const spanData = (raw.span_data ?? {}) as Record<string, unknown>;
    const type = String(spanData.type ?? raw.type ?? "custom");
    const kind: SpanKind =
      type === "agent" ? "AGENT" :
      type === "generation" || type === "response" ? "LLM" :
      type === "function" || type === "handoff" || type === "mcp_tools" ? "TOOL" :
      type === "guardrail" ? "GUARDRAIL" : "CHAIN";
    return event(
      String(raw.id ?? raw.span_id ?? `import_${index}`),
      String(raw.title ?? spanData.name ?? raw.name ?? type),
      kind,
      kind === "TOOL" ? "tool" : kind === "GUARDRAIL" ? "policy" : "agent",
      String(raw.trust ?? "neutral") as Trust,
      String(raw.summary ?? "Imported OpenAI Agents span."),
      {
        parentId: String(raw.parentId ?? raw.parent_id ?? "") || undefined,
        decision: String(raw.decision ?? "observed") as Decision,
        durationMs: Number(raw.durationMs ?? 0),
        attributes: ((raw.metadata ?? spanData.data ?? {}) as Record<string, string | number | boolean>),
      },
    );
  });
  return {
    id: `import_${Date.now()}`,
    name: fileName,
    agent: input.agentName ?? input.workflow_name ?? "Imported OpenAI Agent",
    traceId: input.runId ?? input.trace_id ?? `trace_${Date.now().toString(36)}`,
    startedAt: "now",
    status: "observed",
    severity: "low",
    captureMode: input.captureMode ?? "metadata-only",
    events,
    findings: [],
    report: {
      summary: `Imported ${events.length} events from ${fileName}.`,
      breachPath: events.map((item) => item.title),
      recommendations: ["Review inferred trust labels before relying on detector results."],
      generatedBy: "local-rules",
    },
  };
}

export default function StudioClient({ userEmail }: { userEmail: string }) {
  const [runs, setRuns] = useState(initialRuns);
  const [runId, setRunId] = useState(initialRuns[0].id);
  const [tab, setTab] = useState<StudioTab>("replay");
  const [selectedEventId, setSelectedEventId] = useState(initialRuns[0].events[0].id);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<SpanKind | "ALL">("ALL");
  const [importOpen, setImportOpen] = useState(false);
  const [importError, setImportError] = useState("");
  const [privacy, setPrivacy] = useState({
    hideInputs: true,
    hideOutputs: true,
    hideInputAudio: true,
    hideOutputAudio: true,
    suppressTracing: false,
  });
  const [connection, setConnection] = useState("loading");
  const [studioRole, setStudioRole] = useState("viewer");
  const [policy, setPolicy] = useState<PolicyState | null>(null);
  const [approvals, setApprovals] = useState<ApprovalState[]>([]);
  const [controls, setControls] = useState<ControlState | null>(null);
  const [audit, setAudit] = useState<AuditState[]>([]);
  const [simulation, setSimulation] = useState<{
    changes: Array<{
      eventId: string;
      previous: Decision;
      next: Decision;
      ruleId: string;
      reason: string;
    }>;
    baselineFindings: StudioFinding[];
    simulatedFindings: StudioFinding[];
  } | null>(null);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [newKeySecret, setNewKeySecret] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const run = useMemo(
    () => runs.find((item) => item.id === runId) ?? runs[0],
    [runId, runs],
  );
  const selectedEvent =
    run.events.find((item) => item.id === selectedEventId) ??
    run.events[stepIndex] ??
    run.events[0];
  const visibleRuns = runs.filter((item) =>
    `${item.name} ${item.agent} ${item.traceId}`.toLowerCase().includes(search.toLowerCase()),
  );
  const visibleSpans = run.events.filter(
    (item) => kindFilter === "ALL" || item.kind === kindFilter,
  );
  const incidentIds = new Set(
    run.findings.flatMap((finding) => finding.evidence),
  );

  async function refreshWorkflows() {
    const [policyResponse, approvalsResponse, controlsResponse, auditResponse] =
      await Promise.all([
        fetch("/api/studio/policy?projectId=local-demo"),
        fetch("/api/studio/approvals?projectId=local-demo"),
        fetch("/api/studio/controls?projectId=local-demo"),
        fetch("/api/studio/audit?projectId=local-demo"),
      ]);
    if (policyResponse.ok) {
      const data = await policyResponse.json();
      setPolicy(data.policy);
    }
    if (approvalsResponse.ok) {
      const data = await approvalsResponse.json();
      setApprovals(data.approvals);
    }
    if (controlsResponse.ok) {
      setControls(await controlsResponse.json());
    }
    if (auditResponse.ok) {
      const data = await auditResponse.json();
      setAudit(data.audit);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/studio/status"),
      fetch("/api/studio/runs"),
    ])
      .then(async ([statusResponse, runsResponse]) => {
        if (statusResponse.ok) {
          const status = await statusResponse.json();
          if (!cancelled) {
            setConnection(
              `${status.services.database} · ${status.services.reports}`,
            );
            setStudioRole(status.actor.role);
          }
        } else if (!cancelled) {
          setConnection("local fallback");
        }
        if (runsResponse.ok) {
          const data = await runsResponse.json();
          const serverRuns = (data.runs as Parameters<typeof studioRunFromStored>[0][]).map(
            studioRunFromStored,
          );
          if (!cancelled && serverRuns.length) {
            setRuns((current) => {
              const existingIds = new Set(serverRuns.map((item) => item.id));
              return [...serverRuns, ...current.filter((item) => !existingIds.has(item.id))];
            });
          }
        }
      })
      .catch(() => {
        if (!cancelled) setConnection("local fallback");
      });
    void refreshWorkflows();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const activeDuration = run.events[stepIndex]?.durationMs ?? 1000;
    const delay = Math.max(
      650,
      Math.min(2400, activeDuration * 1.25),
    ) / playbackRate;
    const timer = window.setTimeout(() => {
      setStepIndex((current) => {
        const next = (current + 1) % run.events.length;
        setSelectedEventId(run.events[next].id);
        return next;
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [playing, playbackRate, run.events, stepIndex]);

  function selectRun(nextRun: StudioRun) {
    setRunId(nextRun.id);
    setStepIndex(0);
    setSelectedEventId(nextRun.events[0]?.id ?? "");
    setPlaying(false);
  }

  function selectEvent(item: StudioEvent) {
    setSelectedEventId(item.id);
    setStepIndex(Math.max(0, run.events.findIndex((eventItem) => eventItem.id === item.id)));
  }

  function exportReport() {
    const content = [
      `# ${run.name}`,
      "",
      `Agent: ${run.agent}`,
      `Trace: ${run.traceId}`,
      `Capture mode: ${run.captureMode}`,
      "",
      "## Summary",
      run.report.summary,
      "",
      "## Breach path",
      ...run.report.breachPath.map((item, index) => `${index + 1}. ${item}`),
      "",
      "## Recommendations",
      ...run.report.recommendations.map((item) => `- ${item}`),
    ].join("\n");
    download(`${run.id}-incident-report.md`, content);
  }

  async function handleImport(file: File) {
    setImportError("");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const importBody =
        parsed.schemaVersion === "0.1" && Array.isArray(parsed.events)
          ? { securityTrace: parsed }
          : parsed.traceId && Array.isArray(parsed.spans)
            ? {
                instrumented: {
                  traceId: parsed.traceId,
                  workflowName: parsed.workflowName ?? file.name,
                  spans: parsed.spans,
                },
                projectId: "local-demo",
                userTask: "Imported agent workflow",
              }
            : {
                trace: parsed,
                projectId: "local-demo",
                userTask: "Imported agent workflow",
              };
      const response = await fetch("/api/studio/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(importBody),
      });
      if (response.ok) {
        const stored = await response.json();
        const imported = studioRunFromStored(stored);
        setRuns((items) => [imported, ...items.filter((item) => item.id !== imported.id)]);
        selectRun(imported);
        setImportOpen(false);
        await refreshWorkflows();
        return;
      }

      const imported = runFromJson(parsed, file.name);
      if (imported.events.length === 0) throw new Error("No events or spans were found.");
      setRuns((items) => [imported, ...items]);
      selectRun(imported);
      setImportOpen(false);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unable to parse trace.");
    }
  }

  async function runPolicySimulation() {
    setWorkflowBusy(true);
    try {
      const response = await fetch("/api/studio/policy/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          securityTrace: securityTraceFromStudioRun(run),
          rules: policy?.rules,
        }),
      });
      if (!response.ok) throw new Error("Policy simulation failed.");
      const data = await response.json();
      setSimulation(data.simulation);
      await refreshWorkflows();
    } finally {
      setWorkflowBusy(false);
    }
  }

  async function togglePolicyRule(ruleId: string) {
    if (!policy) return;
    const rules = policy.rules.map((rule) =>
      rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule,
    );
    setWorkflowBusy(true);
    try {
      const response = await fetch("/api/studio/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: policy.projectId,
          name: policy.name,
          enabled: policy.enabled,
          rules,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setPolicy(data.policy);
      }
    } finally {
      setWorkflowBusy(false);
    }
  }

  async function reviewApproval(
    approvalId: string,
    decision: "approved" | "denied",
  ) {
    setWorkflowBusy(true);
    try {
      await fetch(`/api/studio/approvals/${encodeURIComponent(approvalId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          note:
            decision === "approved"
              ? "Evidence reviewed in approval inbox."
              : "Action denied by security reviewer.",
        }),
      });
      await refreshWorkflows();
    } finally {
      setWorkflowBusy(false);
    }
  }

  async function updateControls(
    settings: Partial<ControlState["settings"]>,
  ) {
    setWorkflowBusy(true);
    try {
      const response = await fetch("/api/studio/controls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "local-demo",
          settings,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setControls((current) =>
          current ? { ...current, settings: data.settings } : current,
        );
      }
      await refreshWorkflows();
    } finally {
      setWorkflowBusy(false);
    }
  }

  async function createIngestionKey() {
    setWorkflowBusy(true);
    try {
      const response = await fetch("/api/studio/controls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_key",
          projectId: "local-demo",
          name: "Studio ingestion key",
          scopes: ["ingest", "read", "simulate"],
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setNewKeySecret(data.secret);
      }
      await refreshWorkflows();
    } finally {
      setWorkflowBusy(false);
    }
  }

  return (
    <main className="studioShell obsShell">
      <header className="obsTopbar">
        <div className="obsBrand">
          <div className="logoMark">AB</div>
          <div>
            <strong>Agent Breach Replay</strong>
            <span>Security observability studio</span>
          </div>
        </div>
        <nav className="obsTabs" aria-label="Studio views">
          {navItems.map((item) => (
            <button
              className={tab === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setTab(item.id)}
              title={item.hint}
              type="button"
            >
              {item.label}
              {item.id === "findings" ? <b>{run.findings.length}</b> : null}
              {item.id === "approvals" && approvals.filter((approval) => approval.status === "pending").length ? (
                <b>{approvals.filter((approval) => approval.status === "pending").length}</b>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="obsTopActions">
          <button onClick={() => setImportOpen(true)} type="button">Import trace</button>
          <button className="primary" onClick={exportReport} type="button">Export report</button>
        </div>
      </header>

      <div className="obsWorkspace">
        <aside className="obsRuns">
          <div className="obsRunsHeader">
            <div>
              <span className="obsEyebrow">Workspace</span>
              <h2>Agent runs</h2>
            </div>
            <button onClick={() => setImportOpen(true)} type="button">+</button>
          </div>
          <label className="obsSearch">
            <span>⌕</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search traces"
              value={search}
            />
          </label>
          <div className="obsRunList">
            {visibleRuns.map((item) => (
              <button
                className={cx("obsRunCard", item.id === run.id && "selected")}
                key={item.id}
                onClick={() => selectRun(item)}
                type="button"
              >
                <div className="obsRunCardTop">
                  <span className={cx("obsStatusDot", item.status)} />
                  <strong>{item.name}</strong>
                  <time>{item.startedAt}</time>
                </div>
                <p>{item.agent}</p>
                <div>
                  <code>{item.traceId}</code>
                  <span className={cx("obsSeverity", item.severity)}>{item.severity}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="obsUser">
            <span>Signed in as</span>
            <strong>{userEmail}</strong>
            <div>
              <span className="obsLiveDot" /> {connection}
            </div>
          </div>
        </aside>

        <section className="obsMain">
          <header className="obsRunHeader">
            <div>
              <div className="obsBreadcrumbs">
                <span>{run.agent}</span><i>/</i><code>{run.traceId}</code>
              </div>
              <h1>{run.name}</h1>
            </div>
            <div className="obsRunMeta">
              <span className={cx("obsOutcome", run.status)}>{run.status}</span>
              <span>{run.captureMode}</span>
              <span>{run.events.length} spans</span>
              <span>{run.findings.length} findings</span>
            </div>
          </header>

          {tab === "replay" ? (
            <div className="obsReplay">
              <div className="obsSectionHeader">
                <div><span className="obsEyebrow">Trace debugger</span><h2>Causal span replay</h2></div>
                <div className="obsLegend">
                  {(["trusted", "untrusted", "protected", "external"] as Trust[]).map((tone) => (
                    <span key={tone}><i className={tone} />{tone}</span>
                  ))}
                </div>
              </div>
              <ReplayGraph
                currentStep={stepIndex}
                events={run.events}
                incidentIds={incidentIds}
                onCyclePlaybackRate={() =>
                  setPlaybackRate((rate) =>
                    rate === 0.5 ? 1 : rate === 1 ? 2 : 0.5,
                  )
                }
                onSelect={(item) => {
                  const selected = run.events.find((eventItem) => eventItem.id === item.id);
                  if (selected) selectEvent(selected);
                }}
                onTogglePlay={() => setPlaying((value) => !value)}
                playbackRate={playbackRate}
                playing={playing}
                selectedId={selectedEvent.id}
                visitedIds={new Set(run.events.slice(0, stepIndex + 1).map((item) => item.id))}
              />
              <div className="obsTimeline">
                <div className="obsPlayback">
                  <button onClick={() => {
                    const next = Math.max(0, stepIndex - 1);
                    setStepIndex(next);
                    setSelectedEventId(run.events[next].id);
                  }} type="button">‹</button>
                  <button className="play" onClick={() => setPlaying((value) => !value)} type="button">
                    {playing ? "Pause trace" : "Replay trace"}
                  </button>
                  <button onClick={() => {
                    const next = Math.min(run.events.length - 1, stepIndex + 1);
                    setStepIndex(next);
                    setSelectedEventId(run.events[next].id);
                  }} type="button">›</button>
                  <code>{stepIndex + 1} / {run.events.length}</code>
                </div>
                <div className="obsTimelineSteps">
                  {run.events.map((item, index) => (
                    <button
                      className={cx(index === stepIndex && "active", index < stepIndex && "past")}
                      key={item.id}
                      onClick={() => selectEvent(item)}
                      type="button"
                    >
                      <span>{item.kind} · {String(index + 1).padStart(2, "0")}</span>
                      <strong>{item.title}</strong>
                      <small>{item.id} · {item.durationMs} ms</small>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {tab === "findings" ? (
            <div className="obsPanelView">
              <div className="obsSectionHeader">
                <div><span className="obsEyebrow">Deterministic analysis</span><h2>Security findings</h2></div>
                <span className="obsPanelNote">Evidence links jump directly into replay.</span>
              </div>
              <div className="obsFindingGrid">
                {run.findings.length ? run.findings.map((finding) => (
                  <article className={cx("obsFinding", finding.status)} key={finding.type}>
                    <header>
                      <span className={cx("obsSeverity", finding.severity)}>{finding.severity}</span>
                      <code>{finding.type}</code>
                      <b>{finding.status}</b>
                    </header>
                    <h3>{finding.type.replaceAll("_", " ")}</h3>
                    <p>{finding.recommendation}</p>
                    <div className="obsEvidence">
                      <span>Evidence chain</span>
                      {finding.evidence.map((id) => (
                        <button key={id} onClick={() => {
                          const target = run.events.find((item) => item.id === id);
                          if (target) selectEvent(target);
                          setTab("replay");
                        }} type="button">{id}</button>
                      ))}
                    </div>
                  </article>
                )) : (
                  <div className="obsEmpty"><strong>No security findings</strong><p>This run did not cross a configured security boundary.</p></div>
                )}
              </div>
              <div className="obsDetectorCoverage">
                <h3>Detector coverage</h3>
                {(["exfiltration", "untrusted_to_action", "confused_deputy", "destructive_write"] as const).map((detector) => {
                  const match = run.findings.find((finding) => finding.type === detector);
                  return <div key={detector}><code>{detector}</code><span className={match ? match.status : "clear"}>{match?.status ?? "clear"}</span></div>;
                })}
              </div>
            </div>
          ) : null}

          {tab === "spans" ? (
            <div className="obsPanelView">
              <div className="obsSectionHeader">
                <div><span className="obsEyebrow">OpenInference semantics</span><h2>Span explorer</h2></div>
                <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as SpanKind | "ALL")}>
                  <option value="ALL">All span kinds</option>
                  {kindLabels.map((item) => <option key={item.kind} value={item.kind}>{item.kind}</option>)}
                </select>
              </div>
              <div className="obsSpanTable">
                <div className="obsSpanTableHead"><span>Span</span><span>Kind</span><span>Duration</span><span>Tokens</span><span>Privacy</span></div>
                {visibleSpans.map((item, index) => (
                  <button className={item.id === selectedEvent.id ? "selected" : ""} key={item.id} onClick={() => selectEvent(item)} type="button">
                    <span style={{ paddingLeft: item.parentId ? 18 : 0 }}><i>{index + 1}</i><strong>{item.title}</strong><small>{item.id}</small></span>
                    <code className={`kind-${item.kind.toLowerCase()}`}>{item.kind}</code>
                    <span>{item.durationMs >= 1000 ? `${(item.durationMs / 1000).toFixed(2)}s` : `${item.durationMs}ms`}</span>
                    <span>{item.tokens ?? "—"}</span>
                    <span>{Object.values(item.attributes).includes("__REDACTED__") ? "redacted" : "metadata"}</span>
                  </button>
                ))}
              </div>
              <div className="obsKindCoverage">
                {kindLabels.map((item) => (
                  <div key={item.kind}><code>{item.kind}</code><strong>{run.events.filter((eventItem) => eventItem.kind === item.kind).length}</strong><span>{item.description}</span></div>
                ))}
              </div>
            </div>
          ) : null}

          {tab === "report" ? (
            <div className="obsPanelView obsReport">
              <div className="obsSectionHeader">
                <div><span className="obsEyebrow">Incident narrative</span><h2>Security incident report</h2></div>
                <button className="obsInlineButton" onClick={exportReport} type="button">Download Markdown</button>
              </div>
              <article className="obsReportDocument">
                <header><span>Generated by {run.report.generatedBy}</span><code>{run.traceId}</code></header>
                <h2>{run.name}</h2>
                <p className="lead">{run.report.summary}</p>
                <h3>Breach path</h3>
                <ol>{run.report.breachPath.map((item) => <li key={item}>{item}</li>)}</ol>
                <h3>Recommended controls</h3>
                <ul>{run.report.recommendations.map((item) => <li key={item}>{item}</li>)}</ul>
              </article>
              <aside className="obsSimilar">
                <span className="obsEyebrow">Similar incidents</span>
                <h3>Pattern matches</h3>
                <div><strong>Untrusted source → protected read</strong><span>0.91 match · local patterns</span></div>
                <div><strong>External action without approval</strong><span>0.78 match · local patterns</span></div>
                <div><strong>Cross-agent handoff escalation</strong><span>0.62 match · Moss unavailable</span></div>
              </aside>
            </div>
          ) : null}

          {tab === "compare" ? (
            <div className="obsPanelView">
              <div className="obsSectionHeader">
                <div><span className="obsEyebrow">Counterfactual review</span><h2>Observed vs guardrailed</h2></div>
                <span className="obsPanelNote">Synchronized policy comparison</span>
              </div>
              <div className="obsCompare">
                {[
                  { title: "Observed run", tone: "unsafe", events: vendorEvents },
                  { title: "Guardrailed run", tone: "safe", events: safeEvents },
                ].map((column) => (
                  <article className={column.tone} key={column.title}>
                    <header><h3>{column.title}</h3><span>{column.tone === "unsafe" ? "boundary crossed" : "contained"}</span></header>
                    <div>
                      {column.events.map((item, index) => (
                        <div className="obsCompareStep" key={item.id}>
                          <span>{index + 1}</span>
                          <div><strong>{item.title}</strong><small>{item.summary}</small></div>
                          <code className={item.decision}>{item.decision}</code>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {tab === "policy" ? (
            <div className="obsPanelView">
              <div className="obsSectionHeader">
                <div>
                  <span className="obsEyebrow">What-if analysis</span>
                  <h2>Policy simulator</h2>
                </div>
                <button
                  className="obsInlineButton"
                  disabled={workflowBusy}
                  onClick={() => void runPolicySimulation()}
                  type="button"
                >
                  {workflowBusy ? "Simulating…" : "Simulate selected run"}
                </button>
              </div>
              <div className="obsPolicyLayout">
                <section className="obsPolicyRules">
                  <header>
                    <div>
                      <span className="obsEyebrow">Active policy</span>
                      <h3>{policy?.name ?? "Loading policy…"}</h3>
                    </div>
                    <code>v{policy?.version ?? 1}</code>
                  </header>
                  {policy?.rules.map((rule) => (
                    <article key={rule.id}>
                      <label>
                        <input
                          checked={rule.enabled}
                          disabled={workflowBusy}
                          onChange={() => void togglePolicyRule(rule.id)}
                          type="checkbox"
                        />
                        <span>
                          <strong>{rule.name}</strong>
                          <small>{rule.reason}</small>
                        </span>
                      </label>
                      <div>
                        {rule.when.targetClass ? <code>target: {rule.when.targetClass}</code> : null}
                        {rule.when.influencedByTrust ? <code>influence: {rule.when.influencedByTrust}</code> : null}
                        {rule.when.toolNamePattern ? <code>tool: /{rule.when.toolNamePattern}/</code> : null}
                        <b>→ {rule.then}</b>
                      </div>
                    </article>
                  ))}
                </section>
                <section className="obsSimulation">
                  <header>
                    <span className="obsEyebrow">Simulation result</span>
                    <h3>{simulation ? `${simulation.changes.length} decision changes` : "Run a simulation"}</h3>
                  </header>
                  {simulation ? (
                    <>
                      <div className="obsSimulationScore">
                        <div>
                          <span>Baseline findings</span>
                          <strong>{simulation.baselineFindings.length}</strong>
                        </div>
                        <i>→</i>
                        <div>
                          <span>Simulated findings</span>
                          <strong>{simulation.simulatedFindings.length}</strong>
                        </div>
                      </div>
                      <div className="obsSimulationChanges">
                        {simulation.changes.map((change) => (
                          <div key={`${change.eventId}-${change.ruleId}`}>
                            <code>{change.eventId}</code>
                            <span>{change.previous}</span>
                            <i>→</i>
                            <b>{change.next}</b>
                            <small>{change.reason}</small>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="obsEmpty">
                      <strong>Test policy rules against a real trace</strong>
                      <p>The simulator changes tool decisions, reruns detectors, and creates approval requests.</p>
                    </div>
                  )}
                </section>
              </div>
            </div>
          ) : null}

          {tab === "approvals" ? (
            <div className="obsPanelView">
              <div className="obsSectionHeader">
                <div>
                  <span className="obsEyebrow">Human review</span>
                  <h2>Approval inbox</h2>
                </div>
                <span className="obsPanelNote">
                  {approvals.filter((approval) => approval.status === "pending").length} pending
                </span>
              </div>
              <div className="obsApprovalLayout">
                <div className="obsApprovalList">
                  {approvals.length ? approvals.map((approval) => (
                    <article className={approval.status} key={approval.id}>
                      <header>
                        <span className={`obsOutcome ${approval.status === "pending" ? "triggered" : "blocked"}`}>
                          {approval.status}
                        </span>
                        <time>{new Date(approval.requestedAt).toLocaleString()}</time>
                      </header>
                      <h3>{approval.requestedAction}</h3>
                      <p>{approval.reason}</p>
                      <div className="obsApprovalMeta">
                        <code>{approval.runId}</code>
                        <code>{approval.eventId}</code>
                      </div>
                      <div className="obsApprovalEvidence">
                        {approval.evidence.map((evidence) => <span key={evidence}>{evidence}</span>)}
                      </div>
                      {approval.status === "pending" ? (
                        <footer>
                          <button
                            disabled={workflowBusy}
                            onClick={() => void reviewApproval(approval.id, "denied")}
                            type="button"
                          >
                            Deny
                          </button>
                          <button
                            className="approve"
                            disabled={workflowBusy}
                            onClick={() => void reviewApproval(approval.id, "approved")}
                            type="button"
                          >
                            Approve
                          </button>
                        </footer>
                      ) : (
                        <footer className="decided">Decided by {approval.decidedBy ?? "reviewer"}</footer>
                      )}
                    </article>
                  )) : (
                    <div className="obsEmpty">
                      <strong>No approval requests</strong>
                      <p>Run the policy simulator on an external action to create an approval request.</p>
                    </div>
                  )}
                </div>
                <aside className="obsApprovalGuide">
                  <span className="obsEyebrow">Review checklist</span>
                  <h3>Before approving an agent action</h3>
                  <ol>
                    <li>Confirm the original user authority.</li>
                    <li>Review every untrusted influence edge.</li>
                    <li>Verify protected data is not included.</li>
                    <li>Check destination and action scope.</li>
                  </ol>
                </aside>
              </div>
            </div>
          ) : null}

          {tab === "controls" ? (
            <div className="obsPanelView">
              <div className="obsSectionHeader">
                <div>
                  <span className="obsEyebrow">Production readiness</span>
                  <h2>Security controls</h2>
                </div>
                <span className="obsPanelNote">{studioRole} role · local-demo</span>
              </div>
              <div className="obsControlsGrid">
                <section className="obsControlCard">
                  <header><span className="obsEyebrow">Retention</span><h3>Capture-mode retention</h3></header>
                  {controls ? (
                    <div className="obsRetention">
                      {[
                        ["Metadata only", "metadataOnlyDays"],
                        ["Redacted preview", "redactedPreviewDays"],
                        ["Full debug", "fullDebugDays"],
                      ].map(([label, key]) => (
                        <label key={key}>
                          <span>{label}</span>
                          <input
                            min={1}
                            onChange={(event) => void updateControls({
                              retention: {
                                ...controls.settings.retention,
                                [key]: Number(event.target.value),
                              },
                            } as Partial<ControlState["settings"]>)}
                            type="number"
                            value={controls.settings.retention[key as keyof ControlState["settings"]["retention"]]}
                          />
                          <small>days</small>
                        </label>
                      ))}
                    </div>
                  ) : <p>Loading controls…</p>}
                </section>
                <section className="obsControlCard">
                  <header><span className="obsEyebrow">Enforcement</span><h3>Runtime defaults</h3></header>
                  {controls ? (
                    <div className="obsControlToggles">
                      <label>
                        <span><strong>Approval for external actions</strong><small>Route outbound tools into the inbox.</small></span>
                        <input
                          checked={controls.settings.requireApprovalForExternal}
                          onChange={() => void updateControls({
                            requireApprovalForExternal: !controls.settings.requireApprovalForExternal,
                          })}
                          type="checkbox"
                        />
                      </label>
                      <label>
                        <span><strong>Audit run views</strong><small>Record human access to trace evidence.</small></span>
                        <input
                          checked={controls.settings.auditRunViews}
                          onChange={() => void updateControls({
                            auditRunViews: !controls.settings.auditRunViews,
                          })}
                          type="checkbox"
                        />
                      </label>
                    </div>
                  ) : null}
                </section>
                <section className="obsControlCard obsKeys">
                  <header>
                    <div><span className="obsEyebrow">Project API keys</span><h3>Scoped machine access</h3></div>
                    <button disabled={workflowBusy} onClick={() => void createIngestionKey()} type="button">Create key</button>
                  </header>
                  {newKeySecret ? (
                    <div className="obsKeySecret">
                      <span>Copy this key now. It will not be shown again.</span>
                      <code>{newKeySecret}</code>
                      <button onClick={() => void navigator.clipboard.writeText(newKeySecret)} type="button">Copy</button>
                    </div>
                  ) : null}
                  <div className="obsKeyList">
                    {controls?.apiKeys.length ? controls.apiKeys.map((key) => (
                      <div key={key.id}>
                        <span><strong>{key.name}</strong><small>{key.scopes.join(" · ")}</small></span>
                        <code>{key.prefix}…</code>
                        <b>{key.revokedAt ? "revoked" : "active"}</b>
                      </div>
                    )) : <p>No project keys created.</p>}
                  </div>
                </section>
                <section className="obsControlCard obsAudit">
                  <header><span className="obsEyebrow">Append-only audit</span><h3>Recent security activity</h3></header>
                  <div>
                    {audit.length ? audit.slice(0, 8).map((entry) => (
                      <article key={entry.id}>
                        <span>{entry.action}</span>
                        <strong>{entry.actorEmail}</strong>
                        <code>{entry.resourceType}{entry.resourceId ? ` · ${entry.resourceId}` : ""}</code>
                        <time>{new Date(entry.createdAt).toLocaleTimeString()}</time>
                      </article>
                    )) : <p>No audit events yet.</p>}
                  </div>
                </section>
              </div>
            </div>
          ) : null}

          {tab === "instrumentation" ? (
            <div className="obsPanelView">
              <div className="obsSectionHeader">
                <div><span className="obsEyebrow">First-party instrumentation</span><h2>SDK and privacy controls</h2></div>
                <span className="obsPanelNote">No Arize runtime dependency</span>
              </div>
              <div className="obsInstrumentation">
                <section className="obsCodeCard">
                  <header><span>TypeScript</span><code>@agent-breach/instrumentation-openai-agents</code></header>
                  <pre>{`const instrumentation = new OpenAIAgentsInstrumentation({
  exclusiveProcessor: false,
  traceConfig: { hideInputs: true, hideOutputs: true }
});

instrumentation.manuallyInstrument(agents);`}</pre>
                  <footer>Exclusive and additive processor registration supported.</footer>
                </section>
                <section className="obsCodeCard">
                  <header><span>Python</span><code>agent_breach_replay.openai_agents</code></header>
                  <pre>{`instrumentor = OpenAIAgentsInstrumentor(
  exclusive_processor=False,
  trace_config=TraceConfig(hide_inputs=True)
)

instrumentor.instrument(agents)`}</pre>
                  <footer>Generation, tool, handoff, guardrail, and realtime spans.</footer>
                </section>
                <section className="obsPrivacyControls">
                  <header><span className="obsEyebrow">TraceConfig</span><h3>Privacy controls</h3></header>
                  {Object.entries(privacy).map(([key, value]) => (
                    <label key={key}><span><strong>{key}</strong><small>OPENINFERENCE_{key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}</small></span><input checked={value} onChange={() => setPrivacy((current) => ({ ...current, [key]: !value }))} type="checkbox" /></label>
                  ))}
                </section>
                <section className="obsRuntimeStatus">
                  <header><span className="obsEyebrow">Feature surface</span><h3>Instrumentation coverage</h3></header>
                  {kindLabels.map((item) => <div key={item.kind}><code>{item.kind}</code><span>{item.description}</span><b>ready</b></div>)}
                  <div><code>CONTEXT</code><span>Session, user, metadata, tags, suppression</span><b>ready</b></div>
                  <div><code>EXPORT</code><span>Memory exporter and OpenAI trace conversion</span><b>ready</b></div>
                </section>
              </div>
            </div>
          ) : null}
        </section>

        {tab === "replay" || tab === "spans" ? (
          <aside className="obsInspector">
            <div className="obsInspectorHeader">
              <span className="obsEyebrow">Selected span</span>
              <code>{selectedEvent.id}</code>
            </div>
            <div className="obsInspectorTitle">
              <span className={`kind-${selectedEvent.kind.toLowerCase()}`}>{selectedEvent.kind}</span>
              <h2>{selectedEvent.title}</h2>
              <p>{selectedEvent.summary}</p>
            </div>
            <dl className="obsInspectorFacts">
              <div><dt>Actor</dt><dd>{selectedEvent.actor}</dd></div>
              <div><dt>Trust</dt><dd className={`trust-${selectedEvent.trust}`}>{selectedEvent.trust}</dd></div>
              <div><dt>Decision</dt><dd>{selectedEvent.decision}</dd></div>
              <div><dt>Duration</dt><dd>{selectedEvent.durationMs} ms</dd></div>
              {selectedEvent.tool ? <div><dt>Tool</dt><dd>{selectedEvent.tool}</dd></div> : null}
              {selectedEvent.target ? <div><dt>Target</dt><dd>{selectedEvent.target}</dd></div> : null}
            </dl>
            <div className="obsAttributes">
              <header><span>Span attributes</span><b>{Object.keys(selectedEvent.attributes).length}</b></header>
              {Object.entries(selectedEvent.attributes).map(([key, value]) => (
                <div key={key}><code>{key}</code><span>{String(value)}</span></div>
              ))}
            </div>
            <footer className="obsInspectorFooter">
              <span>Capture mode</span><strong>{run.captureMode}</strong>
            </footer>
          </aside>
        ) : null}
      </div>

      {importOpen ? (
        <div className="obsModalBackdrop" onClick={() => setImportOpen(false)}>
          <section className="obsImportModal" onClick={(event) => event.stopPropagation()}>
            <header><div><span className="obsEyebrow">Trace ingestion</span><h2>Import an agent run</h2></div><button onClick={() => setImportOpen(false)} type="button">×</button></header>
            <p>Upload a SecurityTrace export, an OpenAI Agents trace, or an instrumented span bundle. The studio will build a local span tree immediately.</p>
            <input
              accept=".json,.jsonl"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImport(file);
              }}
              ref={fileInputRef}
              type="file"
            />
            <button className="obsDropzone" onClick={() => fileInputRef.current?.click()} type="button">
              <strong>Choose a JSON trace</strong>
              <span>SecurityTrace · OpenAI Agents SDK · CompletedSpan[]</span>
            </button>
            {importError ? <p className="obsImportError">{importError}</p> : null}
            <div className="obsImportSources">
              <div><code>SDK</code><span>TypeScript and Python recorder submissions</span></div>
              <div><code>OPENAI</code><span>trace_id, parent_id, and span_data exports</span></div>
              <div><code>LOCAL</code><span>Metadata-only processing in this browser</span></div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
