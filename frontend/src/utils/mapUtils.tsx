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
