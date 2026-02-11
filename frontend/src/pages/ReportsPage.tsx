import { BarChart3, TrendingUp, Users, Package, Clock, Award } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { packageService } from '../services/packageService';
import { useSocket } from '../context/SocketContext';
import { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from 'recharts';

export function ReportsPage() {
  const { token } = useAuth();
  const { locations } = useSocket();
  const [stats, setStats] = useState({
      deliveredToday: 0,
      inTransit: 0,
      avgDeliveryTimeMinutes: 0,
      zoneDistribution: [] as { name: string, value: number }[],
      weeklyActivity: [] as { date: string, delivered: number, failed: number }[],
      topDrivers: [] as { name: string, delivered: number, efficiency: number }[]
  });

  const activeDriversCount = useMemo(() => locations.size, [locations]);

  useEffect(() => {
      if (!token) return;
      packageService.getDashboardStats(token)
          .then(data => setStats(prev => ({ ...prev, ...data })))
          .catch(console.error);
  }, [token]);

  const cards = [
    { label: 'Entregas Hoy', value: stats.deliveredToday, change: 'Hoy', icon: Package, color: 'text-blue-400', bg: 'bg-blue-900/20' },
    { label: 'Conductores Online', value: activeDriversCount, change: 'Ahora', icon: Users, color: 'text-green-400', bg: 'bg-green-900/20' },
    { label: 'En Tránsito', value: stats.inTransit, change: 'Activos', icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-900/20' },
    { label: 'Tiempo Promedio', value: `${stats.avgDeliveryTimeMinutes}m`, change: 'Estimado', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-900/20' },
  ];

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="space-y-6 pb-12">
      <h1 className="text-2xl font-bold text-white mb-6">Reportes y Analíticas</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((stat, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg transition-transform hover:scale-[1.02]">
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

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Weekly Performance Mock vs Real */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg h-[400px]">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-400" /> Rendimiento Semanal
          </h3>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={stats.weeklyActivity.length > 0 ? stats.weeklyActivity : [{date: 'No Data', delivered: 0, failed: 0}]}>
              <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                itemStyle={{ color: '#e2e8f0' }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar dataKey="delivered" name="Entregados" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={50} />
              <Bar dataKey="failed" name="Fallidos/Cancelados" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={50} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Zone Distribution Pie Chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg h-[400px]">
          <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
            <Package className="h-5 w-5 text-purple-400" /> Distribución por Zona
          </h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stats.zoneDistribution}
                cx="50%"
                cy="45%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {stats.zoneDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
              <Legend verticalAlign="bottom" height={36}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Drivers Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Award className="h-5 w-5 text-amber-400" /> Top Conductores (Semanal)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-400">
                <thead className="bg-slate-800/50 text-xs uppercase text-slate-300">
                    <tr>
                        <th className="px-4 py-3 rounded-l-lg">Conductor</th>
                        <th className="px-4 py-3">Paquetes Entregados</th>
                        <th className="px-4 py-3">Eficiencia Est.</th>
                        <th className="px-4 py-3 rounded-r-lg">Estado</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                    {stats.topDrivers.length > 0 ? (
                        stats.topDrivers.map((driver, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/20 transition-colors">
                                <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                                    <div className="h-6 w-6 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold ring-2 ring-slate-800">
                                        {idx + 1}
                                    </div>
                                    {driver.name}
                                </td>
                                <td className="px-4 py-3 text-blue-400 font-bold">{driver.delivered}</td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="h-1.5 w-16 bg-slate-700 rounded-full overflow-hidden">
                                            <div className="h-full bg-green-500" style={{ width: `${driver.efficiency}%` }} />
                                        </div>
                                        <span className="text-green-400">{driver.efficiency}%</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <span className="inline-flex items-center rounded-full bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-400">
                                        Activo
                                    </span>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                                No hay datos suficientes esta semana.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
          </div>
      </div>
    </div>
  );
}
