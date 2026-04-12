import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/auth";
import LoginPage from "./pages/LoginPage";
import ProjectsPage from "./pages/ProjectsPage";
import TasksPage from "./pages/TasksPage";
import AnnotationPage from "./pages/AnnotationPage";
import ModelsPage from "./pages/ModelsPage";
import ReviewPage from "./pages/ReviewPage";
import Layout from "./components/Layout";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  return token ? <>{children}</> : <Navigate to="/login" />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Navigate to="/projects" />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/projects/:projectId/tasks" element={<TasksPage />} />
                <Route path="/tasks/:taskId/annotate" element={<AnnotationPage />} />
                <Route path="/tasks/:taskId/review" element={<ReviewPage />} />
                <Route path="/models" element={<ModelsPage />} />
              </Routes>
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
  );
}
