import {
  AlertCircle,
  Award,
  BarChart3,
  Calendar,
  Clock,
  Download,
  FileSpreadsheet,
  Loader2,
  Package,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import clsx from 'clsx';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { packageService, type DashboardStats } from '../services/packageService';
import {
  Skeleton,
  SkeletonChart,
  SkeletonKpiCard,
  SkeletonTableRows,
} from '../components/Skeleton';

type DatePresetId = 'today' | '7d' | '30d' | 'month' | 'all';

const COLORS = ['#0ea5e9', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444'];
const FORMULA_INJECTION_REGEX = /^[\t\r ]*[=+\-@]|^[\t\r]/;

function toLocalDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPresetRange(preset: DatePresetId): { dateFrom: string; dateTo: string } {
  if (preset === 'all') {
    return { dateFrom: '', dateTo: '' };
  }
  const now = new Date();
  const today = toLocalDateInputValue(now);

  if (preset === 'today') {
    return { dateFrom: today, dateTo: today };
  }
  if (preset === 'month') {
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return { dateFrom: toLocalDateInputValue(firstOfMonth), dateTo: today };
  }

  const daysBack = preset === '30d' ? 29 : 6;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack);
  return { dateFrom: toLocalDateInputValue(start), dateTo: today };
}

/**
 * Escapes a CSV cell according to RFC-4180 and neutralizes spreadsheet formula injection.
 */
function formatCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  const neutralized = FORMULA_INJECTION_REGEX.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

function buildCsvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(formatCsvCell).join(',');
}

const INITIAL_STATS: DashboardStats = {
  deliveredToday: 0,
  inTransit: 0,
  avgDeliveryTimeMinutes: 0,
  zoneDistribution: [],
  weeklyActivity: [],
  topDrivers: [],
};

