
import { useEffect, useRef, useState } from 'react';
import { Marker } from 'react-leaflet';
import type { MarkerProps } from 'react-leaflet';
import L from 'leaflet';

const POSITION_EPSILON = 1e-6;
const LERP_SPEED = 3.5;

function extractLatLng(position: L.LatLngExpression): [number, number] | null {
  try {
    const parsed = L.latLng(position);
    if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
      return [parsed.lat, parsed.lng];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * SmoothMarker: A wrapper for react-leaflet Marker that animates position updates.
 * Instead of jumping instantly to new coordinates, it interpolates movement
 * on animation frames (60fps) using delta-time ease-out smoothing and stops when settled.
 */
export function SmoothMarker({ position, ...props }: MarkerProps) {
  const markerRef = useRef<L.Marker | null>(null);
  const resolvedTarget = extractLatLng(position);
  const targetLat = resolvedTarget?.[0] ?? null;
  const targetLng = resolvedTarget?.[1] ?? null;

  // Lock the initial 'position' prop so react-leaflet does not snap the marker
  // back while we interpolate imperatively via markerRef.
  const [initialPosition] = useState<L.LatLngExpression>(
    () => resolvedTarget ?? position
  );

  useEffect(() => {
    if (targetLat === null || targetLng === null) return;
    const marker = markerRef.current;
    if (!marker) return;

    const currentLatLng = marker.getLatLng();
    if (
      Math.abs(currentLatLng.lat - targetLat) <= POSITION_EPSILON &&
      Math.abs(currentLatLng.lng - targetLng) <= POSITION_EPSILON
    ) {
      if (currentLatLng.lat !== targetLat || currentLatLng.lng !== targetLng) {
        marker.setLatLng([targetLat, targetLng]);
      }
      return;
    }

    let isCancelled = false;
    let animationFrameId: number | null = null;
    let lastTimestamp = performance.now();

    const animate = (now: number) => {
      if (isCancelled) return;
      const activeMarker = markerRef.current;
      if (!activeMarker) return;

      const dt = Math.min(Math.max((now - lastTimestamp) / 1000, 0), 0.1);
      lastTimestamp = now;

      const pos = activeMarker.getLatLng();
      const deltaLat = targetLat - pos.lat;
      const deltaLng = targetLng - pos.lng;

      if (
        Math.abs(deltaLat) <= POSITION_EPSILON &&
        Math.abs(deltaLng) <= POSITION_EPSILON
      ) {
        activeMarker.setLatLng([targetLat, targetLng]);
        animationFrameId = null;
        return;
      }

      // Frame-rate independent ease-out interpolation (~0.056 step at 60fps).
      const factor = dt > 0 ? 1 - Math.exp(-LERP_SPEED * dt) : 1 - Math.exp(-LERP_SPEED / 60);
      const nextLat = pos.lat + deltaLat * factor;
      const nextLng = pos.lng + deltaLng * factor;

      if (
        Math.abs(targetLat - nextLat) <= POSITION_EPSILON &&
        Math.abs(targetLng - nextLng) <= POSITION_EPSILON
      ) {
        activeMarker.setLatLng([targetLat, targetLng]);
        animationFrameId = null;
        return;
      }

      activeMarker.setLatLng([nextLat, nextLng]);
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      isCancelled = true;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [targetLat, targetLng]);

  return <Marker ref={markerRef} position={initialPosition} {...props} />;
}
