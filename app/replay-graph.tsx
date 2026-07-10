"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from "react";
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

type Point = { x: number; y: number };
type Transform = { x: number; y: number; scale: number };

const canvas = { width: 1160, height: 460 };
const node = { width: 154, height: 86 };

function initialLayout(events: ReplayGraphEvent[]) {
  const byId = new Map(events.map((event) => [event.id, event]));
  const depths = new Map<string, number>();

  function depthFor(event: ReplayGraphEvent, seen = new Set<string>()): number {
    const cached = depths.get(event.id);
    if (cached !== undefined) return cached;
    if (!event.parentId || seen.has(event.parentId)) {
      depths.set(event.id, 0);
      return 0;
    }
    const parent = byId.get(event.parentId);
    if (!parent) {
      depths.set(event.id, 0);
      return 0;
    }
    seen.add(event.id);
    const depth = depthFor(parent, seen) + 1;
    depths.set(event.id, depth);
    return depth;
  }

  events.forEach((event) => depthFor(event));
  const byDepth = new Map<number, ReplayGraphEvent[]>();
  events.forEach((event) => {
    const depth = depths.get(event.id) ?? 0;
    byDepth.set(depth, [...(byDepth.get(depth) ?? []), event]);
  });

  const maxDepth = Math.max(1, ...depths.values());
  const horizontalGap = Math.min(190, (canvas.width - node.width - 80) / maxDepth);
  const positions: Record<string, Point> = {};

  for (const [depth, levelEvents] of byDepth) {
    const verticalGap = canvas.height / (levelEvents.length + 1);
    levelEvents.forEach((event, index) => {
      positions[event.id] = {
        x: 38 + depth * horizontalGap,
        y: verticalGap * (index + 1) - node.height / 2,
      };
    });
  }
  return positions;
}

