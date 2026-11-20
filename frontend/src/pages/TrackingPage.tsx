import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  LogIn,
  MapPin,
  Package,
  Radio,
  Search,
  Truck,
  XCircle,
} from 'lucide-react';
import { Skeleton } from '../components/Skeleton';

export type TrackingStatus =
  | 'pending'
  | 'assigned'
  | 'in_transit'
  | 'delivered'
  | 'cancelled';

export interface PublicTrackingData {
  trackingCode: string;
  status: TrackingStatus;
  recipientAddress: string;
  lat: number | null;
  lng: number | null;
  estimatedDeliveryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LiveLocationUpdate {
  lat: number;
  lng: number;
  timestamp: string | number;
}

type StreamState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

const STATUS_CONFIG: Record<
  TrackingStatus,
  { label: string; badgeClass: string; description: string }
> = {
  pending: {
    label: 'Pendiente',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    description: 'Tu envío fue registrado y espera asignación de unidad.',
  },
  assigned: {
    label: 'Asignado',
    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    description: 'Un conductor fue asignado y preparará la salida.',
  },
  in_transit: {
    label: 'En Camino',
    badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    description: 'El paquete se encuentra en ruta hacia el destino.',
  },
  delivered: {
    label: 'Entregado',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    description: 'El paquete fue entregado en la dirección indicada.',
  },
  cancelled: {
    label: 'Cancelado',
    badgeClass: 'bg-red-500/15 text-red-300 border-red-500/30',
    description: 'Este envío fue cancelado. Contacta al remitente para más detalles.',
  },
};

const TIMELINE_STEPS: Array<{
  key: Exclude<TrackingStatus, 'cancelled'>;
  label: string;
  icon: typeof Package;
}> = [
  { key: 'pending', label: 'Registrado', icon: Package },
  { key: 'assigned', label: 'Asignado', icon: Clock },
  { key: 'in_transit', label: 'En Camino', icon: Truck },
  { key: 'delivered', label: 'Entregado', icon: CheckCircle2 },
];

function formatDateTime(value: string | number | null): string {
  if (value === null || value === '') return 'No disponible';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No disponible';
  return parsed.toLocaleString('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function parseLiveLocationEvent(raw: string): LiveLocationUpdate | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const record = parsed as Record<string, unknown>;
    if (
      typeof record.lat !== 'number' ||
      !Number.isFinite(record.lat) ||
      typeof record.lng !== 'number' ||
      !Number.isFinite(record.lng)
    ) {
      return null;
    }

    const timestamp =
      typeof record.timestamp === 'string' || typeof record.timestamp === 'number'
        ? record.timestamp
        : Date.now();

    return {
      lat: record.lat,
      lng: record.lng,
      timestamp,
    };
  } catch {
    return null;
  }
}

export function TrackingPage() {
  const { trackingCode: paramCode } = useParams<{ trackingCode?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlCode = (paramCode ?? searchParams.get('code') ?? '').trim();

  const [queryInput, setQueryInput] = useState(urlCode);
  const [refreshTick, setRefreshTick] = useState(0);
  const [trackingData, setTrackingData] = useState<PublicTrackingData | null>(null);
  const [liveLocation, setLiveLocation] = useState<LiveLocationUpdate | null>(null);
  const [streamState, setStreamState] = useState<StreamState>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTracking = useCallback(async (code: string, signal: AbortSignal) => {
    const cleanCode = code.trim();
    if (!cleanCode) return;

    setLoading(true);
    setError(null);
    setLiveLocation(null);

    try {
      const response = await fetch(
        `/api/public/track/${encodeURIComponent(cleanCode)}`,
        { signal }
      );

      if (signal.aborted) return;

      if (response.status === 404) {
        setTrackingData(null);
        setError(`No encontramos ningún envío con el código "${cleanCode}". Verifica el código e intenta nuevamente.`);
        return;
      }

      if (!response.ok) {
        throw new Error('No pudimos consultar el estado del envío en este momento.');
      }

      const data: PublicTrackingData = await response.json();
      if (signal.aborted) return;
      setTrackingData(data);
    } catch (err: unknown) {
      if (signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        return;
      }
      setTrackingData(null);
      setError(
        err instanceof Error
          ? err.message
          : 'Ocurrió un error de conexión al consultar el seguimiento.'
      );
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    setQueryInput(urlCode);
    if (!urlCode) {
      setLoading(false);
      setTrackingData(null);
      setError(null);
      setLiveLocation(null);
      setStreamState('idle');
      return;
    }

    const controller = new AbortController();
    fetchTracking(urlCode, controller.signal);
    return () => controller.abort();
  }, [urlCode, refreshTick, fetchTracking]);

  const activeTrackingCode = trackingData?.trackingCode;
  const activeStatus = trackingData?.status;

  useEffect(() => {
    if (!activeTrackingCode || activeStatus !== 'in_transit') {
      setStreamState('idle');
      return;
    }

    setStreamState('connecting');
    const eventSource = new EventSource(
      `/api/public/track/${encodeURIComponent(activeTrackingCode)}/stream`
    );

    eventSource.onopen = () => {
      setStreamState('connected');
    };

    eventSource.onmessage = (event) => {
      const update = parseLiveLocationEvent(event.data);
      if (update) {
        setStreamState('connected');
        setLiveLocation(update);
      }
    };

    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        setStreamState('closed');
        eventSource.close();
      } else {
        setStreamState('reconnecting');
      }
    };

    return () => {
      eventSource.close();
      setStreamState('idle');
    };
  }, [activeTrackingCode, activeStatus, refreshTick]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = queryInput.trim();
    if (!trimmed) {
      setError('Ingresa un código de seguimiento válido para realizar la búsqueda.');
      return;
    }

    if (trimmed === urlCode) {
      setRefreshTick((prev) => prev + 1);
    } else {
      navigate(`/tracking/${encodeURIComponent(trimmed)}`);
    }
  };

  const activeStepIndex =
    trackingData && trackingData.status !== 'cancelled'
      ? TIMELINE_STEPS.findIndex((step) => step.key === trackingData.status)
      : -1;

  const statusMeta = trackingData ? STATUS_CONFIG[trackingData.status] : null;
  const currentLat = liveLocation?.lat ?? trackingData?.lat ?? null;
  const currentLng = liveLocation?.lng ?? trackingData?.lng ?? null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-4 flex items-center justify-between gap-4">
          <Link
            to="/tracking"
            className="flex items-center gap-3 text-white hover:opacity-90 transition-opacity"
          >
            <div className="h-10 w-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <Package className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <span className="block text-base font-bold tracking-tight">
                Logistics <span className="text-blue-400">OS</span>
              </span>
              <span className="block text-xs text-slate-400">Seguimiento Público de Envíos</span>
            </div>
          </Link>

          <Link
            to="/login"
            className="inline-flex min-h-[48px] items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogIn className="h-4 w-4 text-slate-400" />
            <span>Portal Operadores</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-8 sm:py-12 space-y-8">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8 shadow-2xl">
          <div className="max-w-2xl space-y-2 mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Rastrea tu paquete en tiempo real
            </h1>
            <p className="text-sm text-slate-400">
              Ingresa tu código de seguimiento para consultar el estado actual y la ubicación estimada de tu entrega.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <label htmlFor="tracking-code-input" className="sr-only">
                Código de seguimiento
              </label>
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                id="tracking-code-input"
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Ej. PKG-2026-001"
                autoComplete="off"
                className="block w-full min-h-[48px] rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Search className="h-4 w-4" />
              <span>{loading ? 'Buscando...' : 'Rastrear Envío'}</span>
            </button>
          </form>
        </section>

        {loading && (
          <section
            aria-label="Cargando estado del envío"
            className="rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8 space-y-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-7 w-48" />
              </div>
              <Skeleton className="h-8 w-28 rounded-full" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          </section>
        )}

        {!loading && error && (
          <section
            role="alert"
            className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 flex items-start gap-4 text-red-300"
          >
            <AlertCircle className="h-6 w-6 shrink-0 text-red-400 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-red-200">No se encontró información</h2>
              <p className="text-sm text-red-300/90">{error}</p>
            </div>
          </section>
        )}

        {!loading && !error && !trackingData && (
          <section className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-8 sm:p-10 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center">
              <Package className="h-6 w-6 text-slate-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Consulta el estado de tu entrega</h2>
            <p className="mx-auto max-w-md text-sm text-slate-400">
              Escribe el código proporcionado por tu remitente en el buscador superior para ver el historial de etapas y la última actualización disponible.
            </p>
          </section>
        )}

        {!loading && !error && trackingData && statusMeta && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8 shadow-xl space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-800 pb-6">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Código de seguimiento
                </p>
                <h2 className="text-2xl font-bold tracking-tight text-white font-mono">
                  {trackingData.trackingCode}
                </h2>
                <p className="text-sm text-slate-400">{statusMeta.description}</p>
              </div>

              <span
                className={`inline-flex items-center self-start rounded-full border px-3.5 py-1.5 text-xs font-semibold ${statusMeta.badgeClass}`}
              >
                {statusMeta.label}
              </span>
            </div>

            {trackingData.status === 'cancelled' ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 flex items-center gap-3">
                <XCircle className="h-5 w-5 text-red-400 shrink-0" />
                <p className="text-sm text-red-200">
                  El envío fue marcado como cancelado el {formatDateTime(trackingData.updatedAt)}.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Progreso del envío
                </h3>
                <ol className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  {TIMELINE_STEPS.map((step, index) => {
                    const Icon = step.icon;
                    const isCompleted = activeStepIndex >= index;
                    const isCurrent = activeStepIndex === index;

                    return (
                      <li
                        key={step.key}
                        className={`rounded-xl border p-4 transition-colors ${
                          isCurrent
                            ? 'border-blue-500/50 bg-blue-500/10'
                            : isCompleted
                              ? 'border-emerald-500/30 bg-emerald-500/5'
                              : 'border-slate-800 bg-slate-950/60'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                              isCurrent
                                ? 'bg-blue-500/20 text-blue-400'
                                : isCompleted
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-slate-800 text-slate-500'
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <p
                              className={`text-sm font-semibold ${
                                isCompleted ? 'text-white' : 'text-slate-400'
                              }`}
                            >
                              {step.label}
                            </p>
                            <p className="text-xs text-slate-400">
                              {isCurrent ? 'Etapa actual' : isCompleted ? 'Completado' : 'Pendiente'}
                            </p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                  <MapPin className="h-4 w-4 text-blue-400" />
                  <span>Destino de entrega</span>
                </div>
                <p className="text-sm font-medium text-white">
                  {trackingData.recipientAddress}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                  <Clock className="h-4 w-4 text-blue-400" />
                  <span>Última actualización</span>
                </div>
                <p className="text-sm font-medium text-white">
                  {formatDateTime(liveLocation?.timestamp ?? trackingData.updatedAt)}
                </p>
                {trackingData.estimatedDeliveryAt && (
                  <p className="text-xs text-slate-400">
                    Entrega estimada: {formatDateTime(trackingData.estimatedDeliveryAt)}
                  </p>
                )}
              </div>
            </div>

            {trackingData.status === 'in_transit' && (
              <div
                className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  streamState === 'closed'
                    ? 'border-amber-500/30 bg-amber-500/10'
                    : 'border-blue-500/20 bg-blue-500/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Radio
                    className={`h-5 w-5 shrink-0 ${
                      streamState === 'closed'
                        ? 'text-amber-400'
                        : 'text-blue-400 animate-pulse'
                    }`}
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {streamState === 'closed'
                        ? 'Transmisión en vivo interrumpida'
                        : streamState === 'reconnecting'
                          ? 'Reconectando monitoreo en vivo...'
                          : streamState === 'connecting'
                            ? 'Conectando monitoreo en vivo...'
                            : 'Monitoreo en vivo activo'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {streamState === 'closed'
                        ? 'La conexión en tiempo real se cerró. Pulsa "Rastrear Envío" para reintentar.'
                        : currentLat !== null && currentLng !== null
                          ? `Última posición reportada: ${currentLat.toFixed(5)}, ${currentLng.toFixed(5)}`
                          : 'Esperando señal GPS de la unidad asignada...'}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-xs font-medium self-start sm:self-center ${
                    streamState === 'closed'
                      ? 'text-amber-300'
                      : streamState === 'reconnecting' || streamState === 'connecting'
                        ? 'text-slate-300'
                        : 'text-blue-300'
                  }`}
                >
                  {streamState === 'closed'
                    ? 'Desconectado'
                    : streamState === 'reconnecting'
                      ? 'Reconectando'
                      : streamState === 'connecting'
                        ? 'Conectando'
                        : 'Tiempo real (SSE)'}
                </span>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
