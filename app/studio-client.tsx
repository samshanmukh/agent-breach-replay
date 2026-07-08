"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Mode = "breach" | "guardrailed";
type Tone =
  | "trusted"
  | "untrusted"
  | "agent"
  | "tool"
  | "protected"
  | "external"
  | "violation"
  | "safe";

type Severity = "critical" | "high" | "medium";

type GraphNode = {
  id: string;
  tag: string;
  label: string;
  sub: string;
  tone: Tone;
  x: number;
  y: number;
};

type GraphEdge = {
  from: string;
  to: string;
  tone: "neutral" | "warn" | "violet" | "orange" | "red" | "green" | "blue";
};

type ReplayStep = {
  title: string;
  desc: string;
  focus: string[];
  edges: number[];
  decision?: "ALLOWED" | "BLOCKED" | "APPROVAL" | "DETECTED" | "CONTAINED";
  labels: Array<{ k: string; v: string }>;
  event: Record<string, unknown>;
};

type Incident = {
  id: string;
  name: string;
  app: string;
  detector: string;
  severity: Severity;
  time: string;
  traceId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  breach: ReplayStep[];
  guardrailed: ReplayStep[];
};

const toneForEdge: Record<GraphEdge["tone"], string> = {
  neutral: "#9b988c",
  warn: "#d99a2b",
  violet: "#8b64e0",
  orange: "#df6a26",
  red: "#d64040",
  green: "#1a9463",
  blue: "#5585ad",
};

const x = [12, 218, 424, 630, 836];

