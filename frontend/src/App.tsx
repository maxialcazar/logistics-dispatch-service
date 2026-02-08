import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { CreatePackagePage } from "./pages/CreatePackagePage";
import { PackagesPage } from "./pages/PackagesPage";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext.tsx"

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { token } = useAuth();
    if (!token) {
        return <Navigate to="/login" replace />;
    }
    return <SocketProvider token={token}>{children}</SocketProvider>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        {/* Placeholder Routes */}
        <Route path="/dispatch" element={<div className="p-8 text-center text-slate-500">Dispatch Control Layout (Coming Soon)</div>} />
        {/* Packages Module */}
        <Route path="/packages" element={<PackagesPage />} />
        <Route path="/packages/new" element={<CreatePackagePage />} />
        <Route path="/monitor" element={<div className="p-8 text-center text-slate-500">Enhanced Real-Time Monitor (Coming Soon)</div>} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
