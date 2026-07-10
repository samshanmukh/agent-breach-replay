"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from "react";

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
}: {
  events: ReplayGraphEvent[];
  selectedId: string;
  visitedIds: Set<string>;
  onSelect: (event: ReplayGraphEvent) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
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
    if (event.target !== event.currentTarget) return;
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
          className="interactiveGraphCanvas"
          style={{
            width: canvas.width,
            height: canvas.height,
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          }}
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
              return (
                <g key={`${from.id}-${to.id}`}>
                  <path
                    className={`${visited ? "visited" : ""}${selected ? " selected" : ""}`}
                    d={edgePath(fromPoint, toPoint)}
                    markerEnd="url(#interactive-arrow)"
                  />
                </g>
              );
            })}
          </svg>
          {events.map((event) => {
            const point = positions[event.id] ?? { x: 0, y: 0 };
            return (
              <button
                className={[
                  "interactiveGraphNode",
                  `trust-${event.trust}`,
                  visitedIds.has(event.id) ? "visited" : "",
                  selectedId === event.id ? "selected" : "",
                ].filter(Boolean).join(" ")}
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
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
