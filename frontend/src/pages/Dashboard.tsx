import { PackageCheck, Truck, Clock, Radio, Navigation, CheckCircle, XCircle, Info, LayoutList } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { packageService } from '../services/packageService';
import { useMemo, useState, useEffect } from 'react';
import { LiveMap } from '../components/LiveMap';

export function Dashboard() {
  const { locations, isConnected, events } = useSocket();
  const { token } = useAuth();
  
  const [metrics, setMetrics] = useState({ 
      deliveredToday: 0, 
      inTransit: 0, 
      avgDeliveryTimeMinutes: 0 
  });

  // Fetch Stats Loop
  useEffect(() => {
      if (!token) return;
      const loadStats = () => {
          packageService.getDashboardStats(token)
            .then(data => setMetrics(data))
            .catch(err => console.error("Stats Error:", err));
      }
      loadStats();
      const interval = setInterval(loadStats, 60000);
      return () => clearInterval(interval);
  }, [token]);

  // Convert Map to Array for rendering
  const activeDrivers = useMemo(() => Array.from(locations.values()), [locations]);

  // Dynamic Stats Configuration
  const dynamicStats = [
      { 
          label: 'Paquetes Entregados', 
          value: metrics.deliveredToday.toString(), 
          trend: 'Hoy', 
          trendColor: 'text-slate-400', 
          icon: PackageCheck 
      },
      { 
          label: 'Tiempo Prom. Entrega', 
          value: `${metrics.avgDeliveryTimeMinutes}m`, 
          trend: 'Estimado', 
          trendColor: 'text-slate-400', 
          icon: Clock 
      },
      { 
          label: 'En Ruta Ahora', 
          value: metrics.inTransit.toString(), 
          trend: 'Activos', 
          trendColor: 'text-blue-400', 
          icon: Navigation 
      },
  ];

  const getEventIcon = (type: string) => {
      switch (type) {
          case 'DELIVERY': return <CheckCircle className="h-5 w-5 text-green-500" />;
          case 'ISSUE': return <XCircle className="h-5 w-5 text-red-500" />;
          case 'SYSTEM': return <Info className="h-5 w-5 text-blue-500" />;
          case 'LOCATION': return <Navigation className="h-5 w-5 text-purple-500" />;
          default: return <Radio className="h-5 w-5 text-slate-500" />;
      }
  };

  return (
    <div className="space-y-8 h-[calc(100vh-100px)] flex flex-col">
      {/* Metrics Row */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 flex-shrink-0">
        {/* Dynamic Card for Active Drivers (From Socket) */}
         <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm transition-all hover:bg-slate-800/50 hover:shadow-md">
            <div>
              <p className="text-sm font-medium text-slate-400">Conductores Conectados</p>
              <p className="mt-2 text-3xl font-bold text-white">{activeDrivers.length}</p>
              <div className="mt-1 flex items-center gap-1 text-xs">
                 <span className={isConnected ? "text-green-400" : "text-red-400"}>
                    {isConnected ? "● Conexión en Vivo" : "○ Desconectado"}
                 </span>
              </div>
            </div>
             <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-800 text-blue-400 ring-1 ring-slate-700">
              <Truck className="h-6 w-6" />
            </div>
         </div>

         {/* Backend Metrics Cards */}
        {dynamicStats.map((stat, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm transition-all hover:bg-slate-800/50 hover:shadow-md"
          >
            <div>
              <p className="text-sm font-medium text-slate-400">{stat.label}</p>
              <p className="mt-2 text-3xl font-bold text-white">{stat.value}</p>
              <div className="mt-1 flex items-center gap-1 text-xs">
                <span className={stat.trendColor}>{stat.trend}</span>
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-800 text-blue-400 ring-1 ring-slate-700">
              <stat.icon className="h-6 w-6" />
            </div>
          </div>
        ))}
      </div>

      {/* Main Content: Map & Activity */}
      <div className="grid gap-6 lg:grid-cols-3 flex-1 min-h-0">
        {/* Map Area (Takes 2/3 width) */}
        <div className="lg:col-span-2 space-y-4 flex flex-col h-full">
          <div className="flex items-center justify-between flex-shrink-0">
            <h2 className="text-lg font-semibold flex items-center gap-2">
                <Radio className={`h-4 w-4 ${isConnected ? 'text-green-500 animate-pulse' : 'text-slate-600'}`} />
                Mapa de Flota en Vivo
            </h2>
          </div>
          <div className="flex-1 w-full rounded-xl border border-slate-800 bg-slate-900 shadow-inner flex items-center justify-center relative overflow-hidden group min-h-[400px]">
            <LiveMap />
          </div>
        </div>

        {/* Activity Feed (Takes 1/3 width) */}
        <div className="space-y-4 flex flex-col h-full">
           <div className="flex items-center justify-between flex-shrink-0">
            <h2 className="text-lg font-semibold flex items-center gap-2">
                <LayoutList className="h-5 w-5 text-purple-400" />
                Novedades
            </h2>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">En Vivo</span>
          </div>
          <div className="flex-1 rounded-xl border border-slate-800 bg-slate-900/30 p-4 space-y-4 overflow-y-auto custom-scrollbar">
             {events.length === 0 && (
                 <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2">
                     <Radio className="h-8 w-8 opacity-20" />
                     <p className="text-sm">Esperando eventos del sistema...</p>
                 </div>
             )}
             
             {events.map((evt) => (
               <div key={evt.id} className="flex gap-4 border-b border-slate-800/50 pb-4 last:border-0 last:pb-0 animate-in slide-in-from-right-5 fade-in duration-300">
                  <div className="mt-1 flex-shrink-0">
                      {getEventIcon(evt.type)}
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-200">{evt.title}</p>
                        <span className="text-[10px] text-slate-600 font-mono whitespace-nowrap">
                            {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">{evt.description}</p>
                  </div>
               </div>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
}
