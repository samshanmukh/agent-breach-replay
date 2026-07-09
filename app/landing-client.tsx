"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import "./landing.css";

type TabId = "overview" | "tracing" | "prevention";

type TreeNode = {
  id: string;
  step: string;
  title: string;
  description: string;
  badge: "purple" | "orange" | "green" | "red" | "blue";
  chips: string[];
  code?: string;
  children?: TreeNode[];
};

const tracingTree: TreeNode[] = [
  {
    id: "hook",
    step: "01",
    title: "Instrumentation hook",
    description:
      "Register a local TracingProcessor with the OpenAI Agents SDK. Exclusive mode replaces SDK processors; additive mode keeps native tracing alongside ours.",
    badge: "purple",
    chips: ["OpenAIAgentsInstrumentation", "exclusiveProcessor", "manuallyInstrument"],
    code: `const instrumentation = new OpenAIAgentsInstrumentation({
  exclusiveProcessor: true,
});
instrumentation.manuallyInstrument(agents);`,
    children: [
      {
        id: "processor",
        step: "02",
        title: "AgentBreachTracingProcessor",
        description:
          "Implements the SDK tracing callbacks and converts each trace/span event into OpenInference-compatible local spans.",
        badge: "purple",
        chips: ["onTraceStart", "onSpanStart", "onSpanEnd", "MemorySpanExporter"],
      },
    ],
  },
  {
    id: "trace-root",
    step: "03",
    title: "Trace root span",
    description:
      "Every agent workflow opens a root AGENT span named after the workflow. This becomes the parent for all child spans in the run.",
    badge: "orange",
    chips: ["openinference.span.kind=AGENT", "llm.system=openai", "trace.name"],
    children: [
      {
        id: "span-tree",
        step: "04",
        title: "Span hierarchy",
        description:
          "Child spans resolve parents through SDK parent_id links. The processor preserves the tree so influence chains can be reconstructed later.",
        badge: "orange",
        chips: ["parent_id", "span_id", "trace_id", "started_at", "ended_at"],
      },
    ],
  },
  {
    id: "semantics",
    step: "05",
    title: "Semantic span mapping",
    description:
      "Each SDK span type is mapped to an OpenInference span kind and enriched with the right attributes at span end.",
    badge: "green",
    chips: ["AGENT", "LLM", "TOOL", "GUARDRAIL", "CHAIN", "AUDIO", "USER"],
    children: [
      {
        id: "generation",
        step: "06",
        title: "Generation & response spans",
        description:
          "LLM spans capture model name, invocation parameters, input/output messages, token counts, and tool schemas.",
        badge: "green",
        chips: ["llm.model_name", "llm.input_messages", "llm.token_count.prompt"],
      },
      {
        id: "function",
        step: "07",
        title: "Function & handoff spans",
        description:
          "Tool spans record function name, JSON arguments, and outputs. Handoffs link destination agents back to source agents.",
        badge: "green",
        chips: ["tool.name", "graph.node.parent_id", "handoff_to_*"],
      },
      {
        id: "guardrail",
        step: "08",
        title: "Guardrail spans",
        description:
          "Guardrail events become GUARDRAIL spans with tool.name and guardrail.triggered so policy blocks are visible in replay.",
        badge: "red",
        chips: ["guardrail.triggered", "policy actor", "blocked decision"],
      },
    ],
  },
  {
    id: "lifted-io",
    step: "09",
    title: "Lifted input/output",
    description:
      "LLM child input and final output are bubbled to enclosing AGENT spans and the trace root, matching upstream OpenInference behavior.",
    badge: "blue",
    chips: ["input.value", "output.value", "first input wins", "last output wins"],
  },
  {
    id: "privacy",
    step: "10",
    title: "TraceConfig masking",
    description:
      "Sensitive values can be redacted before export using TraceConfig and OPENINFERENCE_* environment variables.",
    badge: "blue",
    chips: ["hideInputs", "hideOutputs", "hideInputAudio", "__REDACTED__"],
  },
  {
    id: "realtime",
    step: "11",
    title: "Realtime audio tracing",
    description:
      "Voice turns produce AUDIO parent spans with USER and LLM children, optional WAV data URIs, transcripts, and tool calls per turn.",
    badge: "purple",
    chips: ["conversation.turn", "PCM16→WAV", "time_to_first_token_ms"],
  },
];

