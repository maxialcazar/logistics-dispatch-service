import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

interface MapFitBoundsProps {
  points: [number, number][];
  signature: string;
  padding?: [number, number];
  maxZoom?: number;
}

/**
 * Automatically fits the Leaflet map viewport to the supplied coordinates whenever
 * the signature changes, avoiding redundant re-fits when user pans manually.
 */
export function MapFitBounds({
  points,
  signature,
  padding = [50, 50],
  maxZoom = 15,
}: MapFitBoundsProps) {
  const map = useMap();
  const lastFitSignatureRef = useRef<string>('');

  useEffect(() => {
    if (points.length === 0) {
      lastFitSignatureRef.current = '';
      return;
    }
    if (lastFitSignatureRef.current === signature) return;

    lastFitSignatureRef.current = signature;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding, maxZoom, animate: true });
  }, [map, points, signature, padding, maxZoom]);

  return null;
}
