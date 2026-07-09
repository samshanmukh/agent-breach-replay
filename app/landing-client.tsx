"use client";

import Link from "next/link";
import { useState } from "react";
import MarketingNav from "@/app/marketing-nav";
import "./landing.css";

type StoryView = "all" | "trace" | "prevent";
type Tone = "violet" | "amber" | "green" | "red" | "blue";

type StoryStep = {
  number: string;
  phase: "trace" | "prevent";
  tone: Tone;
  title: string;
  description: string;
  features: string[];
};

const storySteps: StoryStep[] = [
  {
    number: "01",
    phase: "trace",
    tone: "violet",
    title: "Attach to the OpenAI Agents SDK",
    description:
      "OpenAIAgentsInstrumentation registers our local TracingProcessor. Exclusive mode replaces other processors; additive mode preserves native OpenAI tracing.",
    features: ["manuallyInstrument", "exclusiveProcessor", "addTraceProcessor"],
  },
  {
    number: "02",
    phase: "trace",
    tone: "violet",
    title: "Listen to the trace lifecycle",
    description:
      "AgentBreachTracingProcessor receives every workflow and span lifecycle event, while bounded in-memory maps prevent unfinished traces from leaking memory.",
    features: ["onTraceStart", "onTraceEnd", "onSpanStart", "onSpanEnd"],
  },
  {
    number: "03",
    phase: "trace",
    tone: "amber",
    title: "Build the parent-child trace tree",
    description:
      "A root AGENT span represents the workflow. Each SDK parent_id becomes an edge, preserving the exact path from agent to model to tool.",
    features: ["trace_id", "span_id", "parent_id", "high-resolution time"],
  },
  {
    number: "04",
    phase: "trace",
    tone: "green",
    title: "Map every SDK operation",
    description:
      "Agent, generation, response, function, handoff, MCP, guardrail, custom, and voice operations are translated into consistent OpenInference span kinds.",
    features: ["AGENT", "LLM", "TOOL", "GUARDRAIL", "CHAIN", "AUDIO", "USER"],
  },
  {
    number: "05",
    phase: "trace",
    tone: "green",
    title: "Enrich model and tool spans",
    description:
      "The processor records model configuration, messages, token usage, tool schemas, function arguments, outputs, errors, and guardrail decisions.",
    features: ["llm.model_name", "token counts", "tool.name", "guardrail.triggered"],
  },
  {
    number: "06",
    phase: "trace",
    tone: "blue",
    title: "Preserve context without exposing secrets",
    description:
      "Session, user, tags, and metadata propagate through the tree. TraceConfig masks prompts, outputs, tools, images, and audio before spans leave the process.",
    features: ["usingSession", "usingUser", "suppressTracing", "__REDACTED__"],
  },
  {
    number: "07",
    phase: "trace",
    tone: "violet",
    title: "Capture realtime voice turns",
    description:
      "Realtime sessions produce conversation.turn AUDIO spans with USER, LLM, and TOOL children, transcripts, token usage, latency, and PCM16-to-WAV support.",
    features: ["conversation.turn", "audio transcript", "TTFT", "PCM16 → WAV"],
  },
  {
    number: "08",
    phase: "prevent",
    tone: "amber",
    title: "Normalize spans into security events",
    description:
      "The adapter converts the completed span tree into Agent Breach events and derives influence edges from parent links and explicit instrumentation metadata.",
    features: ["normalizeInstrumentedSpans", "influencedBy", "targetClass"],
  },
  {
    number: "09",
    phase: "prevent",
    tone: "amber",
    title: "Add trust and authority semantics",
    description:
      "Sources, tools, destinations, and protected targets receive trust labels so ordinary observability data becomes a security-relevant execution story.",
    features: ["trusted", "untrusted", "protected", "external"],
  },
  {
    number: "10",
    phase: "prevent",
    tone: "red",
    title: "Detect dangerous influence paths",
    description:
      "Deterministic predicates walk the graph and flag protected-data exfiltration, untrusted content causing actions, confused deputy behavior, and destructive writes.",
    features: ["exfiltration", "untrusted-to-action", "confused deputy", "destructive write"],
  },
  {
    number: "11",
    phase: "prevent",
    tone: "green",
    title: "Replay the breach and compare prevention",
    description:
      "The studio reconstructs source → influence → model → tool → boundary → violation, then compares the observed run with a guardrailed path.",
    features: ["timeline replay", "policy comparison", "incident report"],
  },
];

