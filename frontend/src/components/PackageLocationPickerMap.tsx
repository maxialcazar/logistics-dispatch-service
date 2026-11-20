import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Crosshair, MapPin } from 'lucide-react';
import type { Zone } from '../services/zoneService';
import {
  DARK_TILE_ATTRIBUTION,
  DARK_TILE_URL,
  createPackageIcon,
  extractZoneLatLngVertices,
  toValidNonZeroLatLng,
} from '../utils/mapUtils';

export type GeocodeStatus =
  | 'idle'
  | 'searching'
  | 'found'
  | 'manual'
  | 'not_found'
  | 'error';

interface PackageLocationPickerMapProps {
  lat: number | null;
  lng: number | null;
  onLocationChange: (lat: number, lng: number, source: 'map-click' | 'marker-drag') => void;
  selectedZone?: Zone | null;
  recipientAddress?: string;
  geocodeStatus: GeocodeStatus;
}

const NEUTRAL_WORLD_CENTER: [number, number] = [20, 0];
const NEUTRAL_WORLD_ZOOM = 2;

function MapClickHandler({
  onMapClick,
}: {
  onMapClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(event) {
      onMapClick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

interface ViewportControllerProps {
  pinCoords: [number, number] | null;
  zonePositions: [number, number][];
  zoneId: string;
  recenterTick: number;
  skipNextPinFlyRef: React.MutableRefObject<boolean>;
}

/**
 * Synchronizes the Leaflet viewport when coordinates change from geocoding/manual input,
 * when a zone polygon is selected without an active pin, or when recenter is triggered.
 */
function MapViewportController({
  pinCoords,
  zonePositions,
  zoneId,
  recenterTick,
  skipNextPinFlyRef,
}: ViewportControllerProps) {
  const map = useMap();
  const lastSignatureRef = useRef<string>('');

  useEffect(() => {
    const pinKey = pinCoords
      ? `${pinCoords[0].toFixed(6)},${pinCoords[1].toFixed(6)}`
      : 'no-pin';
    const signature = `${pinKey}|zone:${zoneId}|recenter:${recenterTick}`;

    if (lastSignatureRef.current === signature) {
      return;
    }
    lastSignatureRef.current = signature;

    if (pinCoords) {
      if (skipNextPinFlyRef.current) {
        skipNextPinFlyRef.current = false;
        if (map.getZoom() < 13) {
          map.setView(pinCoords, 15, { animate: true });
        }
        return;
      }
      const targetZoom = Math.max(map.getZoom(), 15);
      map.flyTo(pinCoords, targetZoom, { duration: 0.45 });
      return;
    }

    skipNextPinFlyRef.current = false;
    if (zonePositions.length >= 3) {
      map.fitBounds(L.latLngBounds(zonePositions), {
        padding: [28, 28],
        maxZoom: 14,
        animate: true,
      });
    }
  }, [map, pinCoords, zonePositions, zoneId, recenterTick, skipNextPinFlyRef]);

  return null;
}

/**
 * Interactive dark-mode Leaflet map preview allowing operators to inspect geocoded
 * delivery coordinates, click anywhere to place a pin, or drag the pin for precision.
 */
export function PackageLocationPickerMap({
  lat,
  lng,
  onLocationChange,
  selectedZone,
  recipientAddress,
  geocodeStatus,
}: PackageLocationPickerMapProps) {
  const [recenterTick, setRecenterTick] = useState(0);
  const skipNextPinFlyRef = useRef(false);

  const pinCoords = useMemo(() => toValidNonZeroLatLng(lat, lng), [lat, lng]);

  const zonePositions = useMemo(() => {
    return extractZoneLatLngVertices(selectedZone);
  }, [selectedZone]);

  const pinIcon = useMemo(() => createPackageIcon('#0ea5e9'), []);

  const handleMapClick = (nextLat: number, nextLng: number) => {
    skipNextPinFlyRef.current = true;
    onLocationChange(nextLat, nextLng, 'map-click');
  };

  const handleMarkerDragEnd = (event: L.DragEndEvent) => {
    const marker = event.target as L.Marker;
    const position = marker.getLatLng();
    skipNextPinFlyRef.current = true;
    onLocationChange(position.lat, position.lng, 'marker-drag');
  };

  const canRecenter = pinCoords !== null || zonePositions.length >= 3;

  return (
    <div className="relative h-[260px] sm:h-[300px] lg:h-[320px] w-full rounded-xl overflow-hidden border border-slate-800/80 bg-slate-950 z-0">
      <MapContainer
        center={pinCoords ?? NEUTRAL_WORLD_CENTER}
        zoom={pinCoords ? 15 : NEUTRAL_WORLD_ZOOM}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
        className="bg-slate-950 cursor-crosshair"
      >
        <TileLayer attribution={DARK_TILE_ATTRIBUTION} url={DARK_TILE_URL} />

        <MapClickHandler onMapClick={handleMapClick} />

        <MapViewportController
          pinCoords={pinCoords}
          zonePositions={zonePositions}
          zoneId={selectedZone?.id ?? ''}
          recenterTick={recenterTick}
          skipNextPinFlyRef={skipNextPinFlyRef}
        />

        {zonePositions.length >= 3 && (
          <Polygon
            positions={zonePositions}
            pathOptions={{
              color: '#38bdf8',
              fillColor: '#0ea5e9',
              fillOpacity: 0.1,
              weight: 1.5,
              dashArray: '4 4',
            }}
          />
        )}

        {pinCoords && (
          <Marker
            position={pinCoords}
            icon={pinIcon}
            draggable={true}
            eventHandlers={{
              dragend: handleMarkerDragEnd,
            }}
          >
            <Popup className="custom-popup-dark" maxWidth={260}>
              <div className="p-0.5 min-w-[175px] space-y-1.5">
                <div className="flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
                  <MapPin className="h-3.5 w-3.5 text-brand-400 shrink-0" />
                  <span className="text-xs font-semibold text-slate-100">
                    Punto de entrega
                  </span>
                </div>
                {recipientAddress && (
                  <p className="text-xs text-slate-300 leading-snug">
                    {recipientAddress}
                  </p>
                )}
                <p className="text-[11px] font-mono tabular-nums text-slate-300">
                  {pinCoords[0].toFixed(6)}, {pinCoords[1].toFixed(6)}
                </p>
                <p className="text-[11px] text-slate-400">
                  Arrastra este marcador para ajustar con precisión.
                </p>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {canRecenter && (
        <button
          type="button"
          onClick={() => {
            skipNextPinFlyRef.current = false;
            setRecenterTick((prev) => prev + 1);
          }}
          aria-label="Centrar vista del mapa"
          className="absolute top-2.5 right-2.5 z-[1000] inline-flex min-h-[44px] sm:min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-slate-200 shadow-lg hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
        >
          <Crosshair className="h-3.5 w-3.5 text-brand-400" />
          <span>Centrar</span>
        </button>
      )}

      <div className="pointer-events-none absolute bottom-2.5 left-2.5 right-2.5 z-[1000] flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800/80 bg-slate-900/90 backdrop-blur-md px-2.5 py-1 text-[11px] text-slate-200 shadow-lg">
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${
              geocodeStatus === 'searching'
                ? 'bg-amber-400 animate-pulse'
                : pinCoords
                  ? 'bg-emerald-400'
                  : 'bg-slate-400'
            }`}
          />
          {pinCoords
            ? 'Clic en el mapa o arrastra el pin para ajustar'
            : 'Haz clic en el mapa para fijar el pin manualmente'}
        </span>
      </div>
    </div>
  );
}
