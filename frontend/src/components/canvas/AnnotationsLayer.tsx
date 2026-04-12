import { useState, useRef } from "react";
import { Rect, Line, Circle, Group, Text } from "react-konva";
import Konva from "konva";
import {
  useAnnotationStore,
  AnnotationItem,
  BBoxData,
  PolygonData,
  PointData,
  MaskData,
} from "../../store/annotation";

const LABEL_COLORS: Record<string, string> = {};
const PALETTE = [
  "#6366f1", "#f59e0b", "#22c55e", "#ef4444", "#3b82f6",
  "#ec4899", "#14b8a6", "#f97316", "#8b5cf6", "#06b6d4",
];
function getColor(label: string): string {
  if (!LABEL_COLORS[label]) {
    LABEL_COLORS[label] = PALETTE[Object.keys(LABEL_COLORS).length % PALETTE.length];
  }
  return LABEL_COLORS[label];
}

// ── Handle: fixed screen size, large hit area, hover highlight ──

interface HandleProps {
  x: number;
  y: number;
  color: string;
  draggable?: boolean;
  cursor?: string;
  onDragStart?: () => void;
  onDragEnd?: (pos: { x: number; y: number }) => void;
  onDragMove?: (pos: { x: number; y: number }) => void;
}

function Handle({ x, y, color, draggable, cursor, onDragStart, onDragEnd, onDragMove }: HandleProps) {
  const scale = useAnnotationStore((s) => s.scale);
  const [hovered, setHovered] = useState(false);

  const visualR = (hovered ? 7 : 5) / scale;
  const hitR = 16 / scale;
  const strokeW = 1.5 / scale;

  return (
    <Group
      x={x}
      y={y}
      draggable={draggable}
      onDragStart={() => onDragStart?.()}
      onDragMove={(e) => {
        const node = e.target;
        onDragMove?.({ x: node.x(), y: node.y() });
      }}
      onDragEnd={(e) => {
        const node = e.target;
        const pos = { x: node.x(), y: node.y() };
        node.position({ x, y });
        onDragEnd?.(pos);
      }}
      onMouseEnter={(e) => {
        setHovered(true);
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = cursor || "pointer";
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = "default";
      }}
    >
      <Circle radius={hitR} fill="transparent" />
      <Circle
        radius={visualR}
        fill={hovered ? color : "#fff"}
        stroke={hovered ? "#fff" : color}
        strokeWidth={strokeW}
      />
    </Group>
  );
}

// ── BBox ─────────────────────────────────────────────