const branchCards = [
  {
    label: "Capture",
    tone: "violet",
    description: "Lifecycle hooks record the complete agent execution tree.",
    leaves: ["Agent runs", "LLM calls", "Tool calls", "Voice turns"],
  },
  {
    label: "Understand",
    tone: "amber",
    description: "Span context becomes a security-aware influence graph.",
    leaves: ["Trust labels", "Data classes", "Handoffs", "Policy decisions"],
  },
  {
    label: "Prevent",
    tone: "green",
    description: "Detectors explain risky paths and the controls that stop them.",
    leaves: ["Exfiltration", "Unsafe actions", "Approvals", "Replay reports"],
  },
];

const metrics = [
  ["7", "semantic span kinds"],
  ["11", "trace-to-prevention steps"],
  ["10+", "privacy controls"],
  ["4", "security detectors"],
];

const studioCapabilities = [
  {
    number: "01",
    title: "Influence replay",
    description: "Step through source, model, tool, policy, and detector spans with a synchronized execution timeline.",
  },
  {
    number: "02",
    title: "Security findings",
    description: "Inspect detector severity, status, recommendations, and clickable evidence chains.",
  },
  {
    number: "03",
    title: "OpenInference spans",
    description: "Filter the raw span tree by AGENT, LLM, TOOL, GUARDRAIL, CHAIN, AUDIO, and USER.",
  },
  {
    number: "04",
    title: "Incident reports",
    description: "Export a narrative report with the breach path, controls, and similar incident patterns.",
  },
  {
    number: "05",
    title: "Guardrail comparison",
    description: "Compare the observed execution against a contained path with blocked and approval decisions.",
  },
  {
    number: "06",
    title: "Instrumentation console",
    description: "Use TypeScript and Python setup examples, live privacy toggles, and feature coverage status.",
  },
];

function ProductPreview() {
  return (
    <div className="heroPreview" aria-label="Agent trace preview">
      <div className="previewToolbar">
        <div>
          <span className="previewKicker">Live trace</span>
          <strong>Vendor Email Assistant</strong>
        </div>
        <span className="previewStatus">Risk detected</span>
      </div>
      <div className="previewFlow">
        {[
          ["01", "Untrusted email", "SOURCE", "violet"],
          ["02", "Agent plan", "AGENT", "amber"],
          ["03", "fs.read(secret.txt)", "TOOL", "red"],
          ["04", "External send blocked", "GUARDRAIL", "green"],
        ].map(([number, title, kind, tone], index, items) => (
          <div className="previewFlowRow" key={number}>
            <div className="previewRail">
              <span className={`previewDot ${tone}`} />
              {index < items.length - 1 ? <span className="previewLine" /> : null}
            </div>
            <div className="previewEvent">
              <span>{kind}</span>
              <strong>{title}</strong>
              <small>Step {number}</small>
            </div>
          </div>
        ))}
      </div>
      <div className="previewFooter">
        <span>Influence chain reconstructed</span>
        <strong>4 spans · 1 blocked boundary</strong>
      </div>
    </div>
  );
}

