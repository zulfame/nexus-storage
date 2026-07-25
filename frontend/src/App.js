import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Storages from "@/pages/Storages";
import Users from "@/pages/Users";
import Files from "@/pages/Files";
import Logs from "@/pages/Logs";
import ManageApp from "@/pages/ManageApp";
import ManageApis from "@/pages/ManageApis";
import SharePage from "@/pages/SharePage";
import { SettingsProvider } from "@/context/SettingsContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function ProtectedRoute({ children, adminOnly }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="font-mono text-primary text-sm animate-pulse">initializing…</span>
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/files" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/share/:token" element={<SharePage />} />
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={<Dashboard />}
        />
        <Route
          path="storages"
          element={
            <ProtectedRoute adminOnly>
              <Storages />
            </ProtectedRoute>
          }
        />
        <Route
          path="users"
          element={
            <ProtectedRoute adminOnly>
              <Users />
            </ProtectedRoute>
          }
        />
        <Route path="files" element={<Files />} />
        <Route path="logs" element={<Logs />} />
        <Route
          path="settings"
          element={
            <ProtectedRoute adminOnly>
              <ManageApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="manage-apis"
          element={
            <ProtectedRoute adminOnly>
              <ManageApis />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <SettingsProvider>
        <AuthProvider>
          <BrowserRouter>
            <ErrorBoundary>
              <AppRoutes />
            </ErrorBoundary>
          </BrowserRouter>
          <Toaster position="bottom-right" theme="dark" />
        </AuthProvider>
      </SettingsProvider>
    </div>
  );
}

export default App;
