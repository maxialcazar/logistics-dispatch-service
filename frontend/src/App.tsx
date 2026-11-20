
import { useEffect, useRef, type ReactNode } from "react";
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
import { NotificationProvider, useNotifications } from "./context/NotificationContext";
import { SocketProvider, useSocket } from "./context/SocketContext";
import { DriverLayout } from "./layouts/DriverLayout";
import { DriverDashboard } from "./pages/DriverDashboard";
import { DriverMap } from "./pages/DriverMap";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TrackingPage } from "./pages/TrackingPage";

type UserRole = 'admin' | 'dispatcher' | 'driver';

function RoleGuard({
    allowedRoles,
    children,
}: {
    allowedRoles: UserRole[];
    children: ReactNode;
}) {
    const { token, user } = useAuth();

    if (!token || !user) {
        return <Navigate to="/login" replace />;
    }

    if (!allowedRoles.includes(user.role as UserRole)) {
        if (user.role === 'driver') {
            return <Navigate to="/driver" replace />;
        }
        if (user.role === 'admin' || user.role === 'dispatcher') {
            return <Navigate to="/" replace />;
        }
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}

function ProtectedRoute({
    allowedRoles,
    children,
}: {
    allowedRoles?: UserRole[];
    children: ReactNode;
}) {
    const { token } = useAuth();
    if (!token) {
        return <Navigate to="/login" replace />;
    }

    const authenticatedContent = (
        <SocketProvider token={token}>
            <NotificationListener />
            {children}
        </SocketProvider>
    );

    if (allowedRoles) {
        return <RoleGuard allowedRoles={allowedRoles}>{authenticatedContent}</RoleGuard>;
    }

    return authenticatedContent;
}

interface PackageUpdatePayload {
    packageId?: string;
    trackingCode?: string;
    status?: string;
}

interface DriverStatusPayload {
    name?: string;
    status?: string;
}

interface BusinessEventPayload {
    type?: string;
    title?: string;
    description?: string;
}

function NotificationListener() {
    const { socket } = useSocket();
    const { addNotification, preferences } = useNotifications();
    const preferencesRef = useRef(preferences);

    useEffect(() => {
        preferencesRef.current = preferences;
    }, [preferences]);

    useEffect(() => {
        if (!socket) return;

        const handlePackageUpdate = (data: PackageUpdatePayload) => {
            if (!data?.status) return;
            const prefs = preferencesRef.current;
            const pkgLabel = data.trackingCode || data.packageId || 'sin código';

            if (data.status === 'in_transit') {
                if (!prefs.packageUpdates) return;
                addNotification('Paquete en Camino', `El paquete ${pkgLabel} está en camino`, 'info');
            } else if (data.status === 'delivered') {
                if (!prefs.packageUpdates) return;
                addNotification('Paquete Entregado', `El paquete ${pkgLabel} ha sido entregado`, 'success');
            } else if (data.status === 'cancelled' || data.status === 'failed') {
                if (!prefs.incidentAlerts) return;
                const isFailed = data.status === 'failed';
                addNotification(
                    isFailed ? 'Incidencia de Entrega' : 'Paquete Cancelado',
                    `El paquete ${pkgLabel} ha sido ${isFailed ? 'reportado con incidencia' : 'cancelado'}`,
                    isFailed ? 'error' : 'warning'
                );
            }
        };

        const handleDriverStatus = (data: DriverStatusPayload) => {
            if (!preferencesRef.current.driverAlerts) return;
            if (data?.status === 'online') {
                addNotification('Conductor Conectado', `${data.name || 'Un conductor'} se ha conectado`, 'info');
            } else if (data?.status === 'offline') {
                addNotification('Conductor Desconectado', `${data.name || 'Un conductor'} se ha desconectado`, 'warning');
            }
        };

        const handleBusinessEvent = (event: BusinessEventPayload) => {
            if (event?.type !== 'ISSUE' || !preferencesRef.current.incidentAlerts) return;
            addNotification(
                event.title || 'Incidencia Operativa',
                event.description || 'Se detectó una incidencia en la operación',
                'error'
            );
        };

        socket.on('package-status-updated', handlePackageUpdate);
        socket.on('driver-status-updated', handleDriverStatus);
        socket.on('business-event', handleBusinessEvent);

        return () => {
            socket.off('package-status-updated', handlePackageUpdate);
            socket.off('driver-status-updated', handleDriverStatus);
            socket.off('business-event', handleBusinessEvent);
        };
    }, [socket, addNotification]);

    return null;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/tracking" element={<TrackingPage />} />
      <Route path="/tracking/:trackingCode" element={<TrackingPage />} />
      
      {/* Driver Routes */}
      <Route
        path="/driver"
        element={
          <ProtectedRoute allowedRoles={['driver']}>
            <DriverLayout />
          </ProtectedRoute>
        }
      >
          <Route index element={<DriverDashboard />} />
          <Route path="map" element={<DriverMap />} />
      </Route>

      {/* Admin/Dispatcher Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute allowedRoles={['admin', 'dispatcher']}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
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
    
        {/* Analytics Module */}
        <Route path="/analytics" element={<ReportsPage />} />
        
        {/* System Pages */}
        <Route path="/settings" element={<SettingsPage />} />

      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
            <AppRoutes />
            <Toaster 
              expand={true}
              visibleToasts={6}
              position="top-right" 
              closeButton
              theme="dark"
              toastOptions={{
                classNames: {
                  toast: 'bg-slate-900 border border-slate-800/80 shadow-2xl shadow-brand-950/20 text-slate-200 rounded-xl',
                  title: 'text-white font-semibold text-sm',
                  description: 'text-slate-400 text-xs',
                  actionButton: 'bg-brand-600 hover:bg-brand-500 text-white',
                  cancelButton: 'bg-slate-800 hover:bg-slate-700 text-white',
                  error: 'border-red-900/50 bg-red-950/30 text-red-200',
                  success: 'border-emerald-900/50 bg-emerald-950/30 text-emerald-200',
                  warning: 'border-amber-900/50 bg-amber-950/30 text-amber-200',
                  info: 'border-brand-900/50 bg-brand-950/30 text-brand-200',
                },
              }}
            />
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