function BBoxAnnotation({ ann }: { ann: AnnotationItem }) {
  const { updateAnnotation, pushHistory } = useAnnotationStore();
  const storeData = ann.data as BBoxData;
  const color = getColor(ann.label);
  const activeTool = useAnnotationStore((s) => s.activeTool);
  const canEdit = activeTool === "select";
  const scale = useAnnotationStore((s) => s.scale);

  // Local draft during drag — avoids store updates mid-drag
  const [draft, setDraft] = useState<BBoxData | null>(null);
  const startRef = useRef<BBoxData | null>(null);
  const data = draft ?? storeData;

  // Clear draft once the store catches up (prevents snap-back on commit)
  const prevStoreRef = useRef(storeData);
  if (prevStoreRef.current !== storeData && draft !== null) {
    prevStoreRef.current = storeData;
    setDraft(null);
  }
  prevStoreRef.current = storeData;

  const beginDrag = () => {
    pushHistory();
    startRef.current = { ...storeData };
    setDraft({ ...storeData });
  };

  const commitDrag = (d: BBoxData) => {
    const final = {
      x: Math.round(d.x),
      y: Math.round(d.y),
      width: Math.round(Math.max(2, d.width)),
      height: Math.round(Math.max(2, d.height)),
    };
    // Keep draft visible until store update triggers re-render
    setDraft(final);
    startRef.current = null;
    updateAnnotation(ann.id, { data: final });
  };

  // Corner drag: pos is the final absolute position of the corner handle
  const cornerDrag = (id: string, pos: { x: number; y: number }, commit: boolean) => {
    const s = startRef.current!;
    let x = s.x, y = s.y, w = s.width, h = s.height;
    // pos = initial handle position + mouse delta (Konva tracks from drag start)
    // For "tl": initial = (s.x, s.y), so pos = (s.x + dx, s.y + dy)
    switch (id) {
      case "tl": w = s.x + s.width - pos.x; h = s.y + s.height - pos.y; x = pos.x; y = pos.y; break;
      case "tr": w = pos.x - s.x; h = s.y + s.height - pos.y; y = pos.y; break;
      case "bl": w = s.x + s.width - pos.x; x = pos.x; h = pos.y - s.y; break;
      case "br": w = pos.x - s.x; h = pos.y - s.y; break;
    }
    const d = { x, y, width: Math.max(2, w), height: Math.max(2, h) };
    if (commit) commitDrag(d); else setDraft(d);
  };

  // Edge drag: delta from the edge's starting position
  const edgeDrag = (edge: string, delta: { x: number; y: number }, commit: boolean) => {
    const s = startRef.current!;
    let x = s.x, y = s.y, w = s.width, h = s.height;
    switch (edge) {
      case "top": y += delta.y; h -= delta.y; break;
      case "bottom": h += delta.y; break;
      case "left": x += delta.x; w -= delta.x; break;
      case "right": w += delta.x; break;
    }
    const d = { x, y, width: Math.max(2, w), height: Math.max(2, h) };
    if (commit) commitDrag(d); else setDraft(d);
  };

  const corners = [
    { id: "tl", x: data.x, y: data.y, cursor: "nwse-resize" },
    { id: "tr", x: data.x + data.width, y: data.y, cursor: "nesw-resize" },
    { id: "bl", x: data.x, y: data.y + data.height, cursor: "nesw-resize" },
    { id: "br", x: data.x + data.width, y: data.y + data.height, cursor: "nwse-resize" },
  ];

  const edges = [
    { id: "top", x1: data.x, y1: data.y, x2: data.x + data.width, y2: data.y, cursor: "ns-resize" },
    { id: "bottom", x1: data.x, y1: data.y + data.height, x2: data.x + data.width, y2: data.y + data.height, cursor: "ns-resize" },
    { id: "left", x1: data.x, y1: data.y, x2: data.x, y2: data.y + data.height, cursor: "ew-resize" },
    { id: "right", x1: data.x + data.width, y1: data.y, x2: data.x + data.width, y2: data.y + data.height, cursor: "ew-resize" },
  ];

  return (
    <Group listening={canEdit}>
      {/* Main body */}
      <Rect
        x={data.x}
        y={data.y}
        width={data.width}
        height={data.height}
        fill={ann.selected ? color + "20" : "transparent"}
        stroke={color}
        strokeWidth={(ann.selected ? 2.5 : 1.5) / scale}
        dash={ann.source === "model" ? [6 / scale, 3 / scale] : undefined}
        hitStrokeWidth={canEdit ? 8 / scale : 0}
        draggable={canEdit}
        onDragStart={() => {
          pushHistory();
          startRef.current = { ...storeData };
        }}
        onDragEnd={(e) => {
          const s = startRef.current!;
          const dx = e.target.x() - s.x;
          const dy = e.target.y() - s.y;
          e.target.position({ x: s.x, y: s.y });
          startRef.current = null;
          const final = {
            x: Math.round(s.x + dx),
            y: Math.round(s.y + dy),
            width: s.width,
            height: s.height,
          };
          setDraft(final);
          updateAnnotation(ann.id, { data: final });
        }}
      />

      {/* Label */}
      <Text
        x={data.x}
        y={data.y - 16 / scale}
        text={`${ann.label}${ann.confidence != null ? ` ${(ann.confidence * 100).toFixed(0)}%` : ""}`}
        fontSize={12 / scale}
        fill={color}
        listening={false}
      />

      {ann.selected && canEdit && (
        <>
          {/* Edge drag zones */}
          {edges.map((edge) => (
            <EdgeZone
              key={edge.id}
              {...edge}
              onDragStart={beginDrag}
              onDragMove={(delta) => edgeDrag(edge.id, delta, false)}
              onDragEnd={(delta) => edgeDrag(edge.id, delta, true)}
            />
          ))}

          {/* Corner handles */}
          {corners.map((c) => (
            <Handle
              key={c.id}
              x={c.x}
              y={c.y}
              color={color}
              cursor={c.cursor}
              draggable
              onDragStart={beginDrag}
              onDragMove={(pos) => cornerDrag(c.id, pos, false)}
              onDragEnd={(pos) => cornerDrag(c.id, pos, true)}
            />
          ))}
        </>
      )}
    </Group>
  );
}

