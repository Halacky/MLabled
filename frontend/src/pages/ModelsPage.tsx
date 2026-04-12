import { useEffect, useState } from "react";
import api from "../api/client";

interface ModelServer {
  id: number;
  name: string;
  url: string;
  supported_tasks: string[];
  class_type: string;
  labels: string[];
  status: string;
  capabilities: Record<string, any>;
  last_health_check: string | null;
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelServer[]>([]);
  const [showRegister, setShowRegister] = useState(false);
  const [form, setForm] = useState({ name: "", url: "" });
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchModels = async () => {
    const { data } = await api.get("/models/");
    setModels(data);
  };

  useEffect(() => { fetchModels(); }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/models/register", form);
      setShowRegister(false);
      setForm({ name: "", url: "" });
      fetchModels();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Failed to register model");
    }
  };

  const statusColors: Record<string, string> = {
    online: "var(--success)",
    offline: "var(--danger)",
    loading: "var(--warning)",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2>Model Servers</h2>
        <button
          onClick={() => setShowRegister(!showRegister)}
          style={{ padding: "8px 16px", background: "var(--accent)", color: "#fff", borderRadius: 6, fontSize: 14, border: "none", cursor: "pointer" }}
        >
          + Register Model
        </button>
      </div>

      {showRegister && (
        <form
          onSubmit={handleRegister}
          style={{
            display: "flex", flexDirection: "column", gap: 12, marginBottom: 24, padding: 20,
            background: "var(--bg-secondary)", borderRadius: 8, border: "1px solid var(--border)", maxWidth: 480,
          }}
        >
          <input placeholder="Model name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="URL (e.g. http://gpu-server:8001)" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required />
          <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            The server must implement the unified model API (/health, /info, /predict).
            Model info (classes, task types) will be fetched automatically.
          </p>
          {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
          <button type="submit" style={{ padding: "8px 16px", background: "var(--accent)", color: "#fff", borderRadius: 6, border: "none", cursor: "pointer" }}>
            Register
          </button>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {models.map((m) => (
          <div
            key={m.id}
            style={{
              background: "var(--bg-secondary)", border: "1px solid var(--border)",
              borderRadius: 8, overflow: "hidden",
            }}
          >
            {/* Header row */}
            <div
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer" }}
              onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
            >
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {expandedId === m.id ? "▼" : "▶"}
              </span>

              {/* Status dot */}
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: statusColors[m.status] ?? "var(--text-secondary)",
                flexShrink: 0,
              }} />

              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{m.name}</span>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{m.status}</span>
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                  {m.supported_tasks.map((t) => (
                    <span key={t} style={{ fontSize: 10, padding: "1px 6px", background: "var(--bg-tertiary)", borderRadius: 3, color: "var(--accent)" }}>
                      {t}
                    </span>
                  ))}
                  <span style={{
                    fontSize: 10, padding: "1px 6px", borderRadius: 3,
                    background: m.class_type === "fixed" ? "#22c55e15" : "#6366f115",
                    color: m.class_type === "fixed" ? "#22c55e" : "#6366f1",
                  }}>
                    {m.class_type === "fixed" ? `${m.labels.length} classes` : "open vocabulary"}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, fontSize: 13 }} onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={async () => { await api.post(`/models/${m.id}/health`); fetchModels(); }}
                  style={{ padding: "4px 10px", background: "var(--bg-tertiary)", color: "var(--text-primary)", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 12 }}
                >
                  Check
                </button>
                <button
                  onClick={async () => { await api.delete(`/models/${m.id}`); fetchModels(); }}
                  style={{ padding: "4px 10px", background: "var(--danger)", color: "#fff", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 12 }}
                >
                  Remove
                </button>
              </div>
            </div>

            {/* Expanded details */}
            {expandedId === m.id && (
              <div style={{ borderTop: "1px solid var(--border)", padding: 16, background: "var(--bg-primary)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "6px 12px", fontSize: 13 }}>
                  <span style={{ color: "var(--text-secondary)" }}>URL</span>
                  <span style={{ fontFamily: "monospace", fontSize: 12 }}>{m.url}</span>

                  <span style={{ color: "var(--text-secondary)" }}>Tasks</span>
                  <span>{m.supported_tasks.join(", ") || "—"}</span>

                  <span style={{ color: "var(--text-secondary)" }}>Class type</span>
                  <span>{m.class_type === "fixed" ? "Fixed (known classes)" : "Open (any class via prompt)"}</span>

                  {m.class_type === "fixed" && m.labels.length > 0 && (
                    <>
                      <span style={{ color: "var(--text-secondary)" }}>Classes</span>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {m.labels.slice(0, 30).map((l) => (
                          <span key={l} style={{ fontSize: 11, padding: "1px 6px", background: "var(--bg-tertiary)", borderRadius: 3, color: "var(--text-secondary)" }}>
                            {l}
                          </span>
                        ))}
                        {m.labels.length > 30 && (
                          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                            +{m.labels.length - 30} more
                          </span>
                        )}
                      </div>
                    </>
                  )}

                  <span style={{ color: "var(--text-secondary)" }}>Last check</span>
                  <span>{m.last_health_check ? new Date(m.last_health_check).toLocaleString() : "never"}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {models.length === 0 && !showRegister && (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>
          <p style={{ fontSize: 16, marginBottom: 8 }}>No models registered</p>
          <p style={{ fontSize: 13, marginBottom: 16 }}>Register a model server to enable AI-assisted annotation</p>
          <button onClick={() => setShowRegister(true)} style={{ padding: "8px 16px", background: "var(--accent)", color: "#fff", borderRadius: 6, border: "none", cursor: "pointer" }}>
            + Register Model
          </button>
        </div>
      )}
    </div>
  );
}
