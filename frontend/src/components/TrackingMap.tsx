import { useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, MapPin, Package, Radio, RefreshCw, Truck } from 'lucide-react';
import { SmoothMarker } from './SmoothMarker';
import { MapFitBounds } from './MapFitBounds';
import {
  DARK_TILE_ATTRIBUTION,
  DARK_TILE_URL,
  DEFAULT_MAP_CENTER,
  createDriverIcon,
  createPackageIcon,
  toValidNonZeroLatLng,
} from '../utils/mapUtils';
import { getPackageStatusToken, type PackageStatus } from '../utils/packageStatus';

export type TrackingStreamState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closed';

interface TrackingMapProps {
  trackingCode: string;
  status: PackageStatus;
  recipientAddress: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  driverLat: number | null;
  driverLng: number | null;
  driverUpdatedLabel: string;
  streamState: TrackingStreamState;
  onRetryStream?: () => void;
}

/**
 * Public live tracking map showing the delivery destination pin (when geocoded)
 * and the real-time SSE driver position interpolated via SmoothMarker.
 */
export function TrackingMap({
  trackingCode,
  status,
  recipientAddress,
  deliveryLat,
  deliveryLng,
  driverLat,
  driverLng,
  driverUpdatedLabel,
  streamState,
  onRetryStream,
}: TrackingMapProps) {
  const [recenterTick, setRecenterTick] = useState(0);

  const deliveryCoords = useMemo(
    () => toValidNonZeroLatLng(deliveryLat, deliveryLng),
    [deliveryLat, deliveryLng]
  );

  const driverCoords = useMemo(
    () => (status === 'in_transit' ? toValidNonZeroLatLng(driverLat, driverLng) : null),
    [status, driverLat, driverLng]
  );

  const statusToken = getPackageStatusToken(status);

  const driverIcon = useMemo(() => createDriverIcon('online'), []);
  const packageIcon = useMemo(
    () => createPackageIcon(statusToken.hexColor),
    [statusToken.hexColor]
  );

  const { boundsPoints, boundsSignature } = useMemo(() => {
    const pts: [number, number][] = [];
    if (deliveryCoords) pts.push(deliveryCoords);
    if (driverCoords) pts.push(driverCoords);

    const deliveryKey = deliveryCoords
      ? `${deliveryCoords[0].toFixed(5)},${deliveryCoords[1].toFixed(5)}`
      : 'none';
    const driverStateKey = driverCoords ? 'driver-live' : 'driver-none';

    return {
      boundsPoints: pts,
      boundsSignature: `${trackingCode}|${deliveryKey}|${driverStateKey}|${recenterTick}`,
    };
  }, [trackingCode, deliveryCoords, driverCoords, recenterTick]);

  if (boundsPoints.length === 0) {
    const isInTransit = status === 'in_transit';

    return (
      <div className="rounded-xl border border-dashed border-slate-800/80 bg-slate-950/70 p-6 sm:p-8 min-h-[240px] flex flex-col items-center justify-center text-center gap-3">
        <div
          className={`h-11 w-11 rounded-xl border flex items-center justify-center ${
            isInTransit
              ? 'bg-brand-500/10 border-brand-500/30 text-brand-400'
              : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          {isInTransit ? (
            <Radio className="h-5 w-5 animate-pulse" />
          ) : (
            <MapPin className="h-5 w-5" />
          )}
        </div>
        <div className="space-y-1 max-w-md">
          <h4 className="text-sm font-semibold text-white">
            {isInTransit
              ? 'Esperando señal GPS del repartidor'
              : 'Mapa de entrega no disponible'}
          </h4>
          <p className="text-xs text-slate-400 leading-relaxed">
            {isInTransit
              ? `El mapa interactivo se activará automáticamente en cuanto la unidad asignada transmita su ubicación hacia ${recipientAddress}.`
              : `Este envío aún no cuenta con coordenadas geográficas registradas para ubicar el punto de entrega (${recipientAddress}).`}
          </p>
        </div>
        {isInTransit && streamState === 'closed' && onRetryStream && (
          <button
            type="button"
            onClick={onRetryStream}
            className="mt-1 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/20 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Reintentar conexión</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-[300px] sm:h-[380px] w-full rounded-xl overflow-hidden border border-slate-800/80 bg-slate-950 z-0">
      <MapContainer
        key={trackingCode}
        center={driverCoords ?? deliveryCoords ?? DEFAULT_MAP_CENTER}
        zoom={14}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
        className="bg-slate-950"
      >
        <TileLayer attribution={DARK_TILE_ATTRIBUTION} url={DARK_TILE_URL} />

        <MapFitBounds points={boundsPoints} signature={boundsSignature} maxZoom={15} />

        {deliveryCoords && (
          <Marker position={deliveryCoords} icon={packageIcon}>
            <Popup className="custom-popup-dark" maxWidth={260}>
              <div className="p-0.5 min-w-[170px] space-y-1.5">
                <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                    <Package className="h-3.5 w-3.5 text-brand-400 shrink-0" />
                    Destino de entrega
                  </span>
                  <span
                    className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border ${statusToken.badgeClass}`}
                  >
                    {statusToken.label}
                  </span>
                </div>
                <p className="text-xs font-mono tabular-nums text-brand-300 font-semibold">
                  {trackingCode}
                </p>
                <p className="text-xs text-slate-300 leading-snug">
                  {recipientAddress}
                </p>
                <p className="text-[11px] font-mono tabular-nums text-slate-400 pt-0.5">
                  {deliveryCoords[0].toFixed(5)}, {deliveryCoords[1].toFixed(5)}
                </p>
              </div>
            </Popup>
          </Marker>
        )}

        {driverCoords && (
          <SmoothMarker
            key={trackingCode}
            position={driverCoords}
            icon={driverIcon}
          >
            <Popup className="custom-popup-dark" maxWidth={260}>
              <div className="p-0.5 min-w-[175px] space-y-1.5">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                    <Truck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    Repartidor en camino
                  </span>
                </div>
                <p className="text-xs text-slate-300 tabular-nums">
                  Actualizado: <span className="text-slate-100">{driverUpdatedLabel}</span>
                </p>
                <p className="text-[11px] font-mono tabular-nums text-slate-400">
                  {driverCoords[0].toFixed(5)}, {driverCoords[1].toFixed(5)}
                </p>
              </div>
            </Popup>
          </SmoothMarker>
        )}
      </MapContainer>

      {/* Recenter button */}
      <button
        type="button"
        onClick={() => setRecenterTick((prev) => prev + 1)}
        aria-label="Centrar mapa"
        className="absolute top-3 right-3 z-[1000] inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-slate-200 shadow-lg hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
      >
        <Crosshair className="h-3.5 w-3.5 text-brand-400" />
        <span>Centrar</span>
      </button>

      {/* Compact map legend */}
      <div className="pointer-events-none absolute bottom-7 left-3 sm:bottom-3 z-[1000] max-w-[calc(100%-1.5rem)] sm:max-w-[calc(100%-11rem)] rounded-lg border border-slate-800/80 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 shadow-xl flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-200">
        {deliveryCoords && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm border border-white/80 shrink-0"
              style={{ backgroundColor: statusToken.hexColor }}
            />
            <span>Destino</span>
          </span>
        )}
        {driverCoords ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-300 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span>Repartidor en vivo</span>
          </span>
        ) : (
          status === 'in_transit' && (
            <span className="inline-flex items-center gap-1.5 text-slate-300">
              <span className="h-2 w-2 rounded-full bg-brand-400 animate-pulse shrink-0" />
              <span>Esperando señal GPS...</span>
            </span>
          )
        )}
      </div>
    </div>
  );
}