// ── Edge drag zone (pointer events, no Konva drag) ──

interface EdgeZoneProps {
  x1: number; y1: number; x2: number; y2: number;
  cursor: string;
  onDragStart: () => void;
  onDragMove: (delta: { x: number; y: number }) => void;
  onDragEnd: (delta: { x: number; y: number }) => void;
}

function EdgeZone({ x1, y1, x2, y2, cursor, onDragStart, onDragMove, onDragEnd }: EdgeZoneProps) {
  const scale = useAnnotationStore((s) => s.scale);
  const [hovered, setHovered] = useState(false);
  const dragging = useRef(false);
  const startMouse = useRef({ x: 0, y: 0 });
  const hitW = 14 / scale;

  // Compute a rect that covers the edge line
  const isHorizontal = Math.abs(y1 - y2) < 1;
  const rx = Math.min(x1, x2);
  const ry = Math.min(y1, y2);
  const rw = isHorizontal ? Math.abs(x2 - x1) : hitW;
  const rh = isHorizontal ? hitW : Math.abs(y2 - y1);
  const offsetX = isHorizontal ? 0 : -hitW / 2;
  const offsetY = isHorizontal ? -hitW / 2 : 0;

  return (
    <Rect
      x={rx + offsetX}
      y={ry + offsetY}
      width={Math.max(rw, hitW)}
      height={Math.max(rh, hitW)}
      fill={hovered ? "rgba(99,102,241,0.15)" : "transparent"}
      onMouseEnter={(e) => {
        setHovered(true);
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = cursor;
      }}
      onMouseLeave={(e) => {
        if (!dragging.current) setHovered(false);
        const stage = e.target.getStage();
        if (stage && !dragging.current) stage.container().style.cursor = "default";
      }}
      onMouseDown={(e) => {
        if (e.evt.button !== 0) return;
        e.cancelBubble = true;
        dragging.current = true;
        const stage = e.target.getStage()!;
        const pointer = stage.getPointerPosition()!;
        startMouse.current = { x: pointer.x, y: pointer.y };
        onDragStart();

        const onMove = () => {
          if (!dragging.current) return;
          const p = stage.getPointerPosition();
          if (!p) return;
          const delta = {
            x: (p.x - startMouse.current.x) / scale,
            y: (p.y - startMouse.current.y) / scale,
          };
          onDragMove(delta);
        };

        const onUp = () => {
          if (!dragging.current) return;
          dragging.current = false;
          const p = stage.getPointerPosition();
          const delta = p ? {
            x: (p.x - startMouse.current.x) / scale,
            y: (p.y - startMouse.current.y) / scale,
          } : { x: 0, y: 0 };
          onDragEnd(delta);
          setHovered(false);
          stage.container().style.cursor = "default";
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }}
    />
  );
}

// ── Polygon ──────────────────────────────────────────

function PolygonAnnotation({ ann }: { ann: AnnotationItem }) {
  const { updateAnnotation, pushHistory } = useAnnotationStore();
  const storeData = ann.data as PolygonData;
  const color = getColor(ann.label);
  const activeTool = useAnnotationStore((s) => s.activeTool);
  const canEdit = activeTool === "select";
  const scale = useAnnotationStore((s) => s.scale);

  const [draftPoints, setDraftPoints] = useState<number[][] | null>(null);
  const startRef = useRef<number[][] | null>(null);
  const points = draftPoints ?? storeData.points;
  const flatPoints = points.flat();

  // Clear draft once store catches up
  const prevStoreRef = useRef(storeData);
  if (prevStoreRef.current !== storeData && draftPoints !== null) {
    prevStoreRef.current = storeData;
    setDraftPoints(null);
  }
  prevStoreRef.current = storeData;

  const commitPolygon = (pts: number[][]) => {
    const final = pts.map((p) => [Math.round(p[0]), Math.round(p[1])]);
    setDraftPoints(final);
    startRef.current = null;
    updateAnnotation(ann.id, { data: { points: final } });
  };

  return (
    <Group listening={canEdit}>
      <Line
        points={flatPoints}
        closed
        stroke={color}
        strokeWidth={(ann.selected ? 2.5 : 1.5) / scale}
        fill={color + "30"}
        dash={ann.source === "model" ? [6 / scale, 3 / scale] : undefined}
        hitStrokeWidth={canEdit ? 10 / scale : 0}
        draggable={canEdit}
        onDragStart={(e) => {
          pushHistory();
          startRef.current = storeData.points.map((p) => [...p]);
          setDraftPoints(storeData.points.map((p) => [...p]));
          (e.target as any)._start = { x: e.target.x(), y: e.target.y() };
        }}
        onDragMove={(e) => {
          const s = (e.target as any)._start;
          const dx = e.target.x() - s.x;
          const dy = e.target.y() - s.y;
          setDraftPoints(startRef.current!.map((pt) => [pt[0] + dx, pt[1] + dy]));
        }}
        onDragEnd={(e) => {
          const s = (e.target as any)._start;
          const dx = e.target.x() - s.x;
          const dy = e.target.y() - s.y;
          e.target.position(s);
          commitPolygon(startRef.current!.map((pt) => [pt[0] + dx, pt[1] + dy]));
        }}
      />

      {/* Vertex handles */}
      {ann.selected && canEdit &&
        points.map((pt, i) => (
          <Handle
            key={i}
            x={pt[0]}
            y={pt[1]}
            color={color}
            cursor="move"
            draggable
            onDragStart={() => {
              pushHistory();
              startRef.current = storeData.points.map((p) => [...p]);
              setDraftPoints(storeData.points.map((p) => [...p]));
            }}
            onDragMove={(pos) => {
              setDraftPoints(
                startRef.current!.map((p, j) =>
                  j === i ? [pos.x, pos.y] : p
                )
              );
            }}
            onDragEnd={(pos) => {
              commitPolygon(
                startRef.current!.map((p, j) =>
                  j === i ? [pos.x, pos.y] : p
                )
              );
            }}
          />
        ))}
    </Group>
  );
}

// ── Points / Keypoints ───────────────────────────────

function PointAnnotation({ ann }: { ann: AnnotationItem }) {
  const { updateAnnotation, pushHistory } = useAnnotationStore();
  const storeData = ann.data as PointData;
  const color = getColor(ann.label);
  const activeTool = useAnnotationStore((s) => s.activeTool);
  const canEdit = activeTool === "select";
  const scale = useAnnotationStore((s) => s.scale);

  const [draftPoints, setDraftPoints] = useState<PointData["points"] | null>(null);
  const startRef = useRef<PointData["points"] | null>(null);
  const pts = draftPoints ?? storeData.points;

  const prevStoreRef = useRef(storeData);
  if (prevStoreRef.current !== storeData && draftPoints !== null) {
    prevStoreRef.current = storeData;
    setDraftPoints(null);
  }
  prevStoreRef.current = storeData;

  const commitPoints = (newPts: PointData["points"]) => {
    const final = newPts.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }));
    setDraftPoints(final);
    startRef.current = null;
    updateAnnotation(ann.id, { data: { points: final } });
  };

  return (
    <Group listening={canEdit}>
      {pts.map((pt, i) => (
        <Group key={i}>
          <Handle
            x={pt.x}
            y={pt.y}
            color={color}
            cursor="move"
            draggable={canEdit && ann.selected}
            onDragStart={() => {
              pushHistory();
              startRef.current = storeData.points.map((p) => ({ ...p }));
              setDraftPoints(storeData.points.map((p) => ({ ...p })));
            }}
            onDragMove={(pos) => {
              setDraftPoints(
                startRef.current!.map((p, j) =>
                  j === i ? { ...p, x: pos.x, y: pos.y } : p
                )
              );
            }}
            onDragEnd={(pos) => {
              commitPoints(
                startRef.current!.map((p, j) =>
                  j === i ? { ...p, x: pos.x, y: pos.y } : p
                )
              );
            }}
          />
          <Text
            x={pt.x + 10 / scale}
            y={pt.y - 6 / scale}
            text={pt.name}
            fontSize={11 / scale}
            fill={color}
            listening={false}
          />
        </Group>
      ))}
    </Group>
  );
}

