import { useState } from "react";
import api from "../api/client";

interface Task {
  id: number;
  name: string;
}

interface Props {
  projectId: string;
  projectName: string;
  tasks: Task[];
  onClose: () => void;
}

export default function ExportDialog({ projectId, projectName, tasks, onClose }: Props) {
  const [format, setFormat] = useState<"yolo" | "cvat">("yolo");
  const [includeImages, setIncludeImages] = useState(false);
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);

  const toggleTask = (id: number) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    setExporting(true);
    const taskIds = scope === "selected" ? Array.from(selectedTaskIds) : null;
    const res = await api.post(
      `/export/projects/${projectId}`,
      { format, include_images: includeImages, task_ids: taskIds },
      { responseType: "blob" }
    );
    const ext = format === "yolo" || includeImages ? "zip" : "xml";
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName}_${format}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000,
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-secondary)", border: "1px solid var(--border)",
          borderRadius: 12, padding: 24, width: 480, maxHeight: "80vh", overflowY: "auto",
        }}
      >
        <h3 style={{ marginBottom: 20 }}>Export Dataset</h3>

        {/* Format */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Format</label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["yolo", "cvat"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 14, fontWeight: 600,
                  background: format === f ? "var(--accent)" : "var(--bg-tertiary)",
                  color: format === f ? "#fff" : "var(--text-secondary)",
                  border: "none", cursor: "pointer",
                }}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Include images */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
            <input
              type="checkbox"
              checked={includeImages}
              onChange={(e) => setIncludeImages(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
            />
            Include images in archive
          </label>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, marginLeft: 24 }}>
            {includeImages ? "ZIP archive with images + annotations" : "Annotations only (smaller download)"}
          </p>
        </div>

        {/* Scope */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Scope</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button
              onClick={() => setScope("all")}
              style={{
                padding: "6px 16px", borderRadius: 6, fontSize: 13,
                background: scope === "all" ? "var(--accent)" : "var(--bg-tertiary)",
                color: scope === "all" ? "#fff" : "var(--text-secondary)",
                border: "none", cursor: "pointer",
              }}
            >
              All tasks ({tasks.length})
            </button>
            <button
              onClick={() => setScope("selected")}
              style={{
                padding: "6px 16px", borderRadius: 6, fontSize: 13,
                background: scope === "selected" ? "var(--accent)" : "var(--bg-tertiary)",
                color: scope === "selected" ? "#fff" : "var(--text-secondary)",
                border: "none", cursor: "pointer",
              }}
            >
              Selected tasks
            </button>
          </div>

          {scope === "selected" && (
            <div style={{
              maxHeight: 160, overflowY: "auto", border: "1px solid var(--border)",
              borderRadius: 6, background: "var(--bg-primary)",
            }}>
              {tasks.map((t) => (
                <label
                  key={t.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                    cursor: "pointer", fontSize: 13,
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedTaskIds.has(t.id)}
                    onChange={() => toggleTask(t.id)}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  {t.name}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={{
            padding: "8px 20px", background: "var(--bg-tertiary)", color: "var(--text-primary)",
            borderRadius: 6, fontSize: 14, border: "none", cursor: "pointer",
          }}>
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || (scope === "selected" && selectedTaskIds.size === 0)}
            style={{
              padding: "8px 20px", background: "var(--accent)", color: "#fff",
              borderRadius: 6, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer",
              opacity: exporting || (scope === "selected" && selectedTaskIds.size === 0) ? 0.5 : 1,
            }}
          >
            {exporting ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, color: "var(--text-secondary)",
  marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5,
};