const preventionTree: TreeNode[] = [
  {
    id: "export",
    step: "12",
    title: "Normalize to security trace",
    description:
      "Completed spans are converted into Agent Breach security events with trust labels, influence edges, and policy decisions.",
    badge: "orange",
    chips: ["normalizeInstrumentedSpans", "influencedBy", "targetClass"],
    children: [
      {
        id: "enrichment",
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
    id: "import",
    step: "14",
    title: "Import & persist",
    description:
      "POST /api/import/openai accepts SDK exports or instrumented span bundles and persists them into the replay store.",
    badge: "green",
    chips: ["POST /api/import/openai", "persist=true", "saveTrace"],
    children: [
      {
        id: "detect",
        step: "15",
        title: "Deterministic detectors",
        description:
          "Security predicates walk influence chains to flag exfiltration, untrusted-to-action, confused deputy, and related failure modes.",
        badge: "red",
        chips: ["exfiltration", "untrusted_to_action", "confused_deputy"],
      },
      {
        id: "replay",
        step: "16",
        title: "Replay studio & prevention story",
        description:
          "The studio reconstructs source → influence → tool → boundary → violation so teams can see what crossed a security line and what would have blocked it.",
        badge: "green",
        chips: ["timeline replay", "policy comparison", "incident report"],
      },
    ],
  },
];

const metrics = [
  { label: "Span kinds covered", value: "7", note: "AGENT · LLM · TOOL · GUARDRAIL · CHAIN · AUDIO · USER" },
  { label: "Processor hooks", value: "4", note: "trace start/end · span start/end" },
  { label: "Privacy controls", value: "10+", note: "TraceConfig + OPENINFERENCE_* env vars" },
  { label: "Security predicates", value: "4", note: "exfiltration · untrusted-to-action · deputy · destructive write" },
];

const legend = [
  { label: "Instrumentation layer", color: "#8b5cf6" },
  { label: "Trace capture", color: "#f97316" },
  { label: "Semantic enrichment", color: "#22c55e" },
  { label: "Policy & prevention", color: "#ef4444" },
  { label: "Privacy controls", color: "#3b82f6" },
];

function TreeBranch({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  return (
    <div className={depth === 0 ? "landingTreeRoot" : "landingTreeNode"}>
      <div className="landingTreeItem">
        <div className="landingTreeTop">
          <div>
            <strong>{node.title}</strong>
            <p>{node.description}</p>
            <div className="landingChipRow">
              {node.chips.map((chip) => (
                <span className="landingChip" key={chip}>
                  {chip}
                </span>
              ))}
            </div>
            {node.code ? <pre className="landingCodeBlock">{node.code}</pre> : null}
          </div>
          <span className={`landingStepBadge ${node.badge}`}>Step {node.step}</span>
        </div>
      </div>
      {node.children?.map((child) => (
        <TreeBranch key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function LandingClient() {
  const [tab, setTab] = useState<TabId>("overview");

  const activeTree = useMemo(() => {
    if (tab === "tracing") return tracingTree;
    if (tab === "prevention") return preventionTree;
    return [...tracingTree.slice(0, 3), preventionTree[0], preventionTree[1]];
  }, [tab]);

  return (
    <div className="landingBody">
      <div className="landingShell">
        <aside className="landingSidebar">
          <div className="landingProfile">
            <div className="landingAvatar">AB</div>
            <div>
              <strong>Agent Breach Replay</strong>
              <span>Security observability</span>
            </div>
          </div>

          <div className="landingNavSection">
            <div className="landingNavLabel">Product</div>
            <span className="landingNavItemActive">
              <span className="landingNavDot" />
              Overview
            </span>
            <a className="landingNavItem" href="#tracing-flow">
              <span className="landingNavDot" />
              Tracing flow
            </a>
            <a className="landingNavItem" href="#prevention">
              <span className="landingNavDot" />
              Prevention
            </a>
          </div>

          <div className="landingNavSection">
            <div className="landingNavLabel">Workspace</div>
            <Link className="landingNavItem" href="/studio">
              Replay studio
            </Link>
            <Link className="landingNavItem" href="/login">
              Sign in
            </Link>
          </div>

          <div className="landingSidebarFooter">
            <span className="landingNavItem">Local instrumentation package</span>
            <span className="landingNavItem">OpenInference-compatible semantics</span>
          </div>
        </aside>

        <main className="landingMain">
          <header className="landingHeader">
            <div>
              <h1>Local OpenAI Agents instrumentation</h1>
              <p>
                A step-by-step observability story for how Agent Breach Replay
                captures agent runs, enriches them with security semantics, and
                turns risky tool paths into replayable prevention insight.
              </p>
            </div>
            <div className="landingHeaderActions">
              <a className="landingButton" href="#tracing-flow">
                Explore tracing flow
              </a>
              <Link className="landingButtonPrimary" href="/studio">
                Open replay studio
              </Link>
            </div>
          </header>

          <div className="landingTabs">
            <button
              type="button"
              className={tab === "overview" ? "landingTabActive" : "landingTab"}
              onClick={() => setTab("overview")}
            >
              Overview
            </button>
            <button
              type="button"
              className={tab === "tracing" ? "landingTabActive" : "landingTab"}
              onClick={() => setTab("tracing")}
            >
              Tracing flow
            </button>
            <button
              type="button"
              className={tab === "prevention" ? "landingTabActive" : "landingTab"}
              onClick={() => setTab("prevention")}
            >
              Prevention
            </button>
          </div>

          <section className="landingMetrics">
            {metrics.map((metric) => (
              <article className="landingMetricCard" key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <em>{metric.note}</em>
              </article>
            ))}
          </section>

          <section className="landingGrid" id="tracing-flow">
            <article className="landingPanel">
              <div className="landingPanelHeader">
                <div>
                  <h2>
                    {tab === "tracing"
                      ? "Tracing pipeline tree"
                      : tab === "prevention"
                        ? "Prevention pipeline tree"
                        : "End-to-end instrumentation story"}
                  </h2>
                  <p>
                    How the locally built openinference-style package observes
                    agent runs from SDK hook to replay-ready security trace.
                  </p>
                </div>
              </div>
              <div className="landingPanelBody">
                <div className="landingStoryTree">
                  {activeTree.map((node) => (
                    <TreeBranch key={node.id} node={node} />
                  ))}
                </div>
              </div>
            </article>

            <div className="landingFlowCard" id="prevention">
              <article className="landingPanel">
                <div className="landingPanelHeader">
                  <div>
                    <h2>What happens at runtime</h2>
                    <p>Condensed execution order for one agent workflow.</p>
                  </div>
                </div>
                <div className="landingPanelBody">
                  {[
                    "SDK emits trace and span lifecycle events.",
                    "Processor maps each event to OpenInference span kinds and attributes.",
                    "Lifted I/O, handoff links, and guardrail results are attached.",
                    "TraceConfig masks sensitive audio, prompts, or tool payloads.",
                    "Adapter normalizes spans into security events with influence edges.",
                    "Detectors evaluate risky chains and the studio replays the incident.",
                  ].map((text, index) => (
                    <div className="landingFlowStep" key={text}>
                      <span className="landingFlowIndex">{index + 1}</span>
                      <div>
                        <strong>{text}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="landingPanel">
                <div className="landingPanelHeader">
                  <div>
                    <h2>Layer legend</h2>
                    <p>Color coding used across the tracing story.</p>
                  </div>
                </div>
                <div className="landingPanelBody landingLegend">
                  {legend.map((item) => (
                    <div className="landingLegendItem" key={item.label}>
                      <span>{item.label}</span>
                      <span
                        className="landingLegendDot"
                        style={{ background: item.color }}
                      />
                    </div>
                  ))}
                </div>
              </article>

              <div className="landingHeroNote">
                Built locally in <code>@agent-breach/instrumentation-openai-agents</code>{" "}
                with no dependency on Arize OpenInference packages. The same feature
                surface—processor bridge, semantic conventions, masking, realtime audio
                scaffold, and replay normalization—is owned inside this repository.
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
