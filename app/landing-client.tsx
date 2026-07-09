"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import "./landing.css";

type TabId = "full" | "tracing" | "prevention";
type Badge = "purple" | "orange" | "green" | "red" | "blue";

type StoryStep = {
  id: string;
  step: string;
  title: string;
  description: string;
  badge: Badge;
  chips: string[];
  code?: string;
  children?: StoryStep[];
};

const tracingSteps: StoryStep[] = [
  {
    id: "hook",
    step: "01",
    title: "Instrumentation hook",
    description:
      "Register the local processor with the OpenAI Agents SDK. Exclusive mode replaces SDK processors. Additive mode keeps native tracing alongside ours.",
    badge: "purple",
    chips: ["OpenAIAgentsInstrumentation", "exclusiveProcessor", "manuallyInstrument"],
    code: `instrumentation.manuallyInstrument(agents);`,
    children: [
      {
        id: "processor",
        step: "02",
        title: "AgentBreachTracingProcessor",
        description:
          "Listens to onTraceStart, onTraceEnd, onSpanStart, and onSpanEnd. Every SDK event becomes an OpenInference-compatible local span.",
        badge: "purple",
        chips: ["MemorySpanExporter", "TracingProcessor", "OpenInference semantics"],
      },
    ],
  },
  {
    id: "root",
    step: "03",
    title: "Trace root span",
    description:
      "Each workflow opens a root AGENT span named after the run. This becomes the parent container for every child span in the trace.",
    badge: "orange",
    chips: ["openinference.span.kind=AGENT", "llm.system=openai"],
    children: [
      {
        id: "hierarchy",
        step: "04",
        title: "Span hierarchy",
        description:
          "Child spans resolve parents through SDK parent_id links so influence chains can be reconstructed during security replay.",
        badge: "orange",
        chips: ["parent_id", "span_id", "trace_id", "started_at", "ended_at"],
      },
    ],
  },
  {
    id: "mapping",
    step: "05",
    title: "Semantic span mapping",
    description:
      "SDK span types are mapped to OpenInference kinds and enriched with the right attributes when each span ends.",
    badge: "green",
    chips: ["AGENT", "LLM", "TOOL", "GUARDRAIL", "CHAIN", "AUDIO", "USER"],
    children: [
      {
        id: "llm",
        step: "06",
        title: "Generation and response spans",
        description:
          "LLM spans capture model name, invocation parameters, input/output messages, token counts, and tool schemas.",
        badge: "green",
        chips: ["llm.model_name", "llm.input_messages", "llm.token_count.prompt"],
      },
      {
        id: "tools",
        step: "07",
        title: "Function and handoff spans",
        description:
          "Tool spans record function arguments and outputs. Handoffs link destination agents back to source agents in the graph.",
        badge: "green",
        chips: ["tool.name", "graph.node.parent_id", "handoff_to_*"],
      },
      {
        id: "guardrail",
        step: "08",
        title: "Guardrail spans",
        description:
          "Guardrail events become GUARDRAIL spans with guardrail.triggered so blocked actions are visible in replay.",
        badge: "red",
        chips: ["guardrail.triggered", "policy actor", "blocked decision"],
      },
    ],
  },
  {
    id: "lifted",
    step: "09",
    title: "Lifted input and output",
    description:
      "LLM child input and final output bubble up to enclosing AGENT spans and the trace root, matching upstream OpenInference behavior.",
    badge: "blue",
    chips: ["input.value", "output.value", "first input wins", "last output wins"],
  },
  {
    id: "masking",
    step: "10",
    title: "TraceConfig masking",
    description:
      "Sensitive prompts, tool payloads, and audio can be redacted before export through TraceConfig and OPENINFERENCE_* environment variables.",
    badge: "blue",
    chips: ["hideInputs", "hideOutputs", "hideInputAudio", "__REDACTED__"],
  },
  {
    id: "realtime",
    step: "11",
    title: "Realtime audio tracing",
    description:
      "Voice turns produce AUDIO parent spans with USER and LLM children, optional WAV data URIs, transcripts, and per-turn tool calls.",
    badge: "purple",
    chips: ["conversation.turn", "PCM16 to WAV", "time_to_first_token_ms"],
  },
];

const preventionSteps: StoryStep[] = [
  {
    id: "normalize",
    step: "12",
    title: "Normalize to security trace",
    description:
      "Completed spans are converted into Agent Breach security events with trust labels, influence edges, and policy decisions.",
    badge: "orange",
    chips: ["normalizeInstrumentedSpans", "influencedBy", "targetClass"],
    children: [
      {
        id: "enrich",
        step: "13",
        title: "Security enrichment",
        description:
          "Explicit metadata is preserved when present. Missing trust labels are inferred from tool names and span hierarchy so gaps stay visible.",
        badge: "orange",
        chips: ["trust", "toolName", "decision", "metadata-only"],
      },
    ],
  },
  {
    id: "persist",
    step: "14",
    title: "Import and persist",
    description:
      "POST /api/import/openai accepts SDK exports or instrumented span bundles and stores them in the replay database.",
    badge: "green",
    chips: ["POST /api/import/openai", "persist=true", "saveTrace"],
    children: [
      {
        id: "detect",
        step: "15",
        title: "Deterministic detectors",
        description:
          "Security predicates walk influence chains to flag exfiltration, untrusted-to-action, confused deputy, and destructive write paths.",
        badge: "red",
        chips: ["exfiltration", "untrusted_to_action", "confused_deputy"],
      },
      {
        id: "replay",
        step: "16",
        title: "Replay studio and prevention",
        description:
          "The studio reconstructs source to influence to tool to boundary to violation so teams can see what crossed a security line and what would have blocked it.",
        badge: "green",
        chips: ["timeline replay", "policy comparison", "incident report"],
      },
    ],
  },
];

