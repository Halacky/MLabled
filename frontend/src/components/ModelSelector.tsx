import { useEffect, useState, useCallback } from "react";
import api from "../api/client";

export interface ModelServer {
  id: number;
  name: string;
  supported_tasks: string[];
  class_type: string;
  labels: string[];
  status: string;
  capabilities: Record<string, any>;
}

export type InferenceMode = "off" | "manual" | "semi-auto";

interface Props {
  selectedModelId: number | null;
  mode: InferenceMode;
  onSelect: (model: ModelServer | null) => void;
  onModeChange: (mode: InferenceMode) => void;
  onRun: (modelId: number, params: Record<string, any>) => void;
  /** Called so parent can read current params for semi-auto runs */
  onParamsRef?: (getParams: () => Record<string, any> | null) => void;
  running: boolean;
}

export default function ModelSelector({ selectedModelId, mode, onSelect, onModeChange, onRun, onParamsRef, running }: Props) {
  const [models, setModels] = useState<ModelServer[]>([]);
  const [confThreshold, setConfThreshold] = useState(0.25);
  const [prompt, setPrompt] = useState("");
  const [enabledClasses, setEnabledClasses] = useState<Set<string>>(new Set());
  const [classSearch, setClassSearch] = useState("");
  const [showClassList, setShowClassList] = useState(false);

  useEffect(() => {
    api.get("/models/").then(({ data }) => setModels(data));
  }, []);

  const selected = models.find((m) => m.id === selectedModelId) ?? null;
  const isFixed = selected?.class_type === "fixed";
  const isOpen = selected?.class_type === "open";

  useEffect(() => {
    if (selected && isFixed) {
      setEnabledClasses(new Set(selected.labels));
    }
  }, [selected?.id]);

  const filteredLabels = selected?.labels.filter((l) =>
    l.toLowerCase().includes(classSearch.toLowerCase())
  ) ?? [];

  const toggleClass = (cls: string) => {
    setEnabledClasses((prev) => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls); else next.add(cls);
      return next;
    });
  };

  const selectAllClasses = () => setEnabledClasses(new Set(selected?.labels ?? []));
  const deselectAllClasses = () => setEnabledClasses(new Set());

  const getParams = useCallback((): Record<string, any> | null => {
    if (!selected) return null;
    const params: Record<string, any> = { conf: confThreshold };
    if (isFixed && enabledClasses.size < (selected.labels.length)) {
      params.classes = Array.from(enabledClasses);
    }
    if (isOpen && prompt.trim()) {
      params.prompt = prompt.trim();
    }
    return params;
  }, [selected, confThreshold, enabledClasses, isFixed, isOpen, prompt]);

  // Expose getParams to parent
  useEffect(() => {
    onParamsRef?.(() => getParams());
  }, [getParams, onParamsRef]);

  const handleRun = () => {
    if (!selected) return;
    const params = getParams();
    if (params) onRun(selected.id, params);
  };

  const modes: { value: InferenceMode; label: string; hint: string }[] = [
    { value: "off", label: "Off", hint: "No AI assist" },
    { value: "manual", label: "Manual", hint: "Run on button click" },
    { value: "semi-auto", label: "Semi-auto", hint: "Auto-run on empty images" },
  ];

  return (
    <div style={{ padding: 12 }}>
      <h4 style={sectionTitle}>AI Model</h4>

      <select
        value={selectedModelId ?? ""}
        onChange={(e) => {
          const id = e.target.value ? Number(e.target.value) : null;
          const m = models.find((m) => m.id === id) ?? null;
          onSelect(m);
          if (!m) onModeChange("off");
          else if (mode === "off") onModeChange("manual");
        }}
        style={{ width: "100%", marginBottom: 8, fontSize: 13, padding: "6px 8px" }}
      >
        <option value="">— None —</option>
        {models.map((m) => (
          <option key={m.id} value={m.id} disabled={m.status !== "online"}>
            {m.name} {m.status !== "online" ? `[${m.status}]` : ""}
          </option>
        ))}
      </select>

      {selected && (
        <>
          {/* Mode selector */}
          <div style={{ display: "flex", gap: 2, marginBottom: 10, background: "var(--bg-tertiary)", borderRadius: 6, padding: 2 }}>
            {modes.map((m) => (
              <button
                key={m.value}
                onClick={() => onModeChange(m.value)}
                title={m.hint}
                style={{
                  flex: 1, padding: "4px 0", borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: mode === m.value ? "var(--accent)" : "transparent",
                  color: mode === m.value ? "#fff" : "var(--text-secondary)",
                  border: "none", cursor: "pointer",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode !== "off" && (
            <>
              {/* Info badges */}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
                {selected.supported_tasks.map((t) => (
                  <span key={t} style={badge}>{t}</span>
                ))}
                <span style={{ ...badge, background: isFixed ? "#22c55e20" : "#6366f120", color: isFixed ? "#22c55e" : "#6366f1" }}>
                  {isFixed ? "fixed classes" : "open vocabulary"}
                </span>
              </div>

              {/* Confidence */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", marginBottom: 2 }}>
                  <span>Confidence</span>
                  <span>{confThreshold.toFixed(2)}</span>
                </div>
                <input
                  type="range" min={0.05} max={0.95} step={0.05}
                  value={confThreshold}
                  onChange={(e) => setConfThreshold(Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>

              {/* Fixed-class filter */}
              {isFixed && selected.labels.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <button
                      onClick={() => setShowClassList(!showClassList)}
                      style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer", padding: 0 }}
                    >
                      {showClassList ? "▼" : "▶"} Classes ({enabledClasses.size}/{selected.labels.length})
                    </button>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={selectAllClasses} style={tinyBtn}>All</button>
                      <button onClick={deselectAllClasses} style={tinyBtn}>None</button>
                    </div>
                  </div>

                  {showClassList && (
                    <div style={{ border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-primary)" }}>
                      <input
                        placeholder="Search classes..."
                        value={classSearch}
                        onChange={(e) => setClassSearch(e.target.value)}
                        style={{ width: "100%", border: "none", borderBottom: "1px solid var(--border)", borderRadius: "6px 6px 0 0", fontSize: 12, padding: "6px 8px" }}
                      />
                      <div style={{ maxHeight: 160, overflowY: "auto" }}>
                        {filteredLabels.map((cls) => (
                          <label key={cls} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 8px", fontSize: 12, cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={enabledClasses.has(cls)}
                              onChange={() => toggleClass(cls)}
                              style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
                            />
                            {cls}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Open-class prompt */}
              {isOpen && (
                <div style={{ marginBottom: 10 }}>
                  <textarea
                    placeholder="Describe what to detect/classify..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={3}
                    style={{ width: "100%", fontSize: 12, resize: "vertical" }}
                  />
                </div>
              )}

              {/* Run button (manual mode or manual trigger in semi-auto) */}
              <button
                onClick={handleRun}
                disabled={running || (isFixed && enabledClasses.size === 0)}
                style={{
                  width: "100%", padding: "8px 0", borderRadius: 6, fontSize: 13, fontWeight: 600,
                  background: running ? "var(--bg-tertiary)" : "var(--accent)",
                  color: running ? "var(--text-secondary)" : "#fff",
                  border: "none", cursor: "pointer",
                  opacity: (isFixed && enabledClasses.size === 0) ? 0.5 : 1,
                }}
              >
                {running ? "Running..." : mode === "semi-auto" ? "Run Now (or auto on next empty)" : "Run Model"}
              </button>

              {mode === "semi-auto" && (
                <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, textAlign: "center" }}>
                  Auto-runs when navigating to unannnotated images
                </p>
              )}
            </>
          )}
        </>
      )}

      {models.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          No models registered. Go to Models page to add one.
        </p>
      )}
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  fontSize: 12, color: "var(--text-secondary)", marginBottom: 8,
  textTransform: "uppercase", letterSpacing: 1,
};

const badge: React.CSSProperties = {
  fontSize: 10, padding: "2px 6px", borderRadius: 3,
  background: "var(--bg-tertiary)", color: "var(--text-secondary)",
};

const tinyBtn: React.CSSProperties = {
  background: "none", border: "none", color: "var(--accent)",
  fontSize: 11, cursor: "pointer", padding: 0,
};