function edgePath(from: Point, to: Point) {
  const startX = from.x + node.width;
  const startY = from.y + node.height / 2;
  const endX = to.x;
  const endY = to.y + node.height / 2;
  const curve = Math.max(48, Math.abs(endX - startX) * 0.42);
  return `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [positions, setPositions] = useState(() => initialLayout(events));
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState<{
    type: "node" | "canvas";
    id?: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const eventKey = events.map((event) => event.id).join("|");
  const edges = useMemo(
    () =>
      events.flatMap((event) => {
        if (!event.parentId) return [];
        const parent = events.find((candidate) => candidate.id === event.parentId);
        return parent ? [{ from: parent, to: event }] : [];
      }),
    [events],
  );

  function fitGraph() {
    const width = viewportRef.current?.clientWidth ?? canvas.width;
    const height = viewportRef.current?.clientHeight ?? canvas.height;
    const scale = Math.min(1, (width - 36) / canvas.width, (height - 36) / canvas.height);
    setTransform({
      x: (width - canvas.width * scale) / 2,
      y: (height - canvas.height * scale) / 2,
      scale,
    });
  }

  useEffect(() => {
    setPositions(initialLayout(events));
    const frame = requestAnimationFrame(fitGraph);
    return () => cancelAnimationFrame(frame);
  }, [eventKey]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => fitGraph());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const point = positions[selectedId];
    const viewport = viewportRef.current;
    if (!point || !viewport) return;
    setTransform((current) => ({
      ...current,
      x:
        viewport.clientWidth / 2 -
        (point.x + node.width / 2) * current.scale,
      y:
        viewport.clientHeight / 2 -
        (point.y + node.height / 2) * current.scale,
    }));
  }, [playing, selectedId]);

  function zoom(nextScale: number, center?: Point) {
    setTransform((current) => {
      const scale = Math.min(1.8, Math.max(0.35, nextScale));
      const anchor = center ?? {
        x: (viewportRef.current?.clientWidth ?? canvas.width) / 2,
        y: (viewportRef.current?.clientHeight ?? canvas.height) / 2,
      };
      const graphX = (anchor.x - current.x) / current.scale;
      const graphY = (anchor.y - current.y) / current.scale;
      return {
        scale,
        x: anchor.x - graphX * scale,
        y: anchor.y - graphY * scale,
      };
    });
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const bounds = viewportRef.current?.getBoundingClientRect();
    zoom(transform.scale * (event.deltaY > 0 ? 0.9 : 1.1), {
      x: event.clientX - (bounds?.left ?? 0),
      y: event.clientY - (bounds?.top ?? 0),
    });
  }

  function startCanvasDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest(".interactiveGraphNode")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging({
      type: "canvas",
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y,
      moved: false,
    });
  }

  function startNodeDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    eventId: string,
  ) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = positions[eventId] ?? { x: 0, y: 0 };
    setDragging({
      type: "node",
      id: eventId,
      startX: event.clientX,
      startY: event.clientY,
      originX: point.x,
      originY: point.y,
      moved: false,
    });
  }

  function movePointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const deltaX = event.clientX - dragging.startX;
    const deltaY = event.clientY - dragging.startY;
    const moved = dragging.moved || Math.abs(deltaX) + Math.abs(deltaY) > 4;
    if (dragging.type === "canvas") {
      setTransform((current) => ({
        ...current,
        x: dragging.originX + deltaX,
        y: dragging.originY + deltaY,
      }));
    } else if (dragging.id) {
      setPositions((current) => ({
        ...current,
        [dragging.id!]: {
          x: Math.max(0, Math.min(canvas.width - node.width, dragging.originX + deltaX / transform.scale)),
          y: Math.max(0, Math.min(canvas.height - node.height, dragging.originY + deltaY / transform.scale)),
        },
      }));
    }
    if (moved !== dragging.moved) {
      setDragging((current) => (current ? { ...current, moved } : current));
    }
  }

  function endPointer() {
    if (dragging?.type === "node" && dragging.id && !dragging.moved) {
      const selected = events.find((event) => event.id === dragging.id);
      if (selected) onSelect(selected);
    }
    setDragging(null);
  }

  function resetLayout() {
    setPositions(initialLayout(events));
    requestAnimationFrame(fitGraph);
  }

  async function toggleFullscreen() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await viewport.requestFullscreen();
  }

  return (
    <section className="interactiveGraph">
      <header className="interactiveGraphToolbar">
        <div>
          <span>Drag nodes to reorganize · drag canvas to pan · scroll to zoom</span>
        </div>
        <div>
          <button onClick={() => zoom(transform.scale - 0.15)} type="button" aria-label="Zoom out">−</button>
          <code>{Math.round(transform.scale * 100)}%</code>
          <button onClick={() => zoom(transform.scale + 0.15)} type="button" aria-label="Zoom in">+</button>
          <button onClick={fitGraph} type="button">Fit</button>
          <button onClick={resetLayout} type="button">Reset layout</button>
          <button onClick={() => void toggleFullscreen()} type="button" aria-label="Toggle fullscreen">↗</button>
        </div>
      </header>
      <div
        className={`interactiveGraphViewport${dragging?.type === "canvas" ? " panning" : ""}`}
        onPointerDown={startCanvasDrag}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onWheel={onWheel}
        ref={viewportRef}
      >
        <div
          className="interactiveGraphPlaybackOverlay"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            className={playing ? "playing" : ""}
            onClick={onTogglePlay}
            aria-label={playing ? "Pause replay" : "Play replay"}
            title={playing ? "Pause replay" : "Play replay"}
            type="button"
          >
            {playing ? "Ⅱ" : "▶"}
          </button>
          <code>SPAN {currentStep + 1}/{events.length}</code>
          <button
            className="interactiveGraphRate"
            onClick={onCyclePlaybackRate}
            aria-label={`Replay speed ${playbackRate}x`}
            title="Change replay speed"
            type="button"
          >
            {playbackRate}×
          </button>
        </div>
        <motion.div
          className="interactiveGraphCanvas"
          style={{
            width: canvas.width,
            height: canvas.height,
          }}
          animate={{
            x: transform.x,
            y: transform.y,
            scale: transform.scale,
          }}
          transition={
            reduceMotion || dragging
              ? { duration: 0 }
              : { type: "spring", stiffness: 260, damping: 32, mass: 0.7 }
          }
        >
          <svg
            aria-hidden="true"
            className="interactiveGraphEdges"
            height={canvas.height}
            viewBox={`0 0 ${canvas.width} ${canvas.height}`}
            width={canvas.width}
          >
            <defs>
              <marker id="interactive-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
              </marker>
            </defs>
            {edges.map(({ from, to }) => {
              const fromPoint = positions[from.id];
              const toPoint = positions[to.id];
              if (!fromPoint || !toPoint) return null;
              const visited = visitedIds.has(from.id) && visitedIds.has(to.id);
              const selected = selectedId === from.id || selectedId === to.id;
              const incident =
                incidentIds.has(from.id) && incidentIds.has(to.id);
              return (
                <g key={`${from.id}-${to.id}`}>
                  <motion.path
                    className={`${visited ? "visited" : ""}${selected ? " selected" : ""}${incident ? " incident" : ""}`}
                    d={edgePath(fromPoint, toPoint)}
                    markerEnd="url(#interactive-arrow)"
                    initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
                    animate={{
                      pathLength: visited ? 1 : 0.22,
                      opacity: visited ? 1 : 0.34,
                    }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : {
                            pathLength: {
                              duration: selected ? 0.62 : 0.38,
                              ease: "easeInOut",
                            },
                            opacity: { duration: 0.2 },
                          }
                    }
                  />
                </g>
              );
            })}
          </svg>
          {events.map((event, index) => {
            const point = positions[event.id] ?? { x: 0, y: 0 };
            const visited = visitedIds.has(event.id);
            const selected = selectedId === event.id;
            const incident = incidentIds.has(event.id);
            return (
              <motion.button
                className={[
                  "interactiveGraphNode",
                  `trust-${event.trust}`,
                  visited ? "visited" : "",
                  selected ? "selected" : "",
                  incident ? "incident" : "",
                ].filter(Boolean).join(" ")}
                initial={
                  reduceMotion
                    ? false
                    : { opacity: 0, scale: 0.9, y: 10 }
                }
                animate={{
                  opacity: visited ? 1 : incident ? 0.72 : 0.42,
                  scale: selected ? 1.045 : 1,
                  y: selected ? -5 : 0,
                  boxShadow:
                    selected && playing && !reduceMotion
                      ? [
                          "0 0 0 3px rgba(255,255,255,0.06), 0 12px 30px rgba(0,0,0,0.35)",
                          "0 0 0 7px rgba(156,131,239,0.15), 0 16px 38px rgba(0,0,0,0.42)",
                          "0 0 0 3px rgba(255,255,255,0.06), 0 12px 30px rgba(0,0,0,0.35)",
                        ]
                      : "0 8px 24px rgba(0,0,0,0.24)",
                }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : {
                        opacity: { duration: 0.24, delay: index * 0.035 },
                        scale: { type: "spring", stiffness: 360, damping: 24 },
                        y: { type: "spring", stiffness: 360, damping: 24 },
                        boxShadow:
                          selected && playing
                            ? { duration: 1.45, repeat: Infinity }
                            : { duration: 0.2 },
                      }
                }
                key={event.id}
                onPointerDown={(pointerEvent) =>
                  startNodeDrag(pointerEvent, event.id)
                }
                style={{ left: point.x, top: point.y }}
                type="button"
              >
                <span>
                  <code>{event.kind}</code>
                  <i>{event.trust.slice(0, 2).toUpperCase()}</i>
                </span>
                <strong>{event.title}</strong>
                <small>{event.tool ?? event.target ?? event.actor}</small>
                {event.decision === "blocked" ? <b>BLOCKED</b> : null}
                {event.decision === "approval_required" ? <b className="approval">APPROVAL</b> : null}
              </motion.button>
            );
          })}
        </motion.div>
        <AnimatePresence mode="wait">
          {events[currentStep] ? (
            <motion.aside
              className={`interactiveGraphStory trust-${events[currentStep].trust}`}
              key={events[currentStep].id}
              initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 300, damping: 28 }
              }
            >
              <header>
                <span>Active span</span>
                <code>{events[currentStep].kind}</code>
              </header>
              <strong>{events[currentStep].title}</strong>
              <div className="interactiveGraphSpanMeta">
                <code>{events[currentStep].id}</code>
                <span>
                  parent: {events[currentStep].parentId ?? "trace root"}
                </span>
              </div>
              <p>{events[currentStep].summary}</p>
              <footer>
                <span>
                  {events[currentStep].trust}
                  {incidentIds.has(events[currentStep].id)
                    ? " · evidence"
                    : ""}
                </span>
                <b>{events[currentStep].decision.replaceAll("_", " ")}</b>
              </footer>
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
