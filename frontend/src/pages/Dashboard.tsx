import { PackageCheck, Truck, Clock, Radio, Navigation, CheckCircle, XCircle, Info, LayoutList, AlertTriangle } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { packageService } from '../services/packageService';
import { useMemo, useState, useEffect } from 'react';
import { LiveMap } from '../components/LiveMap';
import { Skeleton, SkeletonFeedItem, SkeletonKpiCard } from '../components/Skeleton';

export function Dashboard() {
  const { locations, isConnected, events } = useSocket();
  const { token } = useAuth();
  
  const [metrics, setMetrics] = useState({ 
      deliveredToday: 0, 
      inTransit: 0, 
      avgDeliveryTimeMinutes: 0 
  });
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  // Fetch Stats Loop
  useEffect(() => {
      if (!token) return;
      let isActive = true;
      let isInitial = true;

      const loadStats = async () => {
          try {
              const data = await packageService.getDashboardStats(token);
              if (!isActive) return;
              setMetrics(data);
              setStatsError('');
          } catch (err: unknown) {
              if (!isActive) return;
              console.error("Stats Error:", err);
              if (isInitial) {
                  setStatsError(err instanceof Error ? err.message : 'Error al cargar métricas');
              }
          } finally {
              if (isActive && isInitial) {
                  isInitial = false;
                  setLoading(false);
              }
          }
      };

      loadStats();
      const interval = window.setInterval(loadStats, 60000);
      return () => {
          isActive = false;
          window.clearInterval(interval);
      };
  }, [token, retryKey]);

  const isLoading = Boolean(token) && loading;

  const handleRetryStats = () => {
      setLoading(true);
      setStatsError('');
      setRetryKey((prev) => prev + 1);
  };

  // Convert Map to Array for rendering
  const activeDrivers = useMemo(() => Array.from(locations.values()), [locations]);
  const activeAlertsCount = useMemo(() => events.filter(e => e.type === 'ISSUE').length, [events]);

  // Dynamic Stats Configuration
  const dynamicStats = [
      { 
          label: 'Paquetes Entregados', 
          value: statsError ? '—' : metrics.deliveredToday.toString(), 
          trend: 'Hoy', 
          trendColor: 'text-slate-400', 
          icon: PackageCheck 
      },
      { 
          label: 'Tiempo Prom. Entrega', 
          value: statsError ? '—' : `${metrics.avgDeliveryTimeMinutes}m`, 
          trend: 'Estimado', 
          trendColor: 'text-slate-400', 
          icon: Clock 
      },
      { 
          label: 'En Ruta Ahora', 
          value: statsError ? '—' : metrics.inTransit.toString(), 
          trend: 'Activos', 
          trendColor: 'text-brand-400', 
          icon: Navigation 
      },
      { 
          label: 'Alertas Activas', 
          value: activeAlertsCount.toString(), 
          trend: activeAlertsCount > 0 ? 'En atención' : 'Sin alertas', 
          trendColor: activeAlertsCount > 0 ? 'text-red-400' : 'text-emerald-400', 
          icon: AlertTriangle 
      },
  ];

  const getEventIcon = (type: string) => {
      switch (type) {
          case 'DELIVERY': return <CheckCircle className="h-5 w-5 text-emerald-400" />;
          case 'ISSUE': return <XCircle className="h-5 w-5 text-red-400" />;
          case 'SYSTEM': return <Info className="h-5 w-5 text-brand-400" />;
          case 'LOCATION': return <Navigation className="h-5 w-5 text-violet-400" />;
          default: return <Radio className="h-5 w-5 text-slate-400" />;
      }
  };

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Cargando panel operativo"
        className="flex flex-col gap-4 lg:h-full lg:min-h-0"
      >
        <span className="sr-only">Cargando métricas del tablero...</span>
        {/* Metrics Row Skeleton */}
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 flex-shrink-0">
          {[0, 1, 2, 3, 4].map((i) => (
            <SkeletonKpiCard key={i} variant="inline" />
          ))}
        </div>

        {/* Main Content Skeleton: Map & Activity */}
        <div className="grid gap-4 lg:grid-cols-3 lg:flex-1 lg:min-h-0">
          <div className="lg:col-span-2 flex flex-col gap-3 min-h-0 lg:h-full">
            <div className="flex items-center justify-between flex-shrink-0">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Radio className="h-4 w-4 text-slate-500" />
                Mapa de Flota en Vivo
              </h2>
            </div>
            <div className="w-full h-[340px] lg:h-auto lg:flex-1 lg:min-h-0 rounded-xl border border-slate-800/80 bg-slate-900 shadow-inner relative overflow-hidden p-4">
              <Skeleton className="h-full w-full rounded-lg bg-slate-800/35" />
              <div
                aria-hidden="true"
                className="absolute bottom-6 left-6 bg-slate-950/90 border border-slate-800/80 p-3 rounded-xl shadow-2xl flex items-center gap-4"
              >
                <div className="space-y-1.5">
                  <Skeleton className="h-2.5 w-12" />
                  <Skeleton className="h-7 w-8" />
                </div>
                <div className="h-8 w-px bg-slate-800/80" />
                <div className="space-y-1.5">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-6 w-8" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 min-h-0 lg:h-full">
            <div className="flex items-center justify-between flex-shrink-0">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <LayoutList className="h-4 w-4 text-brand-400" />
                Novedades
              </h2>
              <Skeleton className="h-5 w-16 rounded" />
            </div>
            <div className="flex-1 min-h-[240px] max-h-[380px] lg:max-h-none lg:min-h-0 rounded-xl border border-slate-800/80 bg-slate-900/60 p-4 space-y-3 overflow-hidden">
              {[0, 1, 2, 3, 4].map((i) => (
                <SkeletonFeedItem key={i} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
      {statsError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-300 flex-shrink-0"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
            <span>No se pudieron cargar las métricas: {statsError}</span>
          </div>
          <button
            type="button"
            onClick={handleRetryStats}
            className="px-3 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-red-500/30 text-xs font-medium text-white transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 flex-shrink-0">
        {/* Dynamic Card for Active Drivers (From Socket) */}
         <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-900 p-4 shadow-sm transition-colors hover:border-slate-700/80">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Conductores Conectados</p>
              <p className="mt-1.5 text-2xl font-bold tracking-tight text-white tabular-nums">{activeDrivers.length}</p>
              <div className="mt-1 flex items-center gap-1 text-xs">
                 <span className={isConnected ? "text-emerald-400" : "text-red-400"}>
                    {isConnected ? "● Conexión en Vivo" : "○ Desconectado"}
                 </span>
              </div>
            </div>
             <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20">
              <Truck className="h-5 w-5" />
            </div>
         </div>

         {/* Backend Metrics Cards */}
        {dynamicStats.map((stat, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-900 p-4 shadow-sm transition-colors hover:border-slate-700/80"
          >
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{stat.label}</p>
              <p className="mt-1.5 text-2xl font-bold tracking-tight text-white tabular-nums">{stat.value}</p>
              <div className="mt-1 flex items-center gap-1 text-xs">
                <span className={stat.trendColor}>{stat.trend}</span>
              </div>
            </div>
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20">
              <stat.icon className="h-5 w-5" />
            </div>
          </div>
        ))}
      </div>

      {/* Main Content: Map & Activity */}
      <div className="grid gap-4 lg:grid-cols-3 lg:flex-1 lg:min-h-0">
        {/* Map Area (Takes 2/3 width) */}
        <div className="lg:col-span-2 flex flex-col gap-3 min-h-0 lg:h-full">
          <div className="flex items-center justify-between flex-shrink-0">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Radio className={`h-4 w-4 ${isConnected ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
                Mapa de Flota en Vivo
            </h2>
          </div>
          <div className="w-full h-[340px] lg:h-auto lg:flex-1 lg:min-h-0 rounded-xl border border-slate-800/80 bg-slate-900 shadow-inner relative overflow-hidden group">
            <LiveMap />
          </div>
        </div>

        {/* Activity Feed (Takes 1/3 width) */}
        <div className="flex flex-col gap-3 min-h-0 lg:h-full">
           <div className="flex items-center justify-between flex-shrink-0">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <LayoutList className="h-4 w-4 text-brand-400" />
                Novedades
            </h2>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-800/80 text-slate-300 tabular-nums">
              En Vivo · {events.length}
            </span>
          </div>
          <div className="flex-1 min-h-[240px] max-h-[380px] lg:max-h-none lg:min-h-0 rounded-xl border border-slate-800/80 bg-slate-900/60 p-4 space-y-3 overflow-y-auto custom-scrollbar">
             {events.length === 0 && (
                 <div className="flex flex-col items-center justify-center h-full py-10 text-slate-400 gap-2">
                     <Radio className="h-8 w-8 opacity-25" />
                     <p className="text-sm">Esperando eventos del sistema...</p>
                 </div>
             )}
             
             {events.map((evt) => (
               <div key={evt.id} className="flex gap-3 border-b border-slate-800/80 pb-3 last:border-0 last:pb-0 animate-in slide-in-from-right-5 fade-in duration-300">
                  <div className="mt-0.5 flex-shrink-0">
                      {getEventIcon(evt.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-100 truncate">{evt.title}</p>
                        <span className="text-[11px] text-slate-400 font-mono tabular-nums whitespace-nowrap">
                            {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 leading-snug">{evt.description}</p>
                  </div>
               </div>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
}
