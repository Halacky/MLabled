import { useAnnotationStore, ToolType } from "../store/annotation";

const tools: { id: ToolType; label: string; shortcut: string; icon: string }[] = [
  { id: "select", label: "Select", shortcut: "V", icon: "↖" },
  { id: "bbox", label: "BBox", shortcut: "B", icon: "□" },
  { id: "polygon", label: "Polygon", shortcut: "P", icon: "◇" },
  { id: "point", label: "Points", shortcut: "K", icon: "●" },
  { id: "brush", label: "Brush", shortcut: "R", icon: "✎" },
  { id: "sam", label: "SAM", shortcut: "S", icon: "✦" },
];

export default function ToolBar() {
  const { activeTool, setActiveTool, brushSize, setBrushSize } = useAnnotationStore();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 4px",
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border)",
        width: 52,
        alignItems: "center",
      }}
    >
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => setActiveTool(tool.id)}
          title={`${tool.label} (${tool.shortcut})`}
          style={{
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            fontSize: 18,
            background: activeTool === tool.id ? "var(--accent)" : "transparent",
            color: activeTool === tool.id ? "#fff" : "var(--text-secondary)",
            border: "none",
            transition: "background 0.15s",
          }}
        >
          {tool.icon}
        </button>
      ))}

      {/* Brush size slider */}
      {activeTool === "brush" && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>{brushSize}px</span>
          <input
            type="range"
            min={2}
            max={100}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            style={{
              width: 40,
              writingMode: "vertical-lr",
              direction: "rtl",
              height: 80,
            }}
          />
        </div>
      )}
    </div>
  );
}
