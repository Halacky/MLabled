import { useAnnotationStore } from "../store/annotation";

const PALETTE = [
  "#6366f1", "#f59e0b", "#22c55e", "#ef4444", "#3b82f6",
  "#ec4899", "#14b8a6", "#f97316", "#8b5cf6", "#06b6d4",
];

function getLabelColor(label: string, labels: string[]): string {
  const idx = labels.indexOf(label);
  return idx >= 0 ? PALETTE[idx % PALETTE.length] : PALETTE[0];
}

export default function ObjectsList() {
  const { annotations, labels, selectAnnotation, removeAnnotation, toggleVisibility } =
    useAnnotationStore();

  return (
    <div style={{ padding: 12 }}>
      <h4
        style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          marginBottom: 8,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        Objects ({annotations.length})
      </h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 400, overflowY: "auto" }}>
        {annotations.map((ann) => {
          const color = getLabelColor(ann.label, labels);
          return (
            <div
              key={ann.id}
              onClick={() => selectAnnotation(ann.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 4,
                background: ann.selected ? "var(--bg-tertiary)" : "transparent",
                cursor: "pointer",
                fontSize: 13,
                borderLeft: `3px solid ${color}`,
              }}
            >
              {/* Visibility toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleVisibility(ann.id);
                }}
                style={{
                  background: "none",
                  color: ann.visible ? "var(--text-primary)" : "var(--text-secondary)",
                  fontSize: 14,
                  padding: 0,
                  width: 20,
                }}
                title={ann.visible ? "Hide" : "Show"}
              >
                {ann.visible ? "◉" : "○"}
              </button>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ color }}>{ann.label}</span>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{ann.type}</span>
                </div>
                {ann.confidence != null && (
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    {(ann.confidence * 100).toFixed(0)}%
                  </span>
                )}
                {ann.source === "model" && (
                  <span style={{ fontSize: 10, color: "var(--accent)", marginLeft: 4 }}>AI</span>
                )}
              </div>

              {/* Delete */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeAnnotation(ann.id);
                }}
                style={{
                  background: "none",
                  color: "var(--text-secondary)",
                  fontSize: 14,
                  padding: "0 2px",
                }}
                title="Delete"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      {annotations.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>No annotations yet</p>
      )}
    </div>
  );
}
