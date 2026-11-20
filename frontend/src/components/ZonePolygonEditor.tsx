import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Layers,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react';
import clsx from 'clsx';
import type { Zone } from '../services/zoneService';
import {
  DARK_TILE_ATTRIBUTION,
  DARK_TILE_URL,
  DEFAULT_MAP_CENTER,
  createZoneVertexIcon,
  extractZoneLatLngVertices,
} from '../utils/mapUtils';

interface ZonePolygonEditorProps {
  /** Editable polygon vertices in Leaflet [lat, lng] order */
  vertices: [number, number][];
  onChange: (nextVertices: [number, number][]) => void;
  /** Sibling zones shown as non-interactive reference boundaries */
  referenceZones?: Zone[];
  hasError?: boolean;
  heightClassName?: string;
}

function MapResizeInvalidator() {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize({ animate: false });
    }, 120);

    const container = map.getContainer();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        map.invalidateSize({ animate: false });
      });
      observer.observe(container);
    }

    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, [map]);

  return null;
}

function MapClickAddVertex({
  onAddVertex,
}: {
  onAddVertex: (vertex: [number, number]) => void;
}) {
  useMapEvents({
    click(event) {
      const wrapped = event.latlng.wrap();
      onAddVertex([wrapped.lat, wrapped.lng]);
    },
  });
  return null;
}

interface EditorViewportControllerProps {
  vertices: [number, number][];
  referencePositions: [number, number][];
  fitTick: number;
}

/**
 * Fits the editor map once on mount to the zone's existing polygon (or sibling zones)
 * and re-centers only when explicitly requested by the user.
 */
function EditorViewportController({
  vertices,
  referencePositions,
  fitTick,
}: EditorViewportControllerProps) {
  const map = useMap();
  const initializedRef = useRef(false);
  const lastFitTickRef = useRef(fitTick);

  useEffect(() => {
    const isInitial = !initializedRef.current;
    const isManualRecenter = fitTick !== lastFitTickRef.current;
    if (!isInitial && !isManualRecenter) {
      return;
    }

    initializedRef.current = true;
    lastFitTickRef.current = fitTick;

    map.invalidateSize({ animate: false });

    if (vertices.length >= 2) {
      map.fitBounds(L.latLngBounds(vertices), {
        padding: [36, 36],
        maxZoom: 15,
        animate: !isInitial,
      });
      return;
    }

    if (vertices.length === 1) {
      map.setView(vertices[0], 14, { animate: !isInitial });
      return;
    }

    if (referencePositions.length >= 2) {
      map.fitBounds(L.latLngBounds(referencePositions), {
        padding: [36, 36],
        maxZoom: 14,
        animate: !isInitial,
      });
      return;
    }

    if (isManualRecenter) {
      map.setView(DEFAULT_MAP_CENTER, 12, { animate: true });
    }
  }, [map, vertices, referencePositions, fitTick]);

  return null;
}

interface VertexMarkerProps {
  position: [number, number];
  index: number;
  icon: L.DivIcon;
  onMove: (index: number, nextPos: [number, number]) => void;
  onRemove: (index: number) => void;
}

function VertexMarker({
  position,
  index,
  icon,
  onMove,
  onRemove,
}: VertexMarkerProps) {
  const map = useMap();

  return (
    <Marker
      position={position}
      icon={icon}
      draggable={true}
      eventHandlers={{
        dragend(event) {
          const marker = event.target as L.Marker;
          const wrapped = marker.getLatLng().wrap();
          onMove(index, [wrapped.lat, wrapped.lng]);
        },
      }}
    >
      <Popup className="custom-popup-dark" maxWidth={220}>
        <div className="p-0.5 min-w-[165px] space-y-2">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
            <span className="text-xs font-semibold text-white">
              Vértice #{index + 1}
            </span>
            {index === 0 && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Inicio
              </span>
            )}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-300">
            {position[0].toFixed(5)}, {position[1].toFixed(5)}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              map.closePopup();
              onRemove(index);
            }}
            className="w-full min-h-[44px] sm:min-h-[36px] inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-red-300 bg-red-950/60 hover:bg-red-900/70 border border-red-500/30 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Eliminar vértice</span>
          </button>
        </div>
      </Popup>
    </Marker>
  );
}

/**
 * Interactive dark-mode Leaflet polygon editor for creating and adjusting zone
 * geofences by clicking to add vertices and dragging markers to refine boundaries.
 */
