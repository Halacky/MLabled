import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate("/projects");
    } catch {
      setError("Invalid credentials");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        background: "var(--bg-primary)",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          width: 360,
          padding: 32,
          background: "var(--bg-secondary)",
          borderRadius: 12,
          border: "1px solid var(--border)",
        }}
      >
        <h1 style={{ fontSize: 24, textAlign: "center", color: "var(--accent)" }}>MLabled</h1>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p style={{ color: "var(--danger)", fontSize: 14 }}>{error}</p>}
        <button
          type="submit"
          style={{
            padding: "10px 0",
            background: "var(--accent)",
            color: "#fff",
            borderRadius: 6,
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          Sign In
        </button>
      </form>
    </div>
  );
}
