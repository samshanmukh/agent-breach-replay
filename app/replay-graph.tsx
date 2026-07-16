"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

type GraphTrust = "trusted" | "untrusted" | "protected" | "external" | "neutral";
type GraphDecision = "allowed" | "blocked" | "approval_required" | "observed";

export type ReplayGraphEvent = {
  id: string;
  parentId?: string;
  title: string;
  kind: string;
  actor: string;
  trust: GraphTrust;
  summary: string;
  tool?: string;
  target?: string;
  decision: GraphDecision;
};

const sceneLabels: Record<string, string> = {
  USER: "The request",
  AUDIO: "The conversation",
  LLM: "The turning point",
  AGENT: "The agent acts",
  CHAIN: "The context changes",
  TOOL: "The action",
  GUARDRAIL: "The consequence",
};

const actorLabels: Record<string, string> = {
  user: "Trusted user",
  agent: "AI agent",
  tool: "Connected tool",
  policy: "Security policy",
  detector: "Security detector",
};

const actorMarks: Record<string, string> = {
  user: "U",
  agent: "AI",
  tool: "T",
  policy: "P",
  detector: "!",
};

function describeTransition(
  event: ReplayGraphEvent,
  previous?: ReplayGraphEvent,
) {
  if (!previous) return "This trusted request begins the agent’s story.";
  if (event.trust === "untrusted") {
    return "Outside content enters the workflow and can now influence what happens next.";
  }
  if (event.trust === "protected") {
    return "The story crosses a sensitive boundary: the agent reaches protected data.";
  }
  if (event.trust === "external") {
    return event.decision === "blocked"
      ? "The security boundary is reached. A control intervenes before the story can continue."
      : "The agent carries the chain outside the trusted environment.";
  }
  return `${previous.title} leads directly to this next decision.`;
}

function decisionLabel(decision: GraphDecision) {
  if (decision === "approval_required") return "Needs approval";
  return decision.charAt(0).toUpperCase() + decision.slice(1);
}