export function ZonePolygonEditor({
  vertices,
  onChange,
  referenceZones = [],
  hasError = false,
  heightClassName = 'h-[260px] sm:h-[340px]',
}: ZonePolygonEditorProps) {
  const [showReferenceZones, setShowReferenceZones] = useState(true);
  const [fitTick, setFitTick] = useState(0);

  const referencePolygons = useMemo(() => {
    return referenceZones
      .map((zone) => ({
        id: zone.id,
        name: zone.name,
        isActive: zone.isActive,
        positions: extractZoneLatLngVertices(zone),
      }))
      .filter((zone) => zone.positions.length >= 3);
  }, [referenceZones]);

  const referenceFlatPoints = useMemo(
    () => referencePolygons.flatMap((z) => z.positions),
    [referencePolygons]
  );

  const vertexIcons = useMemo(
    () => vertices.map((_, idx) => createZoneVertexIcon(idx, idx === 0)),
    [vertices]
  );

  const handleAddVertex = (point: [number, number]) => {
    const duplicate = vertices.some(
      (pt) => Math.abs(pt[0] - point[0]) < 1e-7 && Math.abs(pt[1] - point[1]) < 1e-7
    );
    if (duplicate) return;
    onChange([...vertices, point]);
  };

  const handleMoveVertex = (index: number, nextPos: [number, number]) => {
    onChange(vertices.map((pt, idx) => (idx === index ? nextPos : pt)));
  };

  const handleRemoveVertex = (index: number) => {
    onChange(vertices.filter((_, idx) => idx !== index));
  };

  const handleUndo = () => {
    if (vertices.length === 0) return;
    onChange(vertices.slice(0, -1));
  };

  const handleClear = () => {
    if (vertices.length === 0) return;
    onChange([]);
  };

  const isValidPolygon = vertices.length >= 3;

  return (
    <div
      className={clsx(
        'rounded-xl border overflow-hidden bg-slate-950 transition-colors',
        hasError ? 'border-red-500/60' : 'border-slate-800/80'
      )}
    >
      {/* Editor Toolbar */}
      <div className="bg-slate-950/90 border-b border-slate-800/80 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isValidPolygon ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium tabular-nums bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span>{vertices.length} vértices · Polígono válido</span>
            </span>
          ) : (
            <span
              className={clsx(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium tabular-nums border',
                vertices.length > 0
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                  : 'bg-slate-900 text-slate-300 border-slate-800/80'
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span>
                {vertices.length === 0
                  ? '0 vértices · Mín. 3 puntos'
                  : `${vertices.length}/3 vértices · Faltan ${3 - vertices.length}`}
              </span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {referencePolygons.length > 0 && (
            <button
              type="button"
              onClick={() => setShowReferenceZones((prev) => !prev)}
              aria-pressed={showReferenceZones}
              className={clsx(
                'min-h-[44px] sm:min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                showReferenceZones
                  ? 'bg-brand-500/15 border-brand-500/35 text-brand-300'
                  : 'bg-slate-900 border-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800'
              )}
              title="Mostrar u ocultar otras zonas existentes como referencia"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Vecinas ({referencePolygons.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setFitTick((prev) => prev + 1)}
            className="min-h-[44px] sm:min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800/80 transition-colors"
            title="Centrar vista del mapa"
          >
            <Crosshair className="h-3.5 w-3.5 text-brand-400" />
            <span>Centrar</span>
          </button>

          <button
            type="button"
            onClick={handleUndo}
            disabled={vertices.length === 0}
            className="min-h-[44px] sm:min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Deshacer último vértice"
          >
            <Undo2 className="h-3.5 w-3.5" />
            <span>Deshacer</span>
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={vertices.length === 0}
            className="min-h-[44px] sm:min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-900 hover:bg-red-950/50 text-slate-200 hover:text-red-300 border border-slate-800/80 hover:border-red-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Limpiar todos los vértices"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Limpiar</span>
          </button>
        </div>
      </div>

      {/* Interactive Leaflet Map */}
      <div className={clsx('relative w-full z-0', heightClassName)}>
        <MapContainer
          center={vertices[0] ?? referenceFlatPoints[0] ?? DEFAULT_MAP_CENTER}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
          className="bg-slate-950 cursor-crosshair"
        >
          <TileLayer attribution={DARK_TILE_ATTRIBUTION} url={DARK_TILE_URL} />

          <MapResizeInvalidator />
          <MapClickAddVertex onAddVertex={handleAddVertex} />
          <EditorViewportController
            vertices={vertices}
            referencePositions={referenceFlatPoints}
            fitTick={fitTick}
          />

          {/* Existing Sibling Zones (Non-Interactive Reference Layer) */}
          {showReferenceZones &&
            referencePolygons.map((zone) => (
              <Polygon
                key={zone.id}
                positions={zone.positions}
                interactive={false}
                pathOptions={{
                  color: zone.isActive ? '#64748b' : '#475569',
                  weight: 1.5,
                  opacity: 0.75,
                  dashArray: '4 4',
                  fillColor: '#475569',
                  fillOpacity: 0.08,
                }}
              />
            ))}

          {/* Live Line Preview (2 vertices) */}
          {vertices.length === 2 && (
            <Polyline
              positions={vertices}
              interactive={false}
              pathOptions={{
                color: '#38bdf8',
                weight: 2.5,
                dashArray: '6 5',
              }}
            />
          )}

          {/* Live Polygon Preview (>= 3 vertices) */}
          {vertices.length >= 3 && (
            <Polygon
              positions={vertices}
              interactive={false}
              pathOptions={{
                color: '#0ea5e9',
                weight: 2.5,
                opacity: 0.95,
                fillColor: '#0ea5e9',
                fillOpacity: 0.2,
              }}
            />
          )}

          {/* Draggable Vertex Markers */}
          {vertices.map((pos, idx) => (
            <VertexMarker
              key={`vertex-${idx}`}
              position={pos}
              index={idx}
              icon={vertexIcons[idx]}
              onMove={handleMoveVertex}
              onRemove={handleRemoveVertex}
            />
          ))}
        </MapContainer>
      </div>

      {/* Footer Guidance */}
      <div className="bg-slate-950/90 border-t border-slate-800/80 px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-400">
        <span>
          Haz clic en el mapa para agregar puntos. Arrastra un vértice para ajustar o tócalo para eliminarlo.
        </span>
        <span className="font-mono tabular-nums text-slate-400 shrink-0">
          GeoJSON [lng, lat]
        </span>
      </div>
    </div>
  );
}
