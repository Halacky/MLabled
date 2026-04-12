import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/client";
import { imageUrl as buildImageUrl } from "../api/imageUrl";
import { useAnnotationStore, generateId, AnnotationItem } from "../store/annotation";
import AnnotationCanvas from "../components/canvas/AnnotationCanvas";
import ToolBar from "../components/ToolBar";
import LabelSelector from "../components/LabelSelector";
import ObjectsList from "../components/ObjectsList";
import ModelSelector from "../components/ModelSelector";
import { useInteractiveSAM } from "../hooks/useInteractiveSAM";

interface TaskInfo {
  id: number;
  name: string;
  project_id: number;
}

interface ProjectInfo {
  id: number;
  name: string;
  task_type: string;
  labels: string[];
}

export default function AnnotationPage() {
  const { taskId } = useParams();
  const [task, setTask] = useState<TaskInfo | null>(null);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
  const [inferenceRunning, setInferenceRunning] = useState(false);
  const [inferenceMode, setInferenceMode] = useState<"off" | "manual" | "semi-auto">("off");
  const modelParamsRef = useRef<(() => Record<string, any> | null) | null>(null);
  // Track which images have annotations (for arrow key navigation)
  const [annotatedImageIds, setAnnotatedImageIds] = useState<Set<number>>(new Set());

  const sam = useInteractiveSAM();

  const {
    images,
    setImages,
    currentIndex,
    setCurrentIndex,
    getCurrentImage,
    setLabels,
    setActiveLabel,
    annotations,
    setAnnotations,
    isDirty,
    setIsDirty,
    undo,
    activeTool,
    setActiveTool,
    scale,
    setScale,
  } = useAnnotationStore();

  // Fetch task, project, images
  useEffect(() => {
    const load = async () => {
      const taskRes = await api.get(`/tasks/${taskId}`);
      setTask(taskRes.data);

      const projRes = await api.get(`/projects/${taskRes.data.project_id}`);
      setProject(projRes.data);
      setLabels(projRes.data.labels);
      if (projRes.data.labels.length > 0) {
        setActiveLabel(projRes.data.labels[0]);
      }

      const imgsRes = await api.get(`/tasks/${taskId}/images`);
      setImages(imgsRes.data);

      // Load which images have annotations (for arrow-key navigation)
      const annotated = new Set<number>();
      await Promise.all(
        imgsRes.data.map(async (img: any) => {
          const { data: anns } = await api.get(`/annotations/image/${img.id}`);
          if (anns.length > 0) annotated.add(img.id);
        })
      );
      setAnnotatedImageIds(annotated);
    };
    load();
  }, [taskId]);

  // Fetch annotations for current image
  const currentImage = getCurrentImage();

  useEffect(() => {
    if (!currentImage) {
      setAnnotations([]);
      return;
    }
    const loadAnnotations = async () => {
      const { data } = await api.get(`/annotations/image/${currentImage.id}`);
      const mapped: AnnotationItem[] = data.map((a: any) => ({
        id: generateId(),
        serverId: a.id,
        type: a.type,
        label: a.label,
        data: a.data,
        source: a.source,
        modelName: a.model_name,
        confidence: a.confidence,
        visible: true,
        selected: false,
      }));
      setAnnotations(mapped);
      setIsDirty(false);

      // Semi-auto: run model if image has no annotations
      if (mapped.length === 0 && inferenceMode === "semi-auto" && selectedModelId && modelParamsRef.current) {
        const params = modelParamsRef.current();
        if (params) {
          handleRunModel(selectedModelId, params);
        }
      }
    };
    loadAnnotations();
  }, [currentImage?.id]);

  // Save annotations
  const handleSave = useCallback(async () => {
    if (!currentImage) return;
    setSaving(true);

    // Delete existing server-side annotations for this image
    const existing = await api.get(`/annotations/image/${currentImage.id}`);
    for (const ann of existing.data) {
      await api.delete(`/annotations/${ann.id}`);
    }

    // Create all current annotations
    if (annotations.length > 0) {
      await api.post(
        `/annotations/image/${currentImage.id}/batch`,
        annotations.map((a) => ({
          label: a.label,
          type: a.type,
          data: a.data,
          source: a.source,
          model_name: a.modelName ?? null,
          confidence: a.confidence ?? null,
        }))
      );
    }

    // Update annotated cache
    setAnnotatedImageIds((prev) => {
      const next = new Set(prev);
      if (annotations.length > 0) next.add(currentImage.id);
      else next.delete(currentImage.id);
      return next;
    });

    setIsDirty(false);
    setSaving(false);
  }, [currentImage, annotations]);

  // Navigate images with save prompt
  const navigateTo = useCallback(
    async (index: number) => {
      if (isDirty) {
        await handleSave();
      }
      setCurrentIndex(index);
    },
    [isDirty, handleSave]
  );

  // Upload images
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));
    await api.post(`/tasks/${taskId}/images`, formData);
    const imgsRes = await api.get(`/tasks/${taskId}/images`);
    setImages(imgsRes.data);
    setUploading(false);
  };

  // Run model inference
  const handleRunModel = useCallback(
    async (modelId: number, params: Record<string, any>) => {
      if (!currentImage) {
        alert("No image selected");
        return;
      }
      setInferenceRunning(true);
      try {
        const { data } = await api.post("/inference/predict", {
          model_id: modelId,
          image_id: currentImage.id,
          params,
        });
        const preds: AnnotationItem[] = (data.annotations || []).map((p: any) => ({
          id: generateId(),
          type: p.type,
          label: p.label,
          data: p.data,
          source: "model" as const,
          modelName: "model",
          confidence: p.confidence,
          visible: true,
          selected: false,
        }));
        if (preds.length > 0) {
          const store = useAnnotationStore.getState();
          store.pushHistory();
          store.setAnnotations([...store.annotations, ...preds]);
          store.setIsDirty(true);
        } else {
          alert("Model returned 0 predictions for this image");
        }
      } catch (err: any) {
        alert(err.response?.data?.detail ?? "Inference failed: " + String(err));
      }
      setInferenceRunning(false);
    },
    [currentImage]
  );

  // Connect SAM when tool activated + image + model available
  useEffect(() => {
    if (activeTool === "sam" && currentImage && selectedModelId) {
      sam.connect(currentImage.id, selectedModelId);
    } else {
      sam.disconnect();
    }
    return () => sam.disconnect();
  }, [activeTool, currentImage?.id, selectedModelId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key;
      const lower = key.toLowerCase();

      // ── Ctrl combos ──
      if (ctrl) {
        switch (lower) {
          case "s": e.preventDefault(); handleSave(); return;
          case "z": e.preventDefault(); undo(); return;
        }
        return;
      }

      // Read fresh state directly from store to avoid stale closures
      const store = useAnnotationStore.getState();
      const currentTool = store.activeTool;
      const drawingTools = ["bbox", "polygon", "point", "brush"];

      switch (key) {
        // ── CVAT tool hotkeys ──
        case "v": case "V": setActiveTool("select"); break;
        case "n": case "N": {
          if (drawingTools.includes(currentTool)) {
            setActiveTool("select");
          } else {
            setActiveTool(store.lastDrawingTool);
          }
          break;
        }
        case "b": case "B": setActiveTool("bbox"); break;
        case "p": case "P": setActiveTool("polygon"); break;
        case "k": case "K": setActiveTool("point"); break;
        case "r": case "R": setActiveTool("brush"); break;
        case "s": case "S": setActiveTool("sam"); break;

        // ── Navigation: F = next, D = prev ──
        case "f": case "F":
          if (currentIndex < images.length - 1) navigateTo(currentIndex + 1);
          break;
        case "d": case "D": case "a": case "A":
          if (currentIndex > 0) navigateTo(currentIndex - 1);
          break;

        // ── Arrows: next/prev ANNOTATED image ──
        case "ArrowRight": {
          for (let i = currentIndex + 1; i < images.length; i++) {
            if (annotatedImageIds.has(images[i].id)) {
              navigateTo(i);
              break;
            }
          }
          break;
        }
        case "ArrowLeft": {
          for (let i = currentIndex - 1; i >= 0; i--) {
            if (annotatedImageIds.has(images[i].id)) {
              navigateTo(i);
              break;
            }
          }
          break;
        }

        // ── Canvas ──
        case "+": case "=": setScale(store.scale * 1.2); break;
        case "-": setScale(store.scale / 1.2); break;

        // ── Annotation actions ──
        case "Delete": case "Backspace": {
          const sel = annotations.find((ann) => ann.selected);
          if (sel) useAnnotationStore.getState().removeAnnotation(sel.id);
          break;
        }
        case "Escape":
          useAnnotationStore.getState().selectAnnotation(null);
          if (activeTool === "sam") sam.reset();
          break;
        case "Enter":
          if (activeTool === "sam" && sam.maskRle) sam.acceptMask();
          break;

        // ── Visibility toggle (H like CVAT) ──
        case "h": case "H": {
          const sel = annotations.find((ann) => ann.selected);
          if (sel) useAnnotationStore.getState().toggleVisibility(sel.id);
          break;
        }

        // ── Copy label from last annotation (CVAT-like) ──
        case "c": case "C": {
          if (annotations.length > 0) {
            const lastLabel = annotations[annotations.length - 1].label;
            setActiveLabel(lastLabel);
          }
          break;
        }
      }

      // Number keys 1-9 for labels
      const num = parseInt(key);
      if (!isNaN(num) && num >= 1 && num <= 9) {
        const lbls = useAnnotationStore.getState().labels;
        if (num <= lbls.length) {
          setActiveLabel(lbls[num - 1]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, images, handleSave, undo, annotations, navigateTo, activeTool, scale, sam.maskRle, annotatedImageIds]);

  const imgUrl = currentImage ? buildImageUrl(currentImage.id) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 48px)", margin: -24 }}>
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-secondary)",
          height: 42,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            to={task ? `/projects/${task.project_id}/tasks` : "/projects"}
            style={{ fontSize: 13, color: "var(--text-secondary)" }}
          >
            &larr; Back
          </Link>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{task?.name ?? "..."}</span>
          <span style={{ fontSize: 12, color: "var(--accent)" }}>{project?.task_type}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label
            style={{
              padding: "4px 12px",
              background: "var(--bg-tertiary)",
              borderRadius: 4,
              fontSize: 12,
              cursor: "pointer",
              color: "var(--text-secondary)",
            }}
          >
            {uploading ? "Uploading..." : "Upload"}
            <input type="file" multiple accept="image/*" onChange={handleUpload} style={{ display: "none" }} />
          </label>

          {/* Image navigation */}
          <button
            onClick={() => navigateTo(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
            style={{
              padding: "4px 8px",
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              borderRadius: 4,
              fontSize: 13,
              opacity: currentIndex === 0 ? 0.4 : 1,
            }}
          >
            ◀
          </button>
          <span style={{ fontSize: 13, color: "var(--text-secondary)", minWidth: 60, textAlign: "center" }}>
            {images.length > 0 ? `${currentIndex + 1} / ${images.length}` : "—"}
          </span>
          <button
            onClick={() => navigateTo(Math.min(images.length - 1, currentIndex + 1))}
            disabled={currentIndex >= images.length - 1}
            style={{
              padding: "4px 8px",
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              borderRadius: 4,
              fontSize: 13,
              opacity: currentIndex >= images.length - 1 ? 0.4 : 1,
            }}
          >
            ▶
          </button>

          {/* Zoom */}
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale(1)}
            style={{
              padding: "4px 8px",
              background: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
              borderRadius: 4,
              fontSize: 11,
            }}
          >
            Fit
          </button>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "4px 16px",
              background: isDirty ? "var(--accent)" : "var(--bg-tertiary)",
              color: isDirty ? "#fff" : "var(--text-secondary)",
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {saving ? "Saving..." : isDirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>

      {/* Main area */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left: Toolbar */}
        <ToolBar />

        {/* Center: Canvas */}
        <AnnotationCanvas
          imageUrl={imgUrl}
          imageWidth={currentImage?.width ?? 0}
          imageHeight={currentImage?.height ?? 0}
          sam={activeTool === "sam" ? {
            points: sam.points,
            connected: sam.connected,
            loading: sam.loading,
            onLeftClick: (x, y) => sam.sendClick(x, y, true),
            onRightClick: (x, y) => sam.sendClick(x, y, false),
          } : undefined}
        />

        {/* Right: Sidebar */}
        <div
          style={{
            width: 220,
            flexShrink: 0,
            background: "var(--bg-secondary)",
            borderLeft: "1px solid var(--border)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <LabelSelector />
          <div style={{ borderTop: "1px solid var(--border)" }} />
          <ModelSelector
            selectedModelId={selectedModelId}
            mode={inferenceMode}
            onSelect={(m) => setSelectedModelId(m?.id ?? null)}
            onModeChange={setInferenceMode}
            onRun={handleRunModel}
            onParamsRef={(fn) => { modelParamsRef.current = fn; }}
            running={inferenceRunning}
          />
          <div style={{ borderTop: "1px solid var(--border)" }} />
          <ObjectsList />
        </div>
      </div>
    </div>
  );
}