const baseIncidents: Incident[] = [
  {
    id: "vendor-email",
    name: "Vendor email exfiltration",
    app: "Vendor Email Assistant",
    detector: "exfiltration",
    severity: "high",
    time: "4m ago",
    traceId: "abr_vend_7f31",
    nodes: [
      { id: "task", tag: "TRUSTED", label: "User task", sub: "summarize vendors", tone: "trusted", x: x[0], y: 42 },
      { id: "email", tag: "UNTRUSTED", label: "Vendor email", sub: "external instruction", tone: "untrusted", x: x[0], y: 174 },
      { id: "plan", tag: "MODEL", label: "Agent plan", sub: "instruction adopted", tone: "agent", x: x[1], y: 108 },
      { id: "read", tag: "TOOL", label: "fs.read", sub: "secret.txt", tone: "tool", x: x[2], y: 108 },
      { id: "secret", tag: "PROTECTED", label: "Protected file", sub: "redacted preview", tone: "protected", x: x[3], y: 42 },
      { id: "send", tag: "TOOL", label: "email.send", sub: "audit@example.net", tone: "external", x: x[3], y: 174 },
      { id: "violation", tag: "DETECTOR", label: "Exfiltration", sub: "boundary crossed", tone: "violation", x: x[4], y: 108 },
    ],
    edges: [
      { from: "task", to: "plan", tone: "neutral" },
      { from: "email", to: "plan", tone: "warn" },
      { from: "plan", to: "read", tone: "violet" },
      { from: "read", to: "secret", tone: "violet" },
      { from: "secret", to: "send", tone: "orange" },
      { from: "send", to: "violation", tone: "red" },
    ],
    breach: [
      step("Trusted user task", "The user asks for a normal vendor-email summary.", ["task"], [], "ALLOWED", { source: "user", authority: "trusted" }),
      step("External email read", "An untrusted vendor email contains instruction-like text.", ["email"], [1], "ALLOWED", { trust: "untrusted", preview: "[redacted · 142 tokens]" }),
      step("Plan accepts unsafe influence", "The model carries the email instruction into its next action plan.", ["plan"], [0, 1], "ALLOWED", { influence: "email -> plan", trace: "metadata-only" }),
      step("Protected file requested", "The agent requests fs.read on secret.txt.", ["read", "secret"], [2, 3], "ALLOWED", { tool: "fs.read", target: "secret.txt" }),
      step("External send prepared", "Protected content is routed into an external email action.", ["send"], [4], "ALLOWED", { tool: "email.send", dest: "audit@example.net" }),
      step("Exfiltration detected", "The detector flags protected data moving to an external destination.", ["violation"], [5], "DETECTED", { detector: "exfiltration", severity: "high" }),
    ],
    guardrailed: [
      step("Trusted user task", "The user asks for a normal vendor-email summary.", ["task"], [], "ALLOWED", { source: "user", authority: "trusted" }),
      step("Email labeled untrusted", "Spotlighting marks the vendor email as data, not authority.", ["email"], [1], "ALLOWED", { trust: "untrusted", mode: "spotlighting" }),
      step("Influence quarantined", "The policy layer prevents untrusted content from creating tool authority.", ["plan"], [1], "BLOCKED", { policy: "untrusted_to_action", result: "quarantined" }),
      step("Protected read blocked", "The fs.read request for secret.txt is denied before execution.", ["read", "secret"], [2], "BLOCKED", { tool: "fs.read", target: "secret.txt" }),
      step("External send held", "The outbound email is held for human approval.", ["send"], [4], "APPROVAL", { tool: "email.send", approval: "required" }),
      step("Chain contained", "A safe summary is produced without protected data.", ["violation"], [5], "CONTAINED", { outcome: "safe_summary", detector: "contained" }),
    ],
  },
  {
    id: "ticket-delete",
    name: "Ticket-driven mass delete",
    app: "Support Triage Bot",
    detector: "destructive_write",
    severity: "critical",
    time: "18m ago",
    traceId: "abr_crm_c91e",
    nodes: [
      { id: "ticket", tag: "UNTRUSTED", label: "Ticket #4821", sub: "poisoned request", tone: "untrusted", x: x[0], y: 108 },
      { id: "plan", tag: "MODEL", label: "Deputy plan", sub: "purge accounts", tone: "agent", x: x[1], y: 108 },
      { id: "lookup", tag: "TOOL", label: "crm.lookup", sub: "2,314 rows", tone: "tool", x: x[2], y: 42 },
      { id: "records", tag: "PROTECTED", label: "CRM records", sub: "customer data", tone: "protected", x: x[3], y: 42 },
      { id: "delete", tag: "TOOL", label: "crm.delete", sub: "destructive write", tone: "external", x: x[3], y: 174 },
      { id: "violation", tag: "DETECTOR", label: "Mass delete", sub: "write blocked late", tone: "violation", x: x[4], y: 108 },
    ],
    edges: [
      { from: "ticket", to: "plan", tone: "warn" },
      { from: "plan", to: "lookup", tone: "blue" },
      { from: "lookup", to: "records", tone: "violet" },
      { from: "records", to: "delete", tone: "orange" },
      { from: "delete", to: "violation", tone: "red" },
    ],
    breach: [
      step("Poisoned ticket opened", "Ticket #4821 asks the bot to purge inactive accounts.", ["ticket"], [], "ALLOWED", { source: "ticket", trust: "untrusted" }),
      step("Confused deputy plan", "The agent turns the ticket text into a privileged CRM plan.", ["plan"], [0], "ALLOWED", { detector: "confused_deputy" }),
      step("CRM lookup executes", "The bot reads 2,314 protected customer rows.", ["lookup", "records"], [1, 2], "ALLOWED", { tool: "crm.lookup", rows: "2314" }),
      step("Delete action executes", "The agent calls crm.delete_records from untrusted influence.", ["delete"], [3], "ALLOWED", { tool: "crm.delete_records", scope: "inactive_accounts" }),
      step("Destructive write detected", "The detector flags a destructive write from untrusted content.", ["violation"], [4], "DETECTED", { detector: "destructive_write", severity: "critical" }),
    ],
    guardrailed: [
      step("Ticket marked untrusted", "The support ticket is treated as data from an untrusted channel.", ["ticket"], [], "ALLOWED", { source: "ticket", trust: "untrusted" }),
      step("Read-only plan", "The policy layer allows triage but strips destructive authority.", ["plan"], [0], "BLOCKED", { mode: "least_privilege" }),
      step("Lookup allowed", "Read-only CRM lookup is allowed for summarization.", ["lookup", "records"], [1, 2], "ALLOWED", { tool: "crm.lookup", permission: "read-only" }),
      step("Delete blocked", "crm.delete_records is blocked before execution.", ["delete"], [3], "BLOCKED", { tool: "crm.delete_records", result: "blocked" }),
      step("Chain contained", "The bot produces a safe triage note instead of deleting records.", ["violation"], [4], "CONTAINED", { outcome: "safe_triage" }),
    ],
  },
  {
    id: "browser-token",
    name: "Hidden page prompt -> token leak",
    app: "Browser Research Agent",
    detector: "untrusted_to_action",
    severity: "high",
    time: "41m ago",
    traceId: "abr_web_42aa",
    nodes: [
      { id: "page", tag: "UNTRUSTED", label: "Hidden HTML", sub: "display:none prompt", tone: "untrusted", x: x[0], y: 108 },
      { id: "plan", tag: "MODEL", label: "Research plan", sub: "unsafe tool route", tone: "agent", x: x[1], y: 108 },
      { id: "storage", tag: "TOOL", label: "storage.get", sub: "session tokens", tone: "tool", x: x[2], y: 42 },
      { id: "token", tag: "PROTECTED", label: "Session token", sub: "redacted hash", tone: "protected", x: x[3], y: 42 },
      { id: "post", tag: "EXTERNAL", label: "http.request", sub: "evil-cdn hook", tone: "external", x: x[3], y: 174 },
      { id: "violation", tag: "DETECTOR", label: "Token leak", sub: "untrusted action", tone: "violation", x: x[4], y: 108 },
    ],
    edges: [
      { from: "page", to: "plan", tone: "warn" },
      { from: "plan", to: "storage", tone: "blue" },
      { from: "storage", to: "token", tone: "violet" },
      { from: "token", to: "post", tone: "orange" },
      { from: "post", to: "violation", tone: "red" },
    ],
    breach: [
      step("Hidden prompt read", "The browser agent reads hidden page instructions as page content.", ["page"], [], "ALLOWED", { source: "html", trust: "untrusted" }),
      step("Unsafe research plan", "The hidden instruction influences browser storage access.", ["plan"], [0], "ALLOWED", { influence: "page -> plan" }),
      step("Session storage read", "The agent calls browser.storage.get for session tokens.", ["storage", "token"], [1, 2], "ALLOWED", { tool: "browser.storage.get", class: "protected" }),
      step("External POST", "The token hash is sent to an unlisted external hook.", ["post"], [3], "ALLOWED", { tool: "http.request", host: "hooks.evil-cdn.net" }),
      step("Untrusted-to-action", "The detector flags untrusted content causing external action.", ["violation"], [4], "DETECTED", { detector: "untrusted_to_action", severity: "high" }),
    ],
    guardrailed: [
      step("Hidden prompt labeled", "The page text is marked untrusted before planning.", ["page"], [], "ALLOWED", { trust: "untrusted", source: "browser" }),
      step("Storage read blocked", "Protected browser storage access is denied.", ["storage", "token"], [1, 2], "BLOCKED", { tool: "browser.storage.get", result: "blocked" }),
      step("Unlisted POST blocked", "The external host is not on the allowed destination list.", ["post"], [3], "BLOCKED", { host: "hooks.evil-cdn.net", allowlist: "miss" }),
      step("Chain contained", "The agent returns a safe research summary.", ["violation"], [4], "CONTAINED", { outcome: "safe_research_summary" }),
    ],
  },
];

