"use client";

import { useMemo } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";

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

const ZONE_FOR_TRUST: Record<GraphTrust, string> = {
  trusted: "Command",
  untrusted: "Untrusted",
  protected: "Vault",
  external: "Exfil",
  neutral: "Ops",
};

const ACTOR_GLYPH: Record<string, string> = {
  user: "USR",
  agent: "AGT",
  tool: "TL",
  policy: "POL",
  detector: "DET",
};

function decisionLabel(decision: GraphDecision) {
  return decision.replaceAll("_", " ");
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
  missionTitle,
  severity,
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
  missionTitle?: string;
  severity?: string;
}) {
  const reduceMotion = useReducedMotion();
  const active = events[currentStep] ?? events[0];
  const progress = events.length
    ? ((currentStep + 1) / events.length) * 100
    : 0;
  const evidenceHits = useMemo(
    () => events.filter((event) => incidentIds.has(event.id)).length,
    [events, incidentIds],
  );
  const blockedHits = useMemo(
    () =>
      events.filter(
        (event) =>
          visitedIds.has(event.id) &&
          (event.decision === "blocked" ||
            event.decision === "approval_required"),
      ).length,
    [events, visitedIds],
  );
  const score = evidenceHits * 100 + blockedHits * 40 + visitedIds.size * 5;
  const isAlert =
    !!active &&
    (incidentIds.has(active.id) ||
      active.decision === "blocked" ||
      active.decision === "approval_required");

  const trail = useMemo(() => {
    const windowStart = Math.max(0, currentStep - 2);
    const windowEnd = Math.min(events.length, currentStep + 4);
    return events.slice(windowStart, windowEnd).map((event, offset) => ({
      event,
      absoluteIndex: windowStart + offset,
    }));
  }, [events, currentStep]);

  if (!active) {
    return (
      <section className="incidentArena">
        <div className="incidentArenaEmpty">No incident spans to play.</div>
      </section>
    );
  }

  return (
    <section className={`incidentArena${playing ? " isPlaying" : ""}${isAlert ? " isAlert" : ""}`}>
      <div className="incidentArenaAtmosphere" aria-hidden="true">
        <span className="incidentArenaGrid" />
        <span className="incidentArenaScan" />
        <span className="incidentArenaGlow" />
      </div>

      <header className="incidentArenaHud">
        <div className="incidentArenaMission">
          <span className="incidentArenaEyebrow">Incident playthrough</span>
          <strong>{missionTitle ?? "Live breach replay"}</strong>
          <small>
            {severity ? `${severity.toUpperCase()} threat` : "TRACE MISSION"} ·{" "}
            {evidenceHits} evidence nodes
          </small>
        </div>
        <div className="incidentArenaMeters">
          <div>
            <span>SCORE</span>
            <b>{score}</b>
          </div>
          <div>
            <span>BEAT</span>
            <b>
              {String(currentStep + 1).padStart(2, "0")}/
              {String(events.length).padStart(2, "0")}
            </b>
          </div>
          <div>
            <span>ZONE</span>
            <b>{ZONE_FOR_TRUST[active.trust]}</b>
          </div>
        </div>
        <div className="incidentArenaControls">
          <button
            className={playing ? "playing" : ""}
            onClick={onTogglePlay}
            aria-label={playing ? "Pause incident" : "Play incident"}
            type="button"
          >
            {playing ? "PAUSE" : "PLAY"}
          </button>
          <button
            onClick={onCyclePlaybackRate}
            aria-label={`Playback speed ${playbackRate}x`}
            type="button"
          >
            {playbackRate}×
          </button>
        </div>
      </header>

      <div className="incidentArenaProgress" aria-hidden="true">
        <motion.i
          animate={{ width: `${progress}%` }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 120, damping: 24 }
          }
        />
      </div>

      <div className="incidentArenaStage">
        <aside className="incidentArenaZones" aria-label="Trust zones">
          {(
            [
              ["trusted", "Command"],
              ["untrusted", "Untrusted"],
              ["protected", "Vault"],
              ["external", "Exfil"],
            ] as const
          ).map(([tone, label]) => (
            <div
              className={`incidentArenaZone trust-${tone}${
                active.trust === tone ? " active" : ""
              }`}
              key={tone}
            >
              <i />
              <span>{label}</span>
            </div>
          ))}
        </aside>

        <div className="incidentArenaFocus">
          <AnimatePresence mode="wait">
            <motion.article
              className={`incidentArenaHero trust-${active.trust}${
                isAlert ? " alert" : ""
              }`}
              key={active.id}
              initial={
                reduceMotion
                  ? false
                  : { opacity: 0, y: 28, scale: 0.96, filter: "blur(6px)" }
              }
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                filter: "blur(0px)",
              }}
              exit={
                reduceMotion
                  ? undefined
                  : { opacity: 0, y: -18, scale: 0.98, filter: "blur(4px)" }
              }
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 280, damping: 26 }
              }
            >
              <div className="incidentArenaHeroTop">
                <span className="incidentArenaGlyph">
                  {ACTOR_GLYPH[active.actor] ?? active.kind.slice(0, 3)}
                </span>
                <div>
                  <code>{active.kind}</code>
                  <small>{ZONE_FOR_TRUST[active.trust]} lane</small>
                </div>
                {isAlert ? <b className="incidentArenaAlertTag">ALERT</b> : null}
              </div>

              <h3>{active.title}</h3>
              <p>{active.summary}</p>

              <footer>
                <span>{active.tool ?? active.target ?? active.actor}</span>
                <strong>{decisionLabel(active.decision)}</strong>
              </footer>

              {playing && !reduceMotion ? (
                <motion.span
                  className="incidentArenaPulse"
                  aria-hidden="true"
                  animate={{ opacity: [0.15, 0.45, 0.15], scale: [1, 1.04, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
              ) : null}
            </motion.article>
          </AnimatePresence>

          <AnimatePresence>
            {isAlert ? (
              <motion.div
                className="incidentArenaBanner"
                key={`alert-${active.id}`}
                initial={reduceMotion ? false : { opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: 12 }}
                transition={{ duration: 0.28 }}
              >
                <span>Security event</span>
                <strong>
                  {incidentIds.has(active.id)
                    ? "Evidence path engaged"
                    : decisionLabel(active.decision)}
                </strong>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <nav className="incidentArenaTrail" aria-label="Incident beats">
          {trail.map(({ event, absoluteIndex }) => {
            const visited = visitedIds.has(event.id);
            const selected = selectedId === event.id;
            const incident = incidentIds.has(event.id);
            return (
              <motion.button
                className={[
                  "incidentArenaBeat",
                  `trust-${event.trust}`,
                  visited ? "visited" : "",
                  selected ? "selected" : "",
                  incident ? "incident" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={event.id}
                onClick={() => onSelect(event)}
                type="button"
                initial={reduceMotion ? false : { opacity: 0, x: 12 }}
                animate={{ opacity: selected ? 1 : visited ? 0.92 : 0.45, x: 0 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { delay: absoluteIndex * 0.02, duration: 0.25 }
                }
              >
                <span>{String(absoluteIndex + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{event.title}</strong>
                  <small>
                    {event.kind}
                    {incident ? " · evidence" : ""}
                  </small>
                </div>
              </motion.button>
            );
          })}
        </nav>
      </div>
    </section>
  );
}