const runtimeFlow = [
  "OpenAI Agents SDK emits trace and span lifecycle events.",
  "Local processor maps each event to OpenInference span kinds and attributes.",
  "Lifted I/O, handoff links, and guardrail results are attached to spans.",
  "TraceConfig masks sensitive audio, prompts, or tool payloads.",
  "Adapter normalizes spans into security events with influence edges.",
  "Detectors evaluate risky chains and the replay studio shows prevention insight.",
];

const stats = [
  { label: "Span kinds", value: "7", detail: "AGENT, LLM, TOOL, GUARDRAIL, CHAIN, AUDIO, USER" },
  { label: "Processor hooks", value: "4", detail: "trace start/end and span start/end" },
  { label: "Privacy controls", value: "10+", detail: "TraceConfig and OPENINFERENCE env vars" },
  { label: "Security predicates", value: "4", detail: "exfiltration, untrusted-to-action, deputy, destructive write" },
];

const legend = [
  { label: "Instrumentation", color: "#7c3aed" },
  { label: "Trace capture", color: "#ea580c" },
  { label: "Semantic enrichment", color: "#16a34a" },
  { label: "Policy and prevention", color: "#dc2626" },
  { label: "Privacy controls", color: "#2563eb" },
];

function StoryTreeNode({
  node,
  isChild = false,
  isLast = false,
}: {
  node: StoryStep;
  isChild?: boolean;
  isLast?: boolean;
}) {
  return (
    <div className={`landingTreeBranch${isChild ? " isChild" : ""}`}>
      <div className="landingTreeRail">
        <span className={`landingTreeDot ${node.badge}`} />
        {!isLast ? <span className="landingTreeLine" /> : null}
      </div>
      <div className="landingTreeNode">
        <article className="landingTreeCard">
          <div className="landingTreeCardTop">
            <div>
              <h4>{node.title}</h4>
              <p>{node.description}</p>
            </div>
            <span className={`landingStepPill ${node.badge}`}>Step {node.step}</span>
          </div>
          <div className="landingChipList">
            {node.chips.map((chip) => (
              <span className="landingChip" key={chip}>
                {chip}
              </span>
            ))}
          </div>
          {node.code ? <pre className="landingCode">{node.code}</pre> : null}
        </article>
        {node.children?.map((child, index) => (
          <StoryTreeNode
            key={child.id}
            node={child}
            isChild
            isLast={index === (node.children?.length ?? 0) - 1}
          />
        ))}
      </div>
    </div>
  );
}

function StoryPhase({
  label,
  tone,
  steps,
}: {
  label: string;
  tone: "tracing" | "prevention";
  steps: StoryStep[];
}) {
  return (
    <section className="landingPhase">
      <div className={`landingPhaseLabel ${tone}`}>{label}</div>
      <div className="landingTree">
        {steps.map((step, index) => (
          <StoryTreeNode
            key={step.id}
            node={step}
            isLast={index === steps.length - 1 && !step.children?.length}
          />
        ))}
      </div>
    </section>
  );
}