function FeatureTree() {
  return (
    <div className="featureTree">
      <div className="treeRoot">
        <span>Local instrumentation</span>
        <strong>OpenAI Agents security observability</strong>
      </div>
      <div className="treeTrunk" />
      <div className="treeBranches">
        {branchCards.map((branch) => (
          <article className={`treeBranch ${branch.tone}`} key={branch.label}>
            <div className="treeBranchConnector" />
            <span className="treeBranchLabel">{branch.label}</span>
            <h3>{branch.description}</h3>
            <div className="treeLeaves">
              {branch.leaves.map((leaf) => (
                <span key={leaf}>{leaf}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function StoryTimeline({ view }: { view: StoryView }) {
  const visibleSteps = storySteps.filter(
    (step) => view === "all" || step.phase === view,
  );

  return (
    <div className="storyTimeline">
      {visibleSteps.map((step, index) => (
        <article className="storyStep" key={step.number}>
          <div className="storyRail">
            <span className={`storyDot ${step.tone}`}>{step.number}</span>
            {index < visibleSteps.length - 1 ? <span className="storyLine" /> : null}
          </div>
          <div className="storyCard">
            <div className="storyCardHeader">
              <span className={`storyPhase ${step.phase}`}>
                {step.phase === "trace" ? "Tracing" : "Prevention"}
              </span>
              <h3>{step.title}</h3>
            </div>
            <p>{step.description}</p>
            <div className="storyFeatures">
              {step.features.map((feature) => (
                <code key={feature}>{feature}</code>
              ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function LandingClient() {
  const [view, setView] = useState<StoryView>("all");

  return (
    <div className="marketingPage">
      <MarketingNav active="home" />

      <main>
        <section className="businessHero">
          <div className="landingContainer heroLayout">
            <div className="heroCopy">
              <span className="businessEyebrow">
                First-party OpenAI Agents instrumentation
              </span>
              <h1>Understand every agent action before it becomes an incident.</h1>
              <p>
                Agent Breach Replay traces model calls, tools, handoffs, guardrails,
                and voice turns—then explains how untrusted content influenced a
                privileged action and which control should have stopped it.
              </p>
              <div className="heroActions">
                <Link className="landingBtnPrimary large" href="/studio">
                  Explore replay studio
                </Link>
                <a className="landingBtn large" href="#story">
                  See how tracing works
                </a>
              </div>
              <div className="heroProof">
                <span>No Arize runtime dependency</span>
                <span>Metadata-first capture</span>
                <span>TypeScript + Python</span>
              </div>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section className="metricStrip">
          <div className="landingContainer metricGrid">
            {metrics.map(([value, label]) => (
              <div className="metricItem" key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="businessSection" id="tracing">
          <div className="landingContainer">
            <div className="sectionIntro centered">
              <span className="sectionEyebrow">One local package, three outcomes</span>
              <h2>A security observability tree built for agent workflows</h2>
              <p>
                The local instrumentation does more than collect spans. It preserves
                execution context, adds trust semantics, and turns traces into
                actionable prevention evidence.
              </p>
            </div>
            <FeatureTree />
          </div>
        </section>

        <section className="businessSection storySection" id="story">
          <div className="landingContainer">
            <div className="storyHeading">
              <div className="sectionIntro">
                <span className="sectionEyebrow">From trace to prevention</span>
                <h2>How the instrumentation works, step by step</h2>
                <p>
                  Follow one agent run from SDK registration through semantic span
                  capture, privacy controls, security enrichment, detection, and replay.
                </p>
              </div>
              <div className="storyTabs" role="tablist" aria-label="Story phase">
                {[
                  ["all", "Full story"],
                  ["trace", "Tracing"],
                  ["prevent", "Prevention"],
                ].map(([id, label]) => (
                  <button
                    className={view === id ? "active" : ""}
                    key={id}
                    onClick={() => setView(id as StoryView)}
                    role="tab"
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="storyLayout">
              <StoryTimeline view={view} />
              <aside className="storyAside" id="prevention">
                <div className="asideCard">
                  <span className="asideLabel">Runtime result</span>
                  <h3>One trace, one explainable security story</h3>
                  <div className="resultPath">
                    {[
                      "SDK lifecycle event",
                      "OpenInference span",
                      "Security event",
                      "Influence graph",
                      "Finding + prevention",
                    ].map((item, index) => (
                      <div key={item}>
                        <span>{index + 1}</span>
                        <strong>{item}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="asideCard privacyCard">
                  <span className="asideLabel">Privacy by default</span>
                  <h3>Show the breach path without storing the breached data.</h3>
                  <p>
                    Mask inputs, outputs, messages, images, tools, and audio before
                    export. Keep only the metadata needed to reconstruct the incident.
                  </p>
                </div>
                <div className="asideCta">
                  <h3>Ready to inspect a real trace?</h3>
                  <p>Open the replay studio and compare observed and guarded paths.</p>
                  <Link className="landingBtnPrimary" href="/studio">
                    Open replay studio
                  </Link>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <section className="businessSection capabilitySection">
          <div className="landingContainer">
            <div className="sectionIntro centered">
              <span className="sectionEyebrow">Available in the studio</span>
              <h2>One workspace for the complete security investigation</h2>
              <p>
                Every feature exposed by the tracing and prevention pipeline now has
                a dedicated, usable view in the replay studio.
              </p>
            </div>
            <div className="capabilityGrid">
              {studioCapabilities.map((capability) => (
                <article key={capability.number}>
                  <span>{capability.number}</span>
                  <h3>{capability.title}</h3>
                  <p>{capability.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="finalCta">
          <div className="landingContainer finalCtaInner">
            <div>
              <span className="sectionEyebrow">Agent security needs an execution story</span>
              <h2>Trace what happened. Explain why. Prevent the next breach.</h2>
            </div>
            <Link className="landingBtnPrimary large" href="/studio">
              Start with the replay studio
            </Link>
          </div>
        </section>
      </main>

      <footer className="businessFooter">
        <div className="landingContainer footerInner">
          <div className="landingBrand">
            <div className="landingBrandMark">AB</div>
            <div>
              <strong>Agent Breach Replay</strong>
              <span>Security observability for tool-using AI agents</span>
            </div>
          </div>
          <span>Locally built OpenAI Agents instrumentation</span>
        </div>
      </footer>
    </div>
  );
}
