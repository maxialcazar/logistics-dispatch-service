import { PackageCheck, Truck, Clock, AlertTriangle, Radio } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useMemo } from 'react';
import { LiveMap } from '../components/LiveMap';

const stats = [
  { label: 'Conductores Activos', value: '12', trend: '+2', trendColor: 'text-green-400', icon: Truck },
  { label: 'Paquetes Entregados', value: '184', trend: '+14%', trendColor: 'text-green-400', icon: PackageCheck },
  { label: 'Tiempo Prom. Entrega', value: '24m', trend: '-2m', trendColor: 'text-green-400', icon: Clock },
  { label: 'Incidencias Pendientes', value: '3', trend: '+1', trendColor: 'text-red-400', icon: AlertTriangle },
];

export function Dashboard() {
  const { locations, isConnected } = useSocket();

  // Convert Map to Array for rendering
  const activeDrivers = useMemo(() => Array.from(locations.values()), [locations]);

  return (
    <div className="space-y-8">
      {/* Metrics Row */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Dynamic Card for Active Drivers */}
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

         {/* Static cards for now... */}
        {stats.slice(1).map((stat, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm transition-all hover:bg-slate-800/50 hover:shadow-md"
          >
            <div>
              <p className="text-sm font-medium text-slate-400">{stat.label}</p>
              <p className="mt-2 text-3xl font-bold">{stat.value}</p>
              <div className="mt-1 flex items-center gap-1 text-xs">
                <span className={stat.trendColor}>{stat.trend}</span>
                <span className="text-slate-500">vs última hora</span>
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-800 text-blue-400 ring-1 ring-slate-700">
              <stat.icon className="h-6 w-6" />
            </div>
          </div>
        ))}
      </div>

      {/* Main Content: Map & Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Map Area (Takes 2/3 width) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
                <Radio className={`h-4 w-4 ${isConnected ? 'text-green-500 animate-pulse' : 'text-slate-600'}`} />
                Mapa de Flota en Vivo
            </h2>
            <div className="flex gap-2">
              <button className="text-xs font-medium text-blue-400 hover:underline">Pantalla Completa</button>
            </div>
          </div>
          <div className="h-[400px] w-full rounded-xl border border-slate-800 bg-slate-900 shadow-inner flex items-center justify-center relative overflow-hidden group">
            {/* Real React-Leaflet Map */}
            <LiveMap />
          </div>
        </div>

        {/* Activity Feed (Takes 1/3 width) */}
        <div className="space-y-4">
           <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Actividad Reciente</h2>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">En Vivo</span>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 space-y-4 h-[400px] overflow-y-auto custom-scrollbar">
             {activeDrivers.slice(0, 10).map((driver) => (
               <div key={driver.driverId + driver.timestamp} className="flex gap-4 border-b border-slate-800/50 pb-4 last:border-0 last:pb-0 animate-in slide-in-from-right-5">
                  <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-green-500 ring-4 ring-green-500/20" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">Ubicación Actualizada</p>
                    <p className="text-xs text-slate-500">Conductor {driver.driverId.substring(0,8)} en <span className="text-blue-400">{driver.lat.toFixed(3)}, {driver.lng.toFixed(3)}</span></p>
                  </div>
               </div>
             ))}
             {activeDrivers.length === 0 && (
                 <div className="text-center text-slate-600 text-sm py-10">
                     Esperando eventos...
                 </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