export default function LandingClient() {
  const [tab, setTab] = useState<TabId>("full");

  const phases = useMemo(() => {
    if (tab === "tracing") {
      return [{ label: "Phase 1 · Tracing and capture", tone: "tracing" as const, steps: tracingSteps }];
    }
    if (tab === "prevention") {
      return [{ label: "Phase 2 · Prevention and replay", tone: "prevention" as const, steps: preventionSteps }];
    }
    return [
      { label: "Phase 1 · Tracing and capture", tone: "tracing" as const, steps: tracingSteps },
      { label: "Phase 2 · Prevention and replay", tone: "prevention" as const, steps: preventionSteps },
    ];
  }, [tab]);

  return (
    <div className="landingPage">
      <header className="landingNav">
        <div className="landingContainer landingNavInner">
          <div className="landingBrand">
            <div className="landingBrandMark">AB</div>
            <div>
              <strong>Agent Breach Replay</strong>
              <span>Security observability platform</span>
            </div>
          </div>
          <nav className="landingNavLinks">
            <a href="#story">How it works</a>
            <a href="#tracing">Tracing</a>
            <a href="#prevention">Prevention</a>
          </nav>
          <div className="landingNavActions">
            <Link className="landingBtn" href="/login">
              Sign in
            </Link>
            <Link className="landingBtnPrimary" href="/studio">
              Open replay studio
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="landingHero">
          <div className="landingContainer landingHeroGrid">
            <div>
              <div className="landingEyebrow">Built locally · OpenInference-compatible semantics</div>
              <h1>See how agent breaches happen. Stop them before they spread.</h1>
              <p className="landingHeroLead">
                Agent Breach Replay is a security observability layer for tool-using AI agents.
                Our locally built instrumentation captures every span, enriches it with trust and
                policy semantics, and turns risky tool paths into replayable prevention insight.
              </p>
              <div className="landingHeroActions">
                <Link className="landingBtnPrimary" href="/studio">
                  Launch replay studio
                </Link>
                <a className="landingBtn" href="#story">
                  View instrumentation story
                </a>
              </div>
            </div>

            <aside className="landingHeroCard">
              <h3>What this landing page explains</h3>
              <p>
                The full step-by-step story of how our local
                openinference-style OpenAI Agents instrumentation captures tracing data and
                feeds prevention workflows.
              </p>
              <div className="landingMiniFlow">
                {[
                  ["1", "Hook the OpenAI Agents SDK"],
                  ["2", "Capture spans with OpenInference semantics"],
                  ["3", "Normalize into security traces"],
                  ["4", "Detect risky chains and replay incidents"],
                ].map(([index, text]) => (
                  <div className="landingMiniFlowRow" key={index}>
                    <span className="landingMiniFlowIndex">{index}</span>
                    <div>
                      <strong>{text}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <section className="landingContainer landingStats">
          {stats.map((stat) => (
            <article className="landingStatCard" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <p>{stat.detail}</p>
            </article>
          ))}
        </section>

        <section className="landingSection" id="story">
          <div className="landingContainer">
            <div className="landingSectionHeader">
              <div>
                <h2 id="tracing">Instrumentation story tree</h2>
                <p>
                  Step-by-step breakdown of how the locally built
                  openinference-instrumentation-openai-agents equivalent captures tracing,
                  enriches security semantics, and powers prevention.
                </p>
              </div>
              <div className="landingTabs">
                <button
                  type="button"
                  className={tab === "full" ? "landingTabActive" : "landingTab"}
                  onClick={() => setTab("full")}
                >
                  Full story
                </button>
                <button
                  type="button"
                  className={tab === "tracing" ? "landingTabActive" : "landingTab"}
                  onClick={() => setTab("tracing")}
                >
                  Tracing
                </button>
                <button
                  type="button"
                  className={tab === "prevention" ? "landingTabActive" : "landingTab"}
                  onClick={() => setTab("prevention")}
                >
                  Prevention
                </button>
              </div>
            </div>

            <div className="landingStoryLayout">
              <article className="landingStoryPanel">
                <div className="landingStoryPanelHeader">
                  <h3>
                    {tab === "tracing"
                      ? "Tracing pipeline"
                      : tab === "prevention"
                        ? "Prevention pipeline"
                        : "End-to-end tracing and prevention pipeline"}
                  </h3>
                  <p>
                    From SDK hook to replay-ready incident. Each step maps to code in
                    @agent-breach/instrumentation-openai-agents and the replay adapter layer.
                  </p>
                </div>
                <div className="landingStoryPanelBody">
                  {phases.map((phase) => (
                    <StoryPhase
                      key={phase.label}
                      label={phase.label}
                      tone={phase.tone}
                      steps={phase.steps}
                    />
                  ))}
                </div>
              </article>

              <aside className="landingAside" id="prevention">
                <article className="landingAsideCard">
                  <h4>Runtime execution order</h4>
                  <p>What happens during one agent workflow run.</p>
                  <div className="landingRuntimeList">
                    {runtimeFlow.map((item, index) => (
                      <div className="landingRuntimeItem" key={item}>
                        <span>{index + 1}</span>
                        <strong>{item}</strong>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="landingAsideCard">
                  <h4>Layer legend</h4>
                  <p>Color coding used across the story tree.</p>
                  <div className="landingLegendList">
                    {legend.map((item) => (
                      <div className="landingLegendRow" key={item.label}>
                        <span>{item.label}</span>
                        <span
                          className="landingLegendSwatch"
                          style={{ background: item.color }}
                        />
                      </div>
                    ))}
                  </div>
                </article>

                <article className="landingAsideCard">
                  <h4>Built in this repository</h4>
                  <p>
                    No dependency on Arize OpenInference packages. The processor bridge, semantic
                    conventions, masking, realtime audio scaffold, and replay normalization are
                    owned locally inside this codebase.
                  </p>
                  <Link className="landingBtnPrimary" href="/studio">
                    Open replay studio
                  </Link>
                </article>
              </aside>
            </div>
          </div>
        </section>
      </main>

      <footer className="landingFooter">
        <div className="landingContainer landingFooterInner">
          <span>Agent Breach Replay · Security observability for tool-using AI agents</span>
          <Link className="landingBtn" href="/login">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
