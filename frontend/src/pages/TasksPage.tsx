import { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api from "../api/client";
import { imageUrl } from "../api/imageUrl";
import ExportDialog from "../components/ExportDialog";

interface Task {
  id: number;
  name: string;
  status: string;
  assignee_id: number | null;
  reviewer_id: number | null;
  created_at: string;
}

interface Project {
  id: number;
  name: string;
  task_type: string;
  labels: string[];
}

interface TaskStats {
  image_count: number;
  annotation_count: number;
  first_image_id: number | null;
  s3_bucket: string | null;
  s3_path: string | null;
}

export default function TasksPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Record<number, TaskStats>>({});

  // ── Create task form ──
  const [showCreate, setShowCreate] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [imageQuality, setImageQuality] = useState(100);
  const [s3Bucket, setS3Bucket] = useState("mlabled");
  const [s3Prefix, setS3Prefix] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showExport, setShowExport] = useState(false);

  const fetchData = async () => {
    const [projRes, tasksRes] = await Promise.all([
      api.get(`/projects/${projectId}`),
      api.get(`/projects/${projectId}/tasks`),
    ]);
    setProject(projRes.data);
    setTasks(tasksRes.data);

    // Fetch stats for all tasks
    const statsMap: Record<number, TaskStats> = {};
    await Promise.all(
      tasksRes.data.map(async (t: Task) => {
        const { data } = await api.get(`/tasks/${t.id}/stats`);
        statsMap[t.id] = data;
      })
    );
    setStats(statsMap);
  };

  useEffect(() => {
    fetchData();
  }, [projectId]);

  // ── Create task with images ──
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim()) return;
    setCreating(true);

    // 1. Create task
    setUploadProgress("Creating task...");
    const { data: task } = await api.post(`/projects/${projectId}/tasks`, { name: newTaskName });

    // 2. Upload images if selected
    if (selectedFiles.length > 0) {
      setUploadProgress(`Uploading ${selectedFiles.length} images...`);
      const formData = new FormData();
      selectedFiles.forEach((f) => formData.append("files", f));
      const params = new URLSearchParams();
      params.set("quality", String(imageQuality));
      if (s3Bucket.trim() && s3Bucket.trim() !== "mlabled") params.set("s3_bucket", s3Bucket.trim());
      if (s3Prefix.trim()) params.set("s3_prefix", s3Prefix.trim());
      await api.post(`/tasks/${task.id}/images?${params}`, formData);
    }

    // 3. Set status to in_progress if images were uploaded
    if (selectedFiles.length > 0) {
      await api.patch(`/tasks/${task.id}`, { status: "in_progress" });
    }

    setCreating(false);
    setUploadProgress("");
    setNewTaskName("");
    setSelectedFiles([]);
    setImageQuality(100);
    setS3Bucket("mlabled");
    setS3Prefix("");
    setShowAdvanced(false);
    setShowCreate(false);
    fetchData();
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!confirm("Delete this task and all its images/annotations?")) return;
    await api.delete(`/tasks/${taskId}`);
    fetchData();
  };

  const statusColors: Record<string, string> = {
    pending: "#71717a",
    in_progress: "#f59e0b",
    review: "#6366f1",
    accepted: "#22c55e",
    rejected: "#ef4444",
  };

  const totalImages = Object.values(stats).reduce((sum, s) => sum + s.image_count, 0);
  const totalAnnotations = Object.values(stats).reduce((sum, s) => sum + s.annotation_count, 0);

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Link to="/projects" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Projects
        </Link>
        <span style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 8px" }}>/</span>
        <span style={{ fontSize: 13 }}>{project?.name ?? "..."}</span>
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h2 style={{ marginBottom: 6 }}>{project?.name}</h2>
          <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--text-secondary)" }}>
            <span style={{ background: "var(--bg-tertiary)", padding: "2px 8px", borderRadius: 4, color: "var(--accent)" }}>
              {project?.task_type}
            </span>
            <span>{tasks.length} tasks</span>
            <span>{totalImages} images</span>
            <span>{totalAnnotations} annotations</span>
          </div>
          {project?.labels && project.labels.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {project.labels.map((l) => (
                <span key={l} style={{ fontSize: 11, padding: "1px 8px", background: "var(--bg-tertiary)", borderRadius: 3, color: "var(--text-secondary)" }}>
                  {l}
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowExport(true)} style={btnSecondary}>Export</button>
          <button onClick={() => setShowCreate(true)} style={btnPrimary}>+ Create Task</button>
        </div>
      </div>

      {/* Export dialog */}
      {showExport && projectId && (
        <ExportDialog
          projectId={projectId}
          projectName={project?.name ?? "project"}
          tasks={tasks}
          onClose={() => setShowExport(false)}
        />
      )}

      {/* Create task modal/form */}
      {showCreate && (
        <div style={{
          background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 8,
          padding: 24, marginBottom: 24, maxWidth: 560,
        }}>
          <h3 style={{ marginBottom: 16 }}>Create Task</h3>
          <form onSubmit={handleCreate}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Task name</label>
              <input
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                placeholder="e.g. Batch 1, Street scenes, ..."
                required
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Images</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--accent)"; }}
                onDragLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = "var(--border)";
                  const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
                  setSelectedFiles((prev) => [...prev, ...files]);
                }}
                style={{
                  border: "2px dashed var(--border)", borderRadius: 8, padding: 24,
                  textAlign: "center", cursor: "pointer", background: "var(--bg-primary)",
                  transition: "border-color 0.2s",
                }}
              >
                <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 4 }}>
                  Drag & drop images here or click to browse
                </p>
                <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                  Supports JPG, PNG, BMP, WebP
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    if (e.target.files) {
                      setSelectedFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                    }
                  }}
                />
              </div>

              {selectedFiles.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      {selectedFiles.length} files selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedFiles([])}
                      style={{ background: "none", color: "var(--danger)", fontSize: 12, padding: 0 }}
                    >
                      Clear all
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxHeight: 100, overflowY: "auto" }}>
                    {selectedFiles.slice(0, 20).map((f, i) => (
                      <span key={i} style={{ fontSize: 11, color: "var(--text-secondary)", background: "var(--bg-tertiary)", padding: "2px 6px", borderRadius: 3 }}>
                        {f.name}
                      </span>
                    ))}
                    {selectedFiles.length > 20 && (
                      <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        +{selectedFiles.length - 20} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Advanced settings */}
            <div style={{ marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer", padding: 0 }}
              >
                {showAdvanced ? "▼" : "▶"} Advanced settings
              </button>

              {showAdvanced && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12, padding: 12, background: "var(--bg-primary)", borderRadius: 6 }}>
                  {/* Image quality */}
                  <div>
                    <label style={labelStyle}>Image quality: {imageQuality}%</label>
                    <input
                      type="range" min={10} max={100} step={5}
                      value={imageQuality}
                      onChange={(e) => setImageQuality(Number(e.target.value))}
                      style={{ width: "100%" }}
                    />
                    <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      {imageQuality === 100 ? "Original quality (no re-encoding)" : `JPEG re-encode at ${imageQuality}% — smaller file size`}
                    </p>
                  </div>

                  {/* S3 bucket */}
                  <div>
                    <label style={labelStyle}>MinIO bucket</label>
                    <input
                      value={s3Bucket}
                      onChange={(e) => setS3Bucket(e.target.value)}
                      placeholder="mlabled"
                      style={{ width: "100%", fontSize: 13 }}
                    />
                    <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      Bucket will be auto-created if it doesn't exist
                    </p>
                  </div>

                  {/* S3 path */}
                  <div>
                    <label style={labelStyle}>Path inside bucket</label>
                    <input
                      value={s3Prefix}
                      onChange={(e) => setS3Prefix(e.target.value)}
                      placeholder={`projects/${project?.name ?? "..."}/${newTaskName || "task_name"}`}
                      style={{ width: "100%", fontSize: 13 }}
                    />
                    <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      Leave empty for default path. Browse files in{" "}
                      <a href={`http://${window.location.hostname}:9003/browser/${s3Bucket || "mlabled"}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                        MinIO Console
                      </a>
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => { setShowCreate(false); setSelectedFiles([]); setNewTaskName(""); setShowAdvanced(false); }} style={btnSecondary}>
                Cancel
              </button>
              <button type="submit" disabled={creating} style={btnPrimary}>
                {creating ? uploadProgress : selectedFiles.length > 0 ? `Create & Upload ${selectedFiles.length} images` : "Create Task"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Task list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tasks.map((t) => {
          const s = stats[t.id];
          const imgCount = s?.image_count ?? 0;
          const annCount = s?.annotation_count ?? 0;
          const progress = imgCount > 0 && annCount > 0 ? Math.min(100, Math.round((annCount / imgCount) * 100)) : 0;

          return (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "12px 16px",
              }}
            >
              {/* Thumbnail */}
              <div style={{
                width: 64, height: 48, borderRadius: 4, overflow: "hidden",
                background: "var(--bg-tertiary)", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {s?.first_image_id ? (
                  <img
                    src={imageUrl(s.first_image_id)}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    loading="lazy"
                  />
                ) : (
                  <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>No img</span>
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</span>
                  <span style={{
                    fontSize: 11, padding: "1px 8px", borderRadius: 3,
                    background: statusColors[t.status] + "20",
                    color: statusColors[t.status],
                  }}>
                    {t.status.replace("_", " ")}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "var(--text-secondary)" }}>
                  <span>{imgCount} images</span>
                  <span>{annCount} annotations</span>
                  {imgCount > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 60, height: 4, background: "var(--bg-tertiary)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${progress}%`, height: "100%", background: "var(--accent)", borderRadius: 2 }} />
                      </div>
                      <span>{progress}%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {imgCount === 0 ? (
                  <label style={{ ...btnSecondary, cursor: "pointer", display: "inline-block" }}>
                    Upload Images
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={async (e) => {
                        if (!e.target.files?.length) return;
                        const formData = new FormData();
                        Array.from(e.target.files).forEach((f) => formData.append("files", f));
                        await api.post(`/tasks/${t.id}/images`, formData);
                        await api.patch(`/tasks/${t.id}`, { status: "in_progress" });
                        fetchData();
                      }}
                    />
                  </label>
                ) : (
                  <button onClick={() => navigate(`/tasks/${t.id}/annotate`)} style={btnPrimary}>
                    Open
                  </button>
                )}

                {t.status === "in_progress" && (
                  <button
                    onClick={async () => {
                      await api.patch(`/tasks/${t.id}`, { status: "review" });
                      fetchData();
                    }}
                    style={{ ...btnSecondary, color: "var(--warning)" }}
                  >
                    Submit
                  </button>
                )}

                <button onClick={() => navigate(`/tasks/${t.id}/review`)} style={btnGhost}>
                  Review
                </button>

                {/* Sync annotations to MinIO */}
                {(s?.image_count ?? 0) > 0 && (
                  <select
                    defaultValue=""
                    onChange={async (e) => {
                      const fmt = e.target.value;
                      if (!fmt) return;
                      e.target.value = "";
                      try {
                        const res = await api.post(`/tasks/${t.id}/sync-annotations?format=${fmt}`);
                        alert(`Synced ${res.data.files_written} files to ${res.data.bucket}/${res.data.prefix}/`);
                      } catch (err: any) {
                        alert(err.response?.data?.detail ?? "Sync failed");
                      }
                    }}
                    style={{ ...btnGhost, fontSize: 12, padding: "4px 6px", background: "var(--bg-tertiary)", borderRadius: 4, border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
                  >
                    <option value="">Sync to MinIO</option>
                    <option value="yolo">YOLO format</option>
                    <option value="cvat">CVAT XML</option>
                  </select>
                )}

                {s?.s3_bucket && s?.s3_path && (
                  <a
                    href={`http://${window.location.hostname}:9003/browser/${s.s3_bucket}/${encodeURIComponent(s.s3_path)}/`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ ...btnGhost, color: "var(--accent)", textDecoration: "none" }}
                  >
                    MinIO
                  </a>
                )}

                <button onClick={() => handleDeleteTask(t.id)} style={{ ...btnGhost, color: "var(--danger)" }}>
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {tasks.length === 0 && !showCreate && (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>
          <p style={{ fontSize: 16, marginBottom: 8 }}>No tasks yet</p>
          <p style={{ fontSize: 13, marginBottom: 16 }}>Create a task to start annotating images</p>
          <button onClick={() => setShowCreate(true)} style={btnPrimary}>+ Create Task</button>
        </div>
      )}
    </div>
  );
}

// ── Shared button styles ──

const btnPrimary: React.CSSProperties = {
  padding: "6px 16px",
  background: "var(--accent)",
  color: "#fff",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  padding: "6px 14px",
  background: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  borderRadius: 6,
  fontSize: 13,
  border: "none",
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  padding: "6px 10px",
  background: "none",
  color: "var(--text-secondary)",
  borderRadius: 6,
  fontSize: 13,
  border: "none",
  cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "var(--text-secondary)",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};
