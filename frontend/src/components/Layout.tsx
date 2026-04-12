import { Link, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { useEffect } from "react";

const navItems = [
  { path: "/projects", label: "Projects" },
  { path: "/models", label: "Models" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, fetchMe, logout } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (!user) fetchMe();
  }, [user, fetchMe]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          height: 48,
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <Link to="/projects" style={{ fontWeight: 700, fontSize: 18, color: "var(--accent)" }}>
            MLabled
          </Link>
          <nav style={{ display: "flex", gap: 16 }}>
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  color: location.pathname.startsWith(item.path)
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                  fontSize: 14,
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14 }}>
          <span style={{ color: "var(--text-secondary)" }}>
            {user?.full_name} ({user?.role})
          </span>
          <button
            onClick={logout}
            style={{
              background: "none",
              color: "var(--text-secondary)",
              fontSize: 13,
            }}
          >
            Logout
          </button>
        </div>
      </header>
      <main style={{ flex: 1, overflow: "auto", padding: 24 }}>{children}</main>
    </div>
  );
}