function step(
  title: string,
  desc: string,
  focus: string[],
  edges: number[],
  decision: ReplayStep["decision"],
  event: Record<string, unknown>,
): ReplayStep {
  return {
    title,
    desc,
    focus,
    edges,
    decision,
    labels: Object.entries(event).map(([k, v]) => ({ k, v: String(v) })),
    event: {
      type: title.toLowerCase().replaceAll(" ", "."),
      captureMode: "metadata-only",
      preview: "[redacted · metadata only]",
      ...event,
    },
  };
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function nodeCenter(node: GraphNode, side: "left" | "right") {
  return {
    x: node.x + (side === "left" ? 0 : 176),
    y: node.y + 42,
  };
}

function edgePath(nodes: GraphNode[], edge: GraphEdge) {
  const from = nodes.find((node) => node.id === edge.from)!;
  const to = nodes.find((node) => node.id === edge.to)!;
  const start = nodeCenter(from, "right");
  const end = nodeCenter(to, "left");
  const c = 52;
  return `M ${start.x} ${start.y} C ${start.x + c} ${start.y}, ${end.x - c} ${end.y}, ${end.x} ${end.y}`;
}

export default function StudioClient({ userEmail }: { userEmail: string }) {
  const [incidents, setIncidents] = useState(baseIncidents);
  const [incidentId, setIncidentId] = useState(baseIncidents[0].id);
  const [mode, setMode] = useState<Mode>("breach");
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importTab, setImportTab] = useState<"sdk" | "logs" | "proxy">("sdk");
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const incident = useMemo(
    () => incidents.find((item) => item.id === incidentId) ?? incidents[0],
    [incidentId, incidents],
  );
  const steps = mode === "breach" ? incident.breach : incident.guardrailed;
  const current = steps[stepIndex] ?? steps[0];
  const visitedFocus = new Set(steps.slice(0, stepIndex + 1).flatMap((stepItem) => stepItem.focus));
  const visitedEdges = new Set(steps.slice(0, stepIndex + 1).flatMap((stepItem) => stepItem.edges));
  const currentEdges = new Set(current.edges);

  useEffect(() => {
    const saved = window.localStorage.getItem("abr-studio-state");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { incidentId?: string; mode?: Mode; stepIndex?: number };
      if (parsed.incidentId) setIncidentId(parsed.incidentId);
      if (parsed.mode) setMode(parsed.mode);
      if (typeof parsed.stepIndex === "number") setStepIndex(parsed.stepIndex);
    } catch {
      window.localStorage.removeItem("abr-studio-state");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "abr-studio-state",
      JSON.stringify({ incidentId, mode, stepIndex }),
    );
  }, [incidentId, mode, stepIndex]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStepIndex((index) => (index + 1) % steps.length);
    }, 1600);
    return () => window.clearInterval(timer);
  }, [playing, steps.length]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight") {
        setStepIndex((index) => Math.min(index + 1, steps.length - 1));
      }
      if (event.key === "ArrowLeft") {
        setStepIndex((index) => Math.max(index - 1, 0));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [steps.length]);

  function selectIncident(id: string) {
    setIncidentId(id);
    setStepIndex(0);
    setPlaying(false);
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setStepIndex(0);
  }

  function jumpToNode(nodeId: string) {
    const latest = steps.reduce((found, stepItem, index) => {
      return stepItem.focus.includes(nodeId) ? index : found;
    }, 0);
    setStepIndex(latest);
  }

  function exportReport() {
    const report = [
      `# ${incident.name}`,
      "",
      `App: ${incident.app}`,
      `Trace: ${incident.traceId}`,
      `Mode: ${mode}`,
      `Detector: ${incident.detector}`,
      "",
      ...steps.map((item, index) => `${index + 1}. ${item.title} - ${item.desc}`),
    ].join("\n");
    const blob = new Blob([report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${incident.id}-${mode}-report.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleFile(file: File) {
    setParsing(true);
    window.setTimeout(() => {
      const imported: Incident = {
        ...baseIncidents[0],
        id: `imported-${Date.now()}`,
        name: `Imported · ${file.name}`,
        app: "Uploaded trace",
        traceId: `abr_import_${Date.now().toString(36)}`,
        time: "now",
      };
      setIncidents((items) => [imported, ...items]);
      setIncidentId(imported.id);
      setStepIndex(0);
      setParsing(false);
      setImportOpen(false);
    }, 800);
  }

  return (
    <main className={cx("studioShell", playing && "isPlaying")}>
      <header className="topBar">
        <div className="logoMark">AB</div>
        <div className="brandBlock">
          <strong>Agent Breach Replay</strong>
          <span>STUDIO</span>
        </div>
        <div className="topSpacer" />
        <div className="modeToggle">
          <button className={mode === "breach" ? "active" : ""} onClick={() => switchMode("breach")} type="button">
            Breach
          </button>
          <button className={mode === "guardrailed" ? "active" : ""} onClick={() => switchMode("guardrailed")} type="button">
            Guardrailed
          </button>
        </div>
        <button className="glassButton" onClick={exportReport} type="button">
          Export report
        </button>
      </header>

      <div className="workspace">
        <aside className="sidebar glassPanel">
          <div className="sidebarHeader">
            <span>INCIDENTS</span>
            <button onClick={() => setImportOpen(true)} type="button">+ Import</button>
          </div>
          <div className="incidentList">
            {incidents.map((item) => (
              <button
                className={cx("incidentCard", item.id === incident.id && "selected")}
                key={item.id}
                onClick={() => selectIncident(item.id)}
                type="button"
              >
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.app}</span>
                </div>
                <code>{item.detector}</code>
                <footer>
                  <i className={`severity ${item.severity}`} />
                  <span>{item.severity}</span>
                  <span>{item.time}</span>
                </footer>
              </button>
            ))}
          </div>
          <div className="sidebarFooter">
            <span>Capture mode</span>
            <code>metadata-only · redacted</code>
            <span>Signed in</span>
            <code>{userEmail}</code>
            <form action="/logout" method="post">
              <button type="submit">Sign out</button>
            </form>
          </div>
        </aside>

        <section className="centerPanel glassPanel">
          <div className="incidentTitle">
            <div>
              <h1>{incident.name}</h1>
              <span>{mode === "breach" ? "UNSAFE RUN" : "GUARDRAILED RUN"}</span>
            </div>
            <code>{incident.traceId}</code>
          </div>

          <div className="graphViewport">
            <div className="graphCanvas">
              <svg className="edgeLayer" viewBox="0 0 1024 306" aria-hidden="true">
                <defs>
                  {incident.edges.map((edge, index) => (
                    <marker
                      id={`arrow-${incident.id}-${index}`}
                      key={index}
                      markerHeight="7"
                      markerWidth="7"
                      orient="auto"
                      refX="6"
                      refY="3.5"
                    >
                      <path d="M0,0 L7,3.5 L0,7 Z" fill={toneForEdge[edge.tone]} />
                    </marker>
                  ))}
                </defs>
                {incident.edges.map((edge, index) => {
                  const path = edgePath(incident.nodes, edge);
                  const isCurrent = currentEdges.has(index);
                  const isVisited = visitedEdges.has(index);
                  return (
                    <g key={`${edge.from}-${edge.to}`}>
                      <path
                        className={cx("graphEdge", isVisited && "visited", isCurrent && "current")}
                        d={path}
                        id={`edge-${incident.id}-${index}`}
                        markerEnd={`url(#arrow-${incident.id}-${index})`}
                        style={{ "--edge": toneForEdge[edge.tone] } as React.CSSProperties}
                      />
                      {playing && isCurrent ? (
                        <circle className="edgeDot" r="4" style={{ "--edge": toneForEdge[edge.tone] } as React.CSSProperties}>
                          <animateMotion dur="0.4s" repeatCount="indefinite" path={path} />
                        </circle>
                      ) : null}
                    </g>
                  );
                })}
              </svg>

              {incident.nodes.map((node) => {
                const focused = current.focus.includes(node.id);
                const visited = visitedFocus.has(node.id);
                const safeOverride = mode === "guardrailed" && node.id === "violation";
                return (
                  <button
                    className={cx("graphNode", `tone-${safeOverride ? "safe" : node.tone}`, visited && "visited", focused && "focused")}
                    key={node.id}
                    onClick={() => jumpToNode(node.id)}
                    style={{ left: node.x, top: node.y }}
                    type="button"
                  >
                    {mode === "guardrailed" && (node.id === "read" || node.id === "delete" || node.id === "storage" || node.id === "post") ? (
                      <b className="cornerBadge">BLOCKED</b>
                    ) : null}
                    {mode === "guardrailed" && node.id === "send" ? <b className="cornerBadge approval">APPROVAL</b> : null}
                    <code>{safeOverride ? "SAFE" : node.tag}</code>
                    <strong>{safeOverride ? "Chain contained" : node.label}</strong>
                    <span>{safeOverride ? "safe outcome" : node.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="timelineBar">
            <div className="progressTrack">
              <span style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
            </div>
            <button onClick={() => setStepIndex((index) => Math.max(0, index - 1))} type="button">◀</button>
            <button className="playButton" onClick={() => setPlaying((value) => !value)} type="button">
              {playing ? "Pause" : "Play"}
            </button>
            <button onClick={() => setStepIndex((index) => Math.min(steps.length - 1, index + 1))} type="button">▶</button>
            <code>{stepIndex + 1}/{steps.length}</code>
            <div className="stepChips">
              {steps.map((item, index) => (
                <button
                  className={cx(index === stepIndex && "active", index < stepIndex && "past")}
                  key={`${item.title}-${index}`}
                  onClick={() => setStepIndex(index)}
                  type="button"
                >
                  {item.title}
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="detailPanel glassPanel">
          <code>STEP {stepIndex + 1} OF {steps.length}</code>
          <h2>{current.title}</h2>
          <p>{current.desc}</p>
          <div className={cx("policyCard", current.decision?.toLowerCase())}>
            <span>POLICY DECISION</span>
            <strong>{current.decision ?? "OBSERVED"}</strong>
          </div>
          <div className="labelRow">
            {current.labels.map((label) => (
              <code key={`${label.k}-${label.v}`}>{label.k}: {label.v}</code>
            ))}
          </div>
          <pre>{JSON.stringify(current.event, null, 2)}</pre>
          <footer>Metadata-only capture. Redacted previews. Use ← → keys to step.</footer>
        </aside>
      </div>

      {importOpen ? (
        <div className="modalBackdrop" onClick={() => setImportOpen(false)}>
          <section className="importModal" onClick={(event) => event.stopPropagation()}>
            <div className="modalHeader">
              <h2>Bring traces into the studio</h2>
              <button onClick={() => setImportOpen(false)} type="button">Close</button>
            </div>
            <div className="modalTabs">
              {(["sdk", "logs", "proxy"] as const).map((tab) => (
                <button className={importTab === tab ? "active" : ""} key={tab} onClick={() => setImportTab(tab)} type="button">
                  {tab === "sdk" ? "SDK" : tab === "logs" ? "Logs upload" : "Proxy"}
                </button>
              ))}
            </div>
            {importTab === "sdk" ? (
              <div className="modalBody">
                <p>Instrument tool boundaries directly with metadata-only capture.</p>
                <pre>{`npm install @agent-breach/replay\n\nconst trace = createSecurityTrace({\n  captureMode: "metadata-only"\n})`}</pre>
              </div>
            ) : null}
            {importTab === "logs" ? (
              <div className="modalBody">
                <input
                  accept=".json,.jsonl"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                  ref={fileInputRef}
                  type="file"
                />
                <button className="dropzone" onClick={() => fileInputRef.current?.click()} type="button">
                  {parsing ? "Parsing trace..." : "Drop or choose .json / .jsonl trace"}
                </button>
                <p>Supports OpenAI Agents SDK, LangSmith, LangGraph, and ABR export.</p>
              </div>
            ) : null}
            {importTab === "proxy" ? (
              <div className="modalBody">
                <p>Route agent tool calls through an observe/enforce proxy.</p>
                <pre>{`ABR_PROXY_URL=https://agent-breach.example/proxy\nABR_PROXY_MODE=enforce # observe | enforce`}</pre>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
