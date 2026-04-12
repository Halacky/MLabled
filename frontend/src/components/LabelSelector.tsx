import { useAnnotationStore } from "../store/annotation";

const PALETTE = [
  "#6366f1", "#f59e0b", "#22c55e", "#ef4444", "#3b82f6",
  "#ec4899", "#14b8a6", "#f97316", "#8b5cf6", "#06b6d4",
];

export default function LabelSelector() {
  const { labels, activeLabel, setActiveLabel } = useAnnotationStore();

  return (
    <div style={{ padding: 12 }}>
      <h4 style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
        Labels
      </h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {labels.map((label, i) => (
          <button
            key={label}
            onClick={() => setActiveLabel(label)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 6,
              background: activeLabel === label ? "var(--bg-tertiary)" : "transparent",
              color: activeLabel === label ? "var(--text-primary)" : "var(--text-secondary)",
              border: activeLabel === label ? `1px solid ${PALETTE[i % PALETTE.length]}` : "1px solid transparent",
              fontSize: 13,
              textAlign: "left",
              width: "100%",
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: PALETTE[i % PALETTE.length],
                flexShrink: 0,
              }}
            />
            {label}
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-secondary)" }}>
              {i + 1}
            </span>
          </button>
        ))}
      </div>
      {labels.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          No labels configured
        </p>
      )}
    </div>
  );
}
