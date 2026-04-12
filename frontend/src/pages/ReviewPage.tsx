import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api from "../api/client";
import { imageUrl } from "../api/imageUrl";

interface ImageItem {
  id: number;
  filename: string;
  width: number;
  height: number;
}

interface Annotation {
  id: number;
  label: string;
  type: string;
  source: string;
  confidence: number | null;
}

interface TaskInfo {
  id: number;
  name: string;
  project_id: number;
  status: string;
  assignee_id: number | null;
}

export default function ReviewPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskInfo | null>(null);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: t } = await api.get(`/tasks/${taskId}`);
      setTask(t);
      const { data: imgs } = await api.get(`/tasks/${taskId}/images`);
      setImages(imgs);
    };
    load();
  }, [taskId]);

  const currentImage = images[currentIndex];

  useEffect(() => {
    if (!currentImage) return;
    api.get(`/annotations/image/${currentImage.id}`).then(({ data }) => setAnnotations(data));
  }, [currentImage?.id]);

  const handleReview = async (action: "approve" | "reject") => {
    setSubmitting(true);
    await api.post(`/review/tasks/${taskId}`, { action, comment: comment || null });
    setSubmitting(false);
    navigate(task ? `/projects/${task.project_id}/tasks` : "/projects");
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: "var(--text-secondary)",
      in_progress: "var(--warning)",
      review: "var(--accent)",
      accepted: "var(--success)",
      rejected: "var(--danger)",
    };
    return (
      <span style={{ color: colors[status] ?? "var(--text-secondary)", fontWeight: 600 }}>
        {status}
      </span>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link to={task ? `/projects/${task.project_id}/tasks` : "/projects"} style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          &larr; Back to tasks
        </Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Review: {task?.name ?? "..."}</h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Status: {task ? statusBadge(task.status) : "..."}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 24 }}>
        {/* Image viewer */}
        <div style={{ flex: 1 }}>
          <div
            style={{
              background: "var(--bg-secondary)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              minHeight: 400,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              overflow: "hidden",
            }}
          >
            {currentImage ? (
              <img
                src={imageUrl(currentImage.id)}
                alt={currentImage.filename}
                style={{ maxWidth: "100%", maxHeight: 500, objectFit: "contain" }}
              />
            ) : (
              <p style={{ color: "var(--text-secondary)" }}>No images</p>
            )}
          </div>

          {/* Navigation */}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 12 }}>
            <button
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
              style={{ padding: "4px 12px", background: "var(--bg-tertiary)", color: "var(--text-primary)", borderRadius: 4, fontSize: 13 }}
            >
              Prev
            </button>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {images.length > 0 ? `${currentIndex + 1} / ${images.length}` : "—"}
            </span>
            <button
              onClick={() => setCurrentIndex((i) => Math.min(images.length - 1, i + 1))}
              disabled={currentIndex >= images.length - 1}
              style={{ padding: "4px 12px", background: "var(--bg-tertiary)", color: "var(--text-primary)", borderRadius: 4, fontSize: 13 }}
            >
              Next
            </button>
          </div>
        </div>

        {/* Review panel */}
        <div style={{ width: 300, flexShrink: 0 }}>
          {/* Annotations summary */}
          <div
            style={{
              background: "var(--bg-secondary)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              padding: 16,
              marginBottom: 16,
            }}
          >
            <h4 style={{ fontSize: 13, marginBottom: 12 }}>Annotations ({annotations.length})</h4>
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {annotations.map((a) => (
                <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: "1px solid var(--border)" }}>
                  <span>
                    <span style={{ color: "var(--accent)" }}>{a.label}</span>{" "}
                    <span style={{ color: "var(--text-secondary)" }}>{a.type}</span>
                  </span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {a.source === "model" ? "AI" : "manual"}
                    {a.confidence != null ? ` ${(a.confidence * 100).toFixed(0)}%` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Comment + actions */}
          <div
            style={{
              background: "var(--bg-secondary)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              padding: 16,
            }}
          >
            <h4 style={{ fontSize: 13, marginBottom: 12 }}>Review Decision</h4>
            <textarea
              placeholder="Comment (optional)..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              style={{ width: "100%", marginBottom: 12, fontSize: 13 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => handleReview("approve")}
                disabled={submitting}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  background: "var(--success)",
                  color: "#fff",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Approve
              </button>
              <button
                onClick={() => handleReview("reject")}
                disabled={submitting}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  background: "var(--danger)",
                  color: "#fff",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
