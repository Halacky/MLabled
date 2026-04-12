import { create } from "zustand";

// ── Types ──────────────────────────────────────────────

export type ToolType = "select" | "bbox" | "polygon" | "point" | "brush" | "sam";

export type AnnotationType = "bbox" | "polygon" | "mask" | "keypoints" | "classification";

export interface BBoxData {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PolygonData {
  points: number[][]; // [[x1,y1], [x2,y2], ...]
}

export interface PointData {
  points: { x: number; y: number; name: string }[];
}

export interface MaskData {
  strokes: { points: number[]; strokeWidth: number }[];
}

export interface AnnotationItem {
  id: string; // local id (uuid), server id stored separately
  serverId?: number;
  type: AnnotationType;
  label: string;
  data: BBoxData | PolygonData | PointData | MaskData;
  source: "manual" | "model";
  modelName?: string;
  confidence?: number;
  visible: boolean;
  selected: boolean;
}

export interface ImageItem {
  id: number;
  filename: string;
  width: number;
  height: number;
  s3_key: string;
}

// ── History entry for undo ─────────────────────────────

interface HistoryEntry {
  annotations: AnnotationItem[];
}

// ── Store ──────────────────────────────────────────────

interface AnnotationState {
  // Tool
  activeTool: ToolType;
  lastDrawingTool: ToolType;
  setActiveTool: (tool: ToolType) => void;

  // Labels
  labels: string[];
  setLabels: (labels: string[]) => void;
  activeLabel: string;
  setActiveLabel: (label: string) => void;

  // Images
  images: ImageItem[];
  setImages: (images: ImageItem[]) => void;
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  getCurrentImage: () => ImageItem | null;

  // Annotations
  annotations: AnnotationItem[];
  setAnnotations: (annotations: AnnotationItem[]) => void;
  addAnnotation: (ann: AnnotationItem) => void;
  updateAnnotation: (id: string, updates: Partial<AnnotationItem>) => void;
  removeAnnotation: (id: string) => void;
  selectAnnotation: (id: string | null) => void;
  getSelectedAnnotation: () => AnnotationItem | null;
  toggleVisibility: (id: string) => void;

  // Drawing state (for in-progress shapes)
  isDrawing: boolean;
  setIsDrawing: (v: boolean) => void;
  drawingPoints: number[][];
  setDrawingPoints: (pts: number[][]) => void;
  addDrawingPoint: (pt: number[]) => void;
  clearDrawing: () => void;

  // Canvas
  scale: number;
  setScale: (s: number) => void;
  offset: { x: number; y: number };
  setOffset: (o: { x: number; y: number }) => void;

  // Brush
  brushSize: number;
  setBrushSize: (s: number) => void;

  // History (undo)
  history: HistoryEntry[];
  pushHistory: () => void;
  undo: () => void;

  // Dirty flag
  isDirty: boolean;
  setIsDirty: (v: boolean) => void;
}

let _uuid = 0;
export function generateId(): string {
  return `ann_${Date.now()}_${++_uuid}`;
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  // Tool
  activeTool: "select",
  lastDrawingTool: "bbox",
  setActiveTool: (tool) => {
    const drawingTools: ToolType[] = ["bbox", "polygon", "point", "brush"];
    const updates: Partial<AnnotationState> = { activeTool: tool };
    if (drawingTools.includes(tool)) {
      updates.lastDrawingTool = tool;
    }
    set(updates);
  },

  // Labels
  labels: [],
  setLabels: (labels) => set({ labels }),
  activeLabel: "",
  setActiveLabel: (label) => set({ activeLabel: label }),

  // Images
  images: [],
  setImages: (images) => set({ images }),
  currentIndex: 0,
  setCurrentIndex: (index) => set({ currentIndex: index }),
  getCurrentImage: () => {
    const { images, currentIndex } = get();
    return images[currentIndex] ?? null;
  },

  // Annotations
  annotations: [],
  setAnnotations: (annotations) => set({ annotations }),
  addAnnotation: (ann) => {
    const state = get();
    state.pushHistory();
    set({ annotations: [...state.annotations, ann], isDirty: true });
  },
  updateAnnotation: (id, updates) => {
    const state = get();
    state.pushHistory();
    set({
      annotations: state.annotations.map((a) => (a.id === id ? { ...a, ...updates } : a)),
      isDirty: true,
    });
  },
  removeAnnotation: (id) => {
    const state = get();
    state.pushHistory();
    set({
      annotations: state.annotations.filter((a) => a.id !== id),
      isDirty: true,
    });
  },
  selectAnnotation: (id) =>
    set({
      annotations: get().annotations.map((a) => ({ ...a, selected: a.id === id })),
    }),
  getSelectedAnnotation: () => get().annotations.find((a) => a.selected) ?? null,
  toggleVisibility: (id) =>
    set({
      annotations: get().annotations.map((a) =>
        a.id === id ? { ...a, visible: !a.visible } : a
      ),
    }),

  // Drawing
  isDrawing: false,
  setIsDrawing: (v) => set({ isDrawing: v }),
  drawingPoints: [],
  setDrawingPoints: (pts) => set({ drawingPoints: pts }),
  addDrawingPoint: (pt) => set({ drawingPoints: [...get().drawingPoints, pt] }),
  clearDrawing: () => set({ drawingPoints: [], isDrawing: false }),

  // Canvas
  scale: 1,
  setScale: (s) => set({ scale: Math.max(0.05, Math.min(50, s)) }),
  offset: { x: 0, y: 0 },
  setOffset: (o) => set({ offset: o }),

  // Brush
  brushSize: 20,
  setBrushSize: (s) => set({ brushSize: s }),

  // History
  history: [],
  pushHistory: () => {
    const { annotations, history } = get();
    const snap = JSON.parse(JSON.stringify(annotations));
    set({ history: [...history.slice(-49), { annotations: snap }] });
  },
  undo: () => {
    const { history } = get();
    if (history.length === 0) return;
    const last = history[history.length - 1];
    set({
      annotations: last.annotations,
      history: history.slice(0, -1),
      isDirty: true,
    });
  },

  // Dirty
  isDirty: false,
  setIsDirty: (v) => set({ isDirty: v }),
}));
