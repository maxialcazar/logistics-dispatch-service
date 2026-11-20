import L from 'leaflet';
import { Package, Truck } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';

export const DEFAULT_MAP_CENTER: [number, number] = [-31.416, -64.186]; // Córdoba, Argentina (vista inicial por defecto)
export const DARK_TILE_URL =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
export const DARK_TILE_ATTRIBUTION = '&copy; CARTO';

/**
 * Validates that a coordinate pair consists of finite numbers within WGS84 lat/lng bounds.
 */
export function toValidLatLng(lat: unknown, lng: unknown): [number, number] | null {
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  ) {
    return [lat, lng];
  }
  return null;
}

/**
 * Validates finite WGS84 coordinates and rejects the sentinel (0, 0) coordinate.
 */
export function toValidNonZeroLatLng(
  lat: unknown,
  lng: unknown
): [number, number] | null {
  const coords = toValidLatLng(lat, lng);
  if (!coords || (coords[0] === 0 && coords[1] === 0)) {
    return null;
  }
  return coords;
}

const COORD_EPSILON = 1e-9;

function areLatLngEqual(a: [number, number], b: [number, number]): boolean {
  return (
    Math.abs(a[0] - b[0]) < COORD_EPSILON && Math.abs(a[1] - b[1]) < COORD_EPSILON
  );
}

function parseZonePointToLatLng(point: unknown): [number, number] | null {
  if (Array.isArray(point) && point.length >= 2) {
    // Backend GeoJSON ring pairs are ordered [lng, lat]
    return toValidLatLng(point[1], point[0]);
  }
  if (point && typeof point === 'object') {
    const candidate = point as { lat?: unknown; lng?: unknown };
    return toValidLatLng(candidate.lat, candidate.lng);
  }
  return null;
}

function normalizeOpenLatLngVertices(rawPoints: [number, number][]): [number, number][] {
  const deduped: [number, number][] = [];
  for (const pt of rawPoints) {
    const prev = deduped[deduped.length - 1];
    if (!prev || !areLatLngEqual(prev, pt)) {
      deduped.push(pt);
    }
  }
  if (deduped.length >= 2 && areLatLngEqual(deduped[0], deduped[deduped.length - 1])) {
    deduped.pop();
  }
  return deduped;
}

/**
 * Extracts Leaflet-ordered [lat, lng] vertices from a zone's backend GeoJSON
 * `polygon` ([lng, lat][]) or legacy `coordinates` ({ lat, lng }[]), stripping
 * any duplicate closing vertex so editing handles represent distinct corners.
 */
export function extractZoneLatLngVertices(
  zone?: { polygon?: unknown; coordinates?: unknown } | null
): [number, number][] {
  if (!zone) return [];

  const source = Array.isArray(zone.polygon)
    ? zone.polygon
    : Array.isArray(zone.coordinates)
      ? zone.coordinates
      : null;

  if (!source) return [];

  const parsed = source
    .map(parseZonePointToLatLng)
    .filter((pt): pt is [number, number] => pt !== null);

  return normalizeOpenLatLngVertices(parsed);
}

/**
 * Converts Leaflet-ordered [lat, lng] vertices into a closed GeoJSON ring of
 * [lng, lat] tuples for POST/PATCH /api/zones. Returns null when fewer than 3
 * distinct valid vertices exist.
 */
export function toGeoJsonPolygonRing(
  vertices: [number, number][]
): [number, number][] | null {
  const validVertices = vertices
    .map((pt) => toValidLatLng(pt[0], pt[1]))
    .filter((pt): pt is [number, number] => pt !== null);

  const distinct = normalizeOpenLatLngVertices(validVertices);
  if (distinct.length < 3) {
    return null;
  }

  const ring: [number, number][] = distinct.map(([lat, lng]) => [lng, lat]);
  ring.push([ring[0][0], ring[0][1]]);
  return ring;
}

/**
 * Creates a touch-friendly numbered vertex marker icon for the zone polygon editor.
 */
export function createZoneVertexIcon(index: number, isFirst: boolean): L.DivIcon {
  const ringStyle = isFirst
    ? 'bg-emerald-700 border-emerald-200 ring-2 ring-emerald-400/50'
    : 'bg-brand-700 border-white ring-2 ring-brand-400/40';

  return L.divIcon({
    className: 'custom-zone-vertex-icon',
    html: `<div class="w-11 h-11 flex items-center justify-center cursor-grab active:cursor-grabbing"><div class="w-6 h-6 rounded-full border-2 ${ringStyle} text-white font-mono text-[11px] font-bold flex items-center justify-center shadow-lg">${index + 1}</div></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -16],
  });
}

/**
 * Creates a memoizable Leaflet DivIcon representing a fleet or delivery driver.
 */
export function createDriverIcon(status: 'online' | 'offline'): L.DivIcon {
  const isOnline = status === 'online';
  const colorBg = isOnline ? 'bg-emerald-600' : 'bg-slate-600';
  const colorPulse = isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500 hidden';

  const html = renderToStaticMarkup(
    <div className="relative flex items-center justify-center w-8 h-8">
      <div className={`absolute inset-0 rounded-full opacity-25 ${colorPulse}`} />
      <div
        className={`relative z-10 p-1.5 rounded-full border-2 border-white shadow-lg ${colorBg}`}
      >
        <Truck color="white" size={14} />
      </div>
    </div>
  );

  return L.divIcon({
    className: 'custom-driver-icon-v2',
    html,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

/**
 * Creates a memoizable Leaflet DivIcon representing a package destination pin.
 */
export function createPackageIcon(hexColor: string): L.DivIcon {
  const html = renderToStaticMarkup(
    <div className="relative flex items-center justify-center w-6 h-6">
      <div
        className="absolute inset-0 rounded-sm opacity-45"
        style={{ backgroundColor: hexColor }}
      />
      <div
        className="relative z-10 p-1 rounded-sm border border-white/90 shadow-sm"
        style={{ backgroundColor: hexColor }}
      >
        <Package color="white" size={12} />
      </div>
    </div>
  );

  return L.divIcon({
    className: 'custom-package-icon',
    html,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
}