export function ReportsPage() {
  const { token } = useAuth();
  const { locations } = useSocket();

  const initialRange = useMemo(() => getPresetRange('7d'), []);
  const [dateFrom, setDateFrom] = useState<string>(initialRange.dateFrom);
  const [dateTo, setDateTo] = useState<string>(initialRange.dateTo);

  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [exportingPackages, setExportingPackages] = useState(false);
  const [exportingSummary, setExportingSummary] = useState(false);

  const dateFromId = useId();
  const dateToId = useId();
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const activeDriversCount = useMemo(() => locations.size, [locations]);
  const hasInvalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  const activePreset = useMemo<DatePresetId | 'custom'>(() => {
    const presets: DatePresetId[] = ['today', '7d', '30d', 'month', 'all'];
    for (const preset of presets) {
      const range = getPresetRange(preset);
      if (range.dateFrom === dateFrom && range.dateTo === dateTo) {
        return preset;
      }
    }
    return 'custom';
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (!token) return;
    if (hasInvalidDateRange) {
      abortControllerRef.current?.abort();
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = ++requestIdRef.current;

    packageService
      .getDashboardStats(
        token,
        {
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
        controller.signal
      )
      .then((data) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        setStats({ ...INITIAL_STATS, ...data });
        setError('');
      })
      .catch((err: unknown) => {
        if (
          controller.signal.aborted ||
          requestId !== requestIdRef.current ||
          (err instanceof Error && err.name === 'AbortError')
        ) {
          return;
        }
        console.error(err);
        setError(err instanceof Error ? err.message : 'Error al cargar reportes');
      })
      .finally(() => {
        if (!controller.signal.aborted && requestId === requestIdRef.current) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [token, dateFrom, dateTo, hasInvalidDateRange, retryKey]);

  const isLoading = Boolean(token) && loading && !hasInvalidDateRange;

  const handleSelectPreset = (preset: DatePresetId) => {
    const next = getPresetRange(preset);
    if (next.dateFrom === dateFrom && next.dateTo === dateTo) return;
    setDateFrom(next.dateFrom);
    setDateTo(next.dateTo);
    setError('');
    setLoading(true);
  };

  const handleDateFromChange = (nextFrom: string) => {
    setDateFrom(nextFrom);
    const willBeInvalid = Boolean(nextFrom && dateTo && nextFrom > dateTo);
    setError('');
    setLoading(!willBeInvalid);
  };

  const handleDateToChange = (nextTo: string) => {
    setDateTo(nextTo);
    const willBeInvalid = Boolean(dateFrom && nextTo && dateFrom > nextTo);
    setError('');
    setLoading(!willBeInvalid);
  };

  const handleRetry = () => {
    if (hasInvalidDateRange) return;
    setLoading(true);
    setError('');
    setRetryKey((prev) => prev + 1);
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    let objectUrl: string | null = null;
    try {
      objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } finally {
      if (objectUrl) {
        const urlToRevoke = objectUrl;
        window.setTimeout(() => URL.revokeObjectURL(urlToRevoke), 1000);
      }
    }
  };

  const handleExportPackagesCsv = async () => {
    if (!token || exportingPackages) return;
    if (hasInvalidDateRange) {
      toast.error('Corrige el rango de fechas antes de exportar.');
      return;
    }

    setExportingPackages(true);
    try {
      const { blob, filename } = await packageService.exportPackagesCsv(token, {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });

      const fallbackName = `paquetes-${dateFrom || 'inicio'}_${dateTo || toLocalDateInputValue(new Date())}.csv`;
      triggerBlobDownload(blob, filename || fallbackName);
      toast.success('Exportación de paquetes CSV descargada');
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : 'Error al exportar paquetes en CSV.'
      );
    } finally {
      setExportingPackages(false);
    }
  };

  const handleExportSummaryCsv = () => {
    if (exportingSummary || hasInvalidDateRange || isLoading || error) return;
    setExportingSummary(true);

    try {
      const periodLabelFrom = dateFrom || 'Inicio';
      const periodLabelTo = dateTo || toLocalDateInputValue(new Date());
      const rows: string[] = [
        buildCsvRow(['Sección', 'Indicador / Fecha / Zona / Conductor', 'Valor / Entregados', 'Detalle / Fallidos / Eficiencia']),
        buildCsvRow(['Período', 'Fecha Desde', periodLabelFrom, '']),
        buildCsvRow(['Período', 'Fecha Hasta', periodLabelTo, '']),
        buildCsvRow(['KPIs', 'Entregas en Período', stats.deliveredToday, '']),
        buildCsvRow(['KPIs', 'Conductores Online', activeDriversCount, 'Tiempo real']),
        buildCsvRow(['KPIs', 'En Tránsito', stats.inTransit, 'Activos']),
        buildCsvRow(['KPIs', 'Tiempo Promedio de Entrega (min)', stats.avgDeliveryTimeMinutes, '']),
        ...stats.weeklyActivity.map((item) =>
          buildCsvRow(['Actividad Diaria', item.date, item.delivered, `Fallidos: ${item.failed}`])
        ),
        ...stats.zoneDistribution.map((zone) =>
          buildCsvRow(['Distribución por Zona', zone.name, zone.value, 'Paquetes'])
        ),
        ...stats.topDrivers.map((drv, idx) =>
          buildCsvRow([
            'Top Conductores',
            `${idx + 1}. ${drv.name}`,
            drv.delivered,
            `Eficiencia: ${drv.efficiency}%`,
          ])
        ),
      ];

      const csvContent = `\uFEFF${rows.join('\r\n')}`;
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      triggerBlobDownload(
        blob,
        `resumen-analitico-${dateFrom || 'todo'}_${periodLabelTo}.csv`
      );
      toast.success('Resumen analítico CSV descargado');
    } finally {
      setExportingSummary(false);
    }
  };

  const periodBadge = useMemo(() => {
    if (activePreset === 'today') return 'Hoy';
    if (activePreset === '7d') return '7 días';
    if (activePreset === '30d') return '30 días';
    if (activePreset === 'month') return 'Este mes';
    if (activePreset === 'all') return 'Histórico';
    return 'Rango';
  }, [activePreset]);

  const cards = [
    {
      label: activePreset === 'today' ? 'Entregas Hoy' : 'Entregas del Período',
      value: stats.deliveredToday,
      change: periodBadge,
      icon: Package,
      color: 'text-brand-400',
      bg: 'bg-brand-500/10 border border-brand-500/20',
    },
    {
      label: 'Conductores Online',
      value: activeDriversCount,
      change: 'Ahora',
      icon: Users,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border border-emerald-500/20',
    },
    {
      label: 'En Tránsito',
      value: stats.inTransit,
      change: 'Activos',
      icon: TrendingUp,
      color: 'text-violet-400',
      bg: 'bg-violet-500/10 border border-violet-500/20',
    },
    {
      label: 'Tiempo Promedio',
      value: `${stats.avgDeliveryTimeMinutes}m`,
      change: 'Promedio',
      icon: Clock,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border border-amber-500/20',
    },
  ];

  return (
    <div className="space-y-6 pb-8">
      {/* Header & Controls */}
      <div className="flex flex-col 2xl:flex-row 2xl:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Reportes y Analíticas</h1>
          <p className="text-sm text-slate-400 mt-1">
            Indicadores operativos filtrables por rango de fechas y exportación CSV.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-center gap-3">
          {/* Date Presets */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-900 border border-slate-800/80 p-1 rounded-xl">
            {(
              [
                { id: 'today', label: 'Hoy' },
                { id: '7d', label: '7 días' },
                { id: '30d', label: '30 días' },
                { id: 'month', label: 'Este mes' },
                { id: 'all', label: 'Todo' },
              ] as const
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.id)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors',
                  activePreset === preset.id
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Explicit Date Inputs */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-900 border border-slate-800/80 p-1.5 rounded-xl">
            <div className="flex items-center gap-1.5 px-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
              <label htmlFor={dateFromId} className="text-xs text-slate-400 whitespace-nowrap">
                Desde
              </label>
              <input
                id={dateFromId}
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => handleDateFromChange(e.target.value)}
                className={clsx(
                  'bg-slate-950 border rounded-lg px-2.5 py-1.5 text-xs text-white tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-500 [color-scheme:dark]',
                  hasInvalidDateRange ? 'border-red-500/60' : 'border-slate-800/80'
                )}
              />
            </div>

            <div className="flex items-center gap-1.5 px-1.5">
              <label htmlFor={dateToId} className="text-xs text-slate-400 whitespace-nowrap">
                Hasta
              </label>
              <input
                id={dateToId}
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => handleDateToChange(e.target.value)}
                className={clsx(
                  'bg-slate-950 border rounded-lg px-2.5 py-1.5 text-xs text-white tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-500 [color-scheme:dark]',
                  hasInvalidDateRange ? 'border-red-500/60' : 'border-slate-800/80'
                )}
              />
            </div>
          </div>

          {/* Export Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportPackagesCsv}
              disabled={!token || exportingPackages || hasInvalidDateRange}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold whitespace-nowrap rounded-lg shadow-lg shadow-brand-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportingPackages ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Exportar CSV
            </button>

            <button
              type="button"
              onClick={handleExportSummaryCsv}
              disabled={exportingSummary || hasInvalidDateRange || isLoading || Boolean(error)}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800/80 text-slate-200 hover:text-white text-xs font-medium whitespace-nowrap rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Descargar resumen de métricas e indicadores del período"
            >
              {exportingSummary ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
              )}
              Resumen CSV
            </button>
          </div>
        </div>
      </div>

      {/* Date Range Validation Error */}
      {hasInvalidDateRange && (
        <div
          role="alert"
          className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-4 py-3 text-sm flex items-center gap-2.5"
        >
          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <span>
            Rango de fechas inválido: la fecha inicial (<span className="font-mono tabular-nums">{dateFrom}</span>) debe ser anterior o igual a la fecha final (<span className="font-mono tabular-nums">{dateTo}</span>).
          </span>
        </div>
      )}

      {!hasInvalidDateRange && (isLoading ? (
        <div role="status" aria-label="Cargando reportes y analíticas" className="space-y-6">
          <span className="sr-only">Cargando reportes y analíticas...</span>

          {/* KPI Cards Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonKpiCard key={i} variant="stacked" />
            ))}
          </div>

          {/* Main Charts Row Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <SkeletonChart variant="bar" className="lg:col-span-2" />
            <SkeletonChart variant="donut" />
          </div>

          {/* Top Drivers Table Skeleton */}
          <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-48" />
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm text-slate-400">
                <thead className="bg-slate-950/60 border-y border-slate-800/80 text-xs uppercase text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Conductor</th>
                    <th className="px-4 py-3">Paquetes Entregados</th>
                    <th className="px-4 py-3">Eficiencia Est.</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  <SkeletonTableRows
                    rows={4}
                    cellClassName="px-4 py-3"
                    columns={['avatar-text', 'short', 'progress', 'pill']}
                  />
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="bg-slate-900 border border-red-500/20 rounded-xl p-10 text-center flex flex-col items-center justify-center gap-3"
        >
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm text-red-300">Error: {error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((stat, i) => (
              <div
                key={i}
                className="bg-slate-900 border border-slate-800/80 p-4 rounded-xl shadow-sm transition-colors hover:border-slate-700/80"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className={`p-2 rounded-lg ${stat.bg}`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <span className="text-xs font-semibold text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800/80">
                    {stat.change}
                  </span>
                </div>
                <div className="text-2xl font-bold text-white tabular-nums mb-1">{stat.value}</div>
                <div className="text-xs text-slate-400 uppercase tracking-wider font-medium">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Main Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Period Activity Bar Chart */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800/80 rounded-xl p-6 shadow-sm h-[400px] flex flex-col">
              <div className="flex items-center justify-between gap-2 mb-4 shrink-0">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-brand-400" />
                  Actividad del Período
                </h3>
                <span className="text-xs text-slate-400 tabular-nums">
                  {dateFrom || 'Inicio'} → {dateTo || 'Hoy'}
                </span>
              </div>

              {stats.weeklyActivity.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-center gap-2">
                  <BarChart3 className="h-9 w-9 opacity-25" />
                  <p className="text-sm font-medium text-slate-300">
                    Sin actividad en el rango seleccionado
                  </p>
                  <p className="text-xs text-slate-400">
                    Prueba ampliando el filtro de fechas para visualizar entregas diarias.
                  </p>
                </div>
              ) : (
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.weeklyActivity}>
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#1e293b',
                          color: '#f8fafc',
                          borderRadius: '0.5rem',
                        }}
                        itemStyle={{ color: '#e2e8f0' }}
                      />
                      <Legend wrapperStyle={{ paddingTop: '12px' }} />
                      <Bar dataKey="delivered" name="Entregados" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={50} />
                      <Bar dataKey="failed" name="Fallidos/Cancelados" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={50} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Zone Distribution Pie Chart */}
            <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-6 shadow-sm h-[400px] flex flex-col">
              <h3 className="text-base font-semibold text-white mb-2 flex items-center gap-2 shrink-0">
                <Package className="h-5 w-5 text-brand-400" />
                Distribución por Zona
              </h3>

              {stats.zoneDistribution.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-center gap-2">
                  <Package className="h-9 w-9 opacity-25" />
                  <p className="text-sm font-medium text-slate-300">Sin datos por zona</p>
                  <p className="text-xs text-slate-400">
                    No se registraron paquetes asignados a zonas en este período.
                  </p>
                </div>
              ) : (
                <div className="flex-1 min-h-0">
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
                        {stats.zoneDistribution.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#1e293b',
                          color: '#f8fafc',
                          borderRadius: '0.5rem',
                        }}
                      />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Top Drivers Table */}
          <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-6 shadow-sm">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-400" />
              Top Conductores ({periodBadge})
            </h3>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm text-slate-400">
                <thead className="bg-slate-950/60 border-y border-slate-800/80 text-xs uppercase text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Conductor</th>
                    <th className="px-4 py-3">Paquetes Entregados</th>
                    <th className="px-4 py-3">Eficiencia Est.</th>
                    <th className="px-4 py-3">Presencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {stats.topDrivers.length > 0 ? (
                    stats.topDrivers.map((driver, idx) => {
                      const isDriverOnline = Boolean(driver.driverId && locations.has(driver.driverId));
                      return (
                        <tr
                          key={driver.driverId || `${driver.name}-${idx}`}
                          className="hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold tabular-nums ring-1 ring-slate-700">
                              {idx + 1}
                            </div>
                            {driver.name}
                          </td>
                          <td className="px-4 py-3 text-brand-400 font-bold tabular-nums">
                            {driver.delivered}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500"
                                  style={{ width: `${Math.min(100, Math.max(0, driver.efficiency))}%` }}
                                />
                              </div>
                              <span className="text-emerald-400 tabular-nums">
                                {driver.efficiency}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={clsx(
                                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                                isDriverOnline
                                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                                  : 'bg-slate-800/80 border-slate-700/80 text-slate-300'
                              )}
                            >
                              <span
                                aria-hidden="true"
                                className={clsx(
                                  'h-1.5 w-1.5 rounded-full',
                                  isDriverOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                                )}
                              />
                              {isDriverOnline ? 'Online' : 'Registrado'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                        No hay datos suficientes en el período seleccionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ))}
    </div>
  );
}
