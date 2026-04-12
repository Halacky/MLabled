import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

interface Project {
  id: number;
  name: string;
  description: string | null;
  task_type: string;
  labels: string[];
  created_at: string;
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", task_type: "detection", labels: "" });

  const fetchProjects = async () => {
    const { data } = await api.get("/projects/");
    setProjects(data);
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post("/projects/", {
      ...form,
      labels: form.labels.split(",").map((l) => l.trim()).filter(Boolean),
    });
    setShowCreate(false);
    setForm({ name: "", description: "", task_type: "detection", labels: "" });
    fetchProjects();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2>Projects</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            padding: "8px 16px",
            background: "var(--accent)",
            color: "#fff",
            borderRadius: 6,
            fontSize: 14,
          }}
        >
          + New Project
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginBottom: 24,
            padding: 20,
            background: "var(--bg-secondary)",
            borderRadius: 8,
            border: "1px solid var(--border)",
            maxWidth: 480,
          }}
        >
          <input placeholder="Project name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <select value={form.task_type} onChange={(e) => setForm({ ...form, task_type: e.target.value })}>
            <option value="detection">Detection</option>
            <option value="segmentation">Segmentation</option>
            <option value="classification">Classification</option>
            <option value="keypoints">Keypoints</option>
          </select>
          <input placeholder="Labels (comma separated)" value={form.labels} onChange={(e) => setForm({ ...form, labels: e.target.value })} required />
          <button type="submit" style={{ padding: "8px 16px", background: "var(--accent)", color: "#fff", borderRadius: 6 }}>
            Create
          </button>
        </form>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {projects.map((p) => (
          <div
            key={p.id}
            onClick={() => navigate(`/projects/${p.id}/tasks`)}
            style={{
              position: "relative",
              padding: 20,
              background: "var(--bg-secondary)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              cursor: "pointer",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            <h3 style={{ marginBottom: 8 }}>{p.name}</h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>{p.description}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ padding: "2px 8px", background: "var(--bg-tertiary)", borderRadius: 4, fontSize: 12, color: "var(--accent)" }}>
                {p.task_type}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{p.labels.length} labels</span>
            </div>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (!confirm(`Delete project "${p.name}" and all its tasks, images, and annotations?`)) return;
                await api.delete(`/projects/${p.id}`);
                fetchProjects();
              }}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                background: "none",
                border: "none",
                color: "var(--text-secondary)",
                fontSize: 16,
                cursor: "pointer",
                padding: "4px 8px",
                borderRadius: 4,
                zIndex: 1,
              }}
              title="Delete project"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
