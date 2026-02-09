
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster } from 'sonner';
import { DashboardLayout } from "./layouts/DashboardLayout";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { CreatePackagePage } from "./pages/CreatePackagePage";
import { PackagesPage } from "./pages/PackagesPage";
import { ZonesPage } from "./pages/ZonesPage";
import { DriversPage } from "./pages/DriversPage";
import { DispatchPage } from "./pages/DispatchPage"; 
import { MonitorPage } from "./pages/MonitorPage";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";

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
        
        {/* Dispatch Control */}
        <Route path="/dispatch" element={<DispatchPage />} />
        
        {/* Monitor Module */}
        <Route path="/monitor" element={<MonitorPage />} />
        
        {/* Packages Module */}
        <Route path="/packages" element={<PackagesPage />} />
        <Route path="/packages/new" element={<CreatePackagePage />} />
        
        {/* Zones Module */}
        <Route path="/zones" element={<ZonesPage />} />
        
        {/* Drivers Module */}
        <Route path="/drivers" element={<DriversPage />} />
    
        {/* Analytics Module (Placeholder for now) */}
         <Route path="/analytics" element={<div className="p-8 text-center text-slate-500">Analytics Dashboard (Coming Soon)</div>} />

      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster 
          expand={true}
          visibleToasts={6}
          position="top-right" 
          closeButton
          theme="dark"
          toastOptions={{
            classNames: {
              toast: 'bg-slate-900 border border-slate-800 shadow-2xl shadow-blue-900/10 text-slate-200 rounded-xl',
              title: 'text-white font-semibold text-sm',
              description: 'text-slate-400 text-xs',
              actionButton: 'bg-blue-600 hover:bg-blue-500 text-white',
              cancelButton: 'bg-slate-800 hover:bg-slate-700 text-white',
              error: 'border-red-900/50 bg-red-950/30 text-red-200',
              success: 'border-green-900/50 bg-green-950/30 text-green-200',
              warning: 'border-yellow-900/50 bg-yellow-950/30 text-yellow-200',
              info: 'border-blue-900/50 bg-blue-950/30 text-blue-200',
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
