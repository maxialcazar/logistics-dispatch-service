
import { BarChart3, TrendingUp, Users, Package, Wallet } from 'lucide-react';

export function ReportsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white mb-6">Reportes y Analíticas</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Entregas Totales', value: '1,284', change: '+12%', icon: Package, color: 'text-blue-400', bg: 'bg-blue-900/20' },
          { label: 'Conductores Activos', value: '24', change: '+2', icon: Users, color: 'text-green-400', bg: 'bg-green-900/20' },
          { label: 'Eficiencia Promedio', value: '94%', change: '+1.5%', icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-900/20' },
          { label: 'Ingresos Estimados', value: '$45,200', change: '+8%', icon: Wallet, color: 'text-amber-400', bg: 'bg-amber-900/20' },
        ].map((stat, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
            <div className="flex justify-between items-start mb-2">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <span className="text-xs font-bold text-green-400 bg-green-900/20 px-1.5 py-0.5 rounded border border-green-900/30">{stat.change}</span>
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
          <div className="h-40 w-40 rounded-full border-8 border-slate-800 border-t-blue-500 border-r-green-500 mb-4 animate-spin-slow"></div>
          <p>Distribución de Zonas</p>
        </div>
      </div>
    </div>
  );
}