// ── Mask ──────────────────────────────────────────────

function MaskAnnotation({ ann }: { ann: AnnotationItem }) {
  const activeTool = useAnnotationStore((s) => s.activeTool);
  const data = ann.data as MaskData;
  const color = getColor(ann.label);

  return (
    <Group listening={activeTool === "select"}>
      {data.strokes.map((stroke, i) => (
        <Line
          key={i}
          points={stroke.points}
          stroke={color + "80"}
          strokeWidth={stroke.strokeWidth}
          lineCap="round"
          lineJoin="round"
        />
      ))}
    </Group>
  );
}

// ── Helpers for hit-testing ───────────────────────────

function bboxCenter(data: BBoxData): { x: number; y: number } {
  return { x: data.x + data.width / 2, y: data.y + data.height / 2 };
}

function pointInBBox(px: number, py: number, data: BBoxData): boolean {
  return px >= data.x && px <= data.x + data.width && py >= data.y && py <= data.y + data.height;
}

function polygonCenter(data: PolygonData): { x: number; y: number } {
  const pts = data.points;
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return { x: cx, y: cy };
}

function pointInPolygon(px: number, py: number, data: PolygonData): boolean {
  const pts = data.points;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ── Layer ─────────────────────────────────────────────

export function AnnotationsLayer() {
  const annotations = useAnnotationStore((s) => s.annotations);
  const selectAnnotation = useAnnotationStore((s) => s.selectAnnotation);
  const activeTool = useAnnotationStore((s) => s.activeTool);
  const scale = useAnnotationStore((s) => s.scale);
  const offset = useAnnotationStore((s) => s.offset);

  return (
    <Group
      onClick={(e) => {
        if (activeTool !== "select") return;

        // Get click position in image coordinates
        const stage = e.target.getStage();
        if (!stage) return;
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        const px = (pointer.x - offset.x) / scale;
        const py = (pointer.y - offset.y) / scale;

        // Find all visible annotations containing this point
        const hits: { ann: AnnotationItem; distance: number }[] = [];
        for (const ann of annotations) {
          if (!ann.visible) continue;
          if (ann.type === "bbox") {
            const data = ann.data as BBoxData;
            if (pointInBBox(px, py, data)) {
              hits.push({ ann, distance: dist({ x: px, y: py }, bboxCenter(data)) });
            }
          } else if (ann.type === "polygon") {
            const data = ann.data as PolygonData;
            if (pointInPolygon(px, py, data)) {
              hits.push({ ann, distance: dist({ x: px, y: py }, polygonCenter(data)) });
            }
          }
        }

        if (hits.length > 0) {
          e.cancelBubble = true;
          // Select the one whose center is closest to click point
          hits.sort((a, b) => a.distance - b.distance);
          selectAnnotation(hits[0].ann.id);
        }
      }}
    >
      {annotations
        .filter((a) => a.visible)
        .map((ann) => {
          switch (ann.type) {
            case "bbox":
              return <BBoxAnnotation key={ann.id} ann={ann} />;
            case "polygon":
              return <PolygonAnnotation key={ann.id} ann={ann} />;
            case "keypoints":
              return <PointAnnotation key={ann.id} ann={ann} />;
            case "mask":
              return <MaskAnnotation key={ann.id} ann={ann} />;
            default:
              return null;
          }
        })}
    </Group>
  );
}
