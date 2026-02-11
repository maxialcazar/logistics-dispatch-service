
import { BarChart3, TrendingUp, Users, Package, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { packageService } from '../services/packageService';
import { useSocket } from '../context/SocketContext';
import { useState, useEffect, useMemo } from 'react';

export function ReportsPage() {
  const { token } = useAuth();
  const { locations } = useSocket();
  const [stats, setStats] = useState({
      deliveredToday: 0,
      inTransit: 0,
      avgDeliveryTimeMinutes: 0,
      zoneDistribution: [] as { name: string, value: number }[]
  });

  const activeDriversCount = useMemo(() => locations.size, [locations]);

  useEffect(() => {
      if (!token) return;
      packageService.getDashboardStats(token)
          .then(data => setStats(data))
          .catch(console.error);
  }, [token]);

  const cards = [
    { label: 'Entregas Hoy', value: stats.deliveredToday, change: 'Hoy', icon: Package, color: 'text-blue-400', bg: 'bg-blue-900/20' },
    { label: 'Conductores Online', value: activeDriversCount, change: 'Ahora', icon: Users, color: 'text-green-400', bg: 'bg-green-900/20' },
    { label: 'En Tránsito', value: stats.inTransit, change: 'Activos', icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-900/20' },
    { label: 'Tiempo Promedio', value: `${stats.avgDeliveryTimeMinutes}m`, change: 'Estimado', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-900/20' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white mb-6">Reportes y Analíticas</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((stat, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
            <div className="flex justify-between items-start mb-2">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <span className="text-xs font-bold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">{stat.change}</span>
            </div>
            <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
            <div className="text-xs text-slate-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Charts Placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg h-96 flex flex-col items-center justify-center text-slate-500">
          <BarChart3 className="h-16 w-16 mb-4 text-slate-700" />
          <p>Gráfico de Rendimiento Semanal</p>
          <span className="text-xs text-slate-600 mt-2">(Próximamente con datos reales)</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg h-96 flex flex-col items-center justify-center text-slate-500">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <Package size={16} className="text-blue-400" /> Distribución de Paquetes Activos
          </h3>
          <div className="w-full space-y-4 overflow-y-auto pr-2 custom-scrollbar">
            {stats.zoneDistribution.length > 0 ? (
                stats.zoneDistribution.map((zone, i) => (
                    <div key={i} className="space-y-1">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-300">{zone.name}</span>
                            <span className="text-white font-bold">{zone.value}</span>
                        </div>
                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-blue-500 rounded-full" 
                                style={{ width: `${Math.min(100, (zone.value / Math.max(...stats.zoneDistribution.map(z => z.value))) * 100)}%` }} // Relative to max
                            />
                        </div>
                    </div>
                ))
            ) : (
                <div className="text-center text-slate-500 py-10">
                    No hay datos de zonas activos.
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