export default function ReplayGraph({
  events,
  selectedId,
  visitedIds,
  onSelect,
  playing,
  onTogglePlay,
  currentStep,
  incidentIds,
  playbackRate,
  onCyclePlaybackRate,
}: {
  events: ReplayGraphEvent[];
  selectedId: string;
  visitedIds: Set<string>;
  onSelect: (event: ReplayGraphEvent) => void;
  playing: boolean;
  onTogglePlay: () => void;
  currentStep: number;
  incidentIds: Set<string>;
  playbackRate: number;
  onCyclePlaybackRate: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const activeEvent = events[currentStep];
  const previousEvent = events[currentStep - 1];
  const nextEvent = events[currentStep + 1];
  const progress = events.length ? ((currentStep + 1) / events.length) * 100 : 0;

  if (!activeEvent) return null;

  return (
    <section className="interactiveGraph storyReplay" aria-label="Incident story replay">
      <header className="storyReplayHeader">
        <div>
          <span>Incident story</span>
          <strong>See how one decision became a security breach</strong>
        </div>
        <div className="storyReplayControls">
          <button
            aria-label="Previous scene"
            disabled={!previousEvent}
            onClick={() => previousEvent && onSelect(previousEvent)}
            type="button"
          >
            ←
          </button>
          <button
            className="storyPlay"
            onClick={onTogglePlay}
            type="button"
          >
            <i>{playing ? "Ⅱ" : "▶"}</i>
            {playing ? "Pause story" : "Play story"}
          </button>
          <button
            aria-label="Next scene"
            disabled={!nextEvent}
            onClick={() => nextEvent && onSelect(nextEvent)}
            type="button"
          >
            →
          </button>
          <button
            className="storySpeed"
            onClick={onCyclePlaybackRate}
            title="Change replay speed"
            type="button"
          >
            {playbackRate}×
          </button>
        </div>
      </header>

      <div className={`storyStage trust-${activeEvent.trust}`}>
        <div className="storyAtmosphere" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <AnimatePresence mode="wait">
          <motion.article
            className="storyScene"
            key={activeEvent.id}
            initial={reduceMotion ? false : { opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, x: -28 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 260, damping: 28 }
            }
          >
            <header className="storySceneHeader">
              <div>
                <span>Scene {String(currentStep + 1).padStart(2, "0")}</span>
                <i />
                <strong>{sceneLabels[activeEvent.kind] ?? "The next event"}</strong>
              </div>
              <b className={`decision-${activeEvent.decision}`}>
                {decisionLabel(activeEvent.decision)}
              </b>
            </header>

            <div className="storySceneContent">
              <div className="storyNarrative">
                <div className={`storyActor trust-${activeEvent.trust}`}>
                  <span>{actorMarks[activeEvent.actor] ?? "•"}</span>
                  <div>
                    <small>{actorLabels[activeEvent.actor] ?? activeEvent.actor}</small>
                    <strong>{activeEvent.kind.toLowerCase()}</strong>
                  </div>
                </div>
                <p className="storyKicker">
                  {activeEvent.trust === "untrusted"
                    ? "An outside influence enters the story"
                    : activeEvent.trust === "protected"
                      ? "A sensitive boundary is crossed"
                      : activeEvent.trust === "external"
                        ? "The chain reaches its consequence"
                        : "The agent makes its next move"}
                </p>
                <h3>{activeEvent.title}</h3>
                <p className="storySummary">{activeEvent.summary}</p>
                <blockquote>{describeTransition(activeEvent, previousEvent)}</blockquote>
              </div>

              <aside className="storyEvidence">
                <span>What the replay proves</span>
                <dl>
                  <div>
                    <dt>Actor</dt>
                    <dd>{actorLabels[activeEvent.actor] ?? activeEvent.actor}</dd>
                  </div>
                  <div>
                    <dt>Trust</dt>
                    <dd className={`trust-${activeEvent.trust}`}>{activeEvent.trust}</dd>
                  </div>
                  {activeEvent.tool ? (
                    <div>
                      <dt>Tool used</dt>
                      <dd><code>{activeEvent.tool}</code></dd>
                    </div>
                  ) : null}
                  {activeEvent.target ? (
                    <div>
                      <dt>Target</dt>
                      <dd><code>{activeEvent.target}</code></dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Evidence</dt>
                    <dd>{incidentIds.has(activeEvent.id) ? "Part of breach path" : "Supporting context"}</dd>
                  </div>
                </dl>
                <footer>
                  <code>{activeEvent.id}</code>
                  <span>{activeEvent.parentId ? `follows ${activeEvent.parentId}` : "story origin"}</span>
                </footer>
              </aside>
            </div>
          </motion.article>
        </AnimatePresence>

        <div className="storyProgress" aria-label={`Scene ${currentStep + 1} of ${events.length}`}>
          <div className="storyProgressMeta">
            <span>{Math.round(progress)}% through the incident</span>
            <strong>{currentStep + 1} of {events.length}</strong>
          </div>
          <div className="storyProgressTrack">
            <motion.span
              animate={{ width: `${progress}%` }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.35 }}
            />
          </div>
        </div>
      </div>

      <nav className="storyChapters" aria-label="Incident scenes">
        {events.map((event, index) => {
          const active = event.id === selectedId;
          const visited = visitedIds.has(event.id);
          return (
            <button
              className={[
                active ? "active" : "",
                visited ? "visited" : "",
                incidentIds.has(event.id) ? "evidence" : "",
                `trust-${event.trust}`,
              ].filter(Boolean).join(" ")}
              key={event.id}
              onClick={() => onSelect(event)}
              type="button"
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <i />
              <div>
                <small>{sceneLabels[event.kind] ?? event.kind}</small>
                <strong>{event.title}</strong>
              </div>
              {incidentIds.has(event.id) ? <b>Evidence</b> : null}
            </button>
          );
        })}
      </nav>
    </section>
  );
}
