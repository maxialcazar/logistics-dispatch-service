
import { useMemo } from 'react';
import { MapContainer, TileLayer, Popup, Marker, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useSocket } from '../context/SocketContext';
import { Truck, Navigation, User, Package } from 'lucide-react';
import {
    PACKAGE_STATUS_ORDER,
    PACKAGE_STATUS_TOKENS,
    getPackageStatusToken,
} from '../utils/packageStatus';
import {
    DARK_TILE_ATTRIBUTION,
    DARK_TILE_URL,
    DEFAULT_MAP_CENTER,
    createDriverIcon,
    createPackageIcon,
    toValidLatLng,
    toValidNonZeroLatLng,
} from '../utils/mapUtils';
import { MapFitBounds } from './MapFitBounds';
import { SmoothMarker } from './SmoothMarker';

// --- Types ---
interface DriverInfo {
    id: string;
    name: string;
    lat?: number | null;
    lng?: number | null;
    user?: { username: string };
    zones?: { id: string; name: string }[];
}

interface SocketLocation {
    driverId: string;
    lat: number;
    lng: number;
    timestamp: number;
}

interface ActiveDriverMarker extends SocketLocation {
    status: 'online' | 'offline';
    meta?: DriverInfo;
}

interface PackageLocation {
    id: string;
    trackingCode: string;
    lat: number;
    lng: number;
    status: string;
    recipientAddress: string;
}

export interface ZoneCoordinate {
    lat: number;
    lng: number;
}

export interface MapZone {
    id: string;
    name: string;
    coordinates?: ZoneCoordinate[] | null;
    description?: string;
    isActive?: boolean;
    driver?: { id: string; name: string } | null;
}

// --- Main Component ---
interface LiveMapProps {
    visibleDriverIds?: string[];
    allDrivers?: DriverInfo[]; // Metadata to enrich popups
    packages?: PackageLocation[];
    zones?: MapZone[];
}

export function LiveMap({
    visibleDriverIds,
    allDrivers = [],
    packages = [],
    zones = [],
}: LiveMapProps) {
    const { locations } = useSocket();

    const driverIcons = useMemo(
        () => ({
            online: createDriverIcon('online'),
            offline: createDriverIcon('offline'),
        }),
        []
    );

    const fallbackPackageColor = getPackageStatusToken('').hexColor;
    const packageIcons = useMemo(() => {
        const icons = new Map<string, L.DivIcon>();
        for (const status of PACKAGE_STATUS_ORDER) {
            const { hexColor } = PACKAGE_STATUS_TOKENS[status];
            if (!icons.has(hexColor)) {
                icons.set(hexColor, createPackageIcon(hexColor));
            }
        }
        if (!icons.has(fallbackPackageColor)) {
            icons.set(fallbackPackageColor, createPackageIcon(fallbackPackageColor));
        }
        return icons;
    }, [fallbackPackageColor]);

    // Filter valid packages (must have finite non-zero coordinates)
    const validPackages = useMemo(() => {
        return packages.filter((p) => toValidNonZeroLatLng(p.lat, p.lng) !== null);
    }, [packages]);

    // Filter active zones with valid polygon vertices (>= 3 points in [lat, lng] order)
    const activeZonePolygons = useMemo(() => {
        return zones
            .filter((zone) => zone.isActive === true && Array.isArray(zone.coordinates))
            .map((zone) => {
                const positions: [number, number][] = (zone.coordinates ?? [])
                    .map((pt) => (pt ? toValidLatLng(pt.lat, pt.lng) : null))
                    .filter((coords): coords is [number, number] => coords !== null);

                return {
                    id: zone.id,
                    name: zone.name,
                    description: zone.description,
                    driverName: zone.driver?.name ?? null,
                    positions,
                };
            })
            .filter((zone) => zone.positions.length >= 3);
    }, [zones]);

    const activeDrivers = useMemo(() => {
        const driversById = new Map<string, DriverInfo>();
        allDrivers.forEach((d) => {
            driversById.set(d.id, d);
        });

        const markersMap = new Map<string, ActiveDriverMarker>();

        // 1. Populate with DB Drivers (Offline/Static)
        allDrivers.forEach((d) => {
            const coords = toValidNonZeroLatLng(d.lat, d.lng);
            if (coords) {
                markersMap.set(d.id, {
                    driverId: d.id,
                    lat: coords[0],
                    lng: coords[1],
                    timestamp: 0,
                    status: 'offline',
                    meta: d,
                });
            }
        });

        // 2. Override with Real-Time Socket Data (Online)
        locations.forEach((loc, driverId) => {
            const coords = toValidNonZeroLatLng(loc.lat, loc.lng);
            if (!coords) {
                return;
            }
            markersMap.set(driverId, {
                driverId: loc.driverId,
                lat: coords[0],
                lng: coords[1],
                timestamp: loc.timestamp,
                status: 'online',
                meta: driversById.get(driverId),
            });
        });

        // 3. Filter by Visibility
        const result = Array.from(markersMap.values());
        if (visibleDriverIds) {
            return result.filter((d) => visibleDriverIds.includes(d.driverId));
        }
        return result;
    }, [locations, visibleDriverIds, allDrivers]);

    const { boundsPoints, boundsSignature } = useMemo(() => {
        if (activeDrivers.length > 0) {
            return {
                boundsPoints: activeDrivers.map((d): [number, number] => [d.lat, d.lng]),
                boundsSignature: `drivers:${activeDrivers.map((d) => d.driverId).sort().join(',')}`,
            };
        }

        const fallbackPoints: [number, number][] = [
            ...validPackages.map((p): [number, number] => [p.lat, p.lng]),
            ...activeZonePolygons.flatMap((z) => z.positions),
        ];
        const pkgSig = validPackages.map((p) => p.id).sort().join(',');
        const zoneSig = activeZonePolygons.map((z) => z.id).sort().join(',');

        return {
            boundsPoints: fallbackPoints,
            boundsSignature: `fallback:${pkgSig}|${zoneSig}`,
        };
    }, [activeDrivers, validPackages, activeZonePolygons]);

    return (
        <div className="h-full w-full relative z-0">
            <MapContainer
                center={DEFAULT_MAP_CENTER}
                zoom={12}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={true}
                className="bg-slate-900"
            >
                {/* Dark Mode Tiles */}
                <TileLayer
                    attribution={DARK_TILE_ATTRIBUTION}
                    url={DARK_TILE_URL}
                />

                <MapFitBounds points={boundsPoints} signature={boundsSignature} />

                {/* Active Zone Polygons (rendered below markers) */}
                {activeZonePolygons.map((zone) => (
                    <Polygon
                        key={zone.id}
                        positions={zone.positions}
                        pathOptions={{
                            color: '#0ea5e9',
                            weight: 2,
                            opacity: 0.85,
                            fillColor: '#0ea5e9',
                            fillOpacity: 0.12,
                        }}
                    >
                        <Popup className="custom-popup-dark" maxWidth={260}>
                            <div className="p-0.5 min-w-[175px] space-y-1.5">
                                <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
                                    <h3 className="font-semibold text-slate-100 text-xs truncate">
                                        {zone.name}
                                    </h3>
                                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                        Activa
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-slate-300">
                                    <Truck size={12} className="text-brand-400 shrink-0" />
                                    <span className="truncate">
                                        {zone.driverName ?? 'Sin conductor asignado'}
                                    </span>
                                </div>
                                {zone.description && (
                                    <p className="text-[11px] text-slate-400 leading-snug">
                                        {zone.description}
                                    </p>
                                )}
                                <div className="text-[10px] font-mono tabular-nums text-slate-400">
                                    {zone.positions.length} vértices
                                </div>
                            </div>
                        </Popup>
                    </Polygon>
                ))}

                {/* Render Drivers with 60fps SmoothMarker interpolation */}
                {activeDrivers.map((d) => (
                    <SmoothMarker
                        key={d.driverId}
                        position={[d.lat, d.lng]}
                        icon={driverIcons[d.status]}
                    >
                        <Popup className="custom-popup-dark" maxWidth={280}>
                            <div className="p-0.5 min-w-[190px]">
                                <div className="flex items-center gap-2.5 mb-2 border-b border-slate-800 pb-2">
                                    <div className="h-8 w-8 shrink-0 rounded-full bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-400">
                                        <User size={15} />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-semibold text-slate-100 text-sm truncate">
                                            {d.meta?.name || 'Conductor Desconocido'}
                                        </h3>
                                        <span className="text-xs text-slate-400 font-mono tabular-nums">
                                            ID: {d.driverId.slice(0, 6)}
                                        </span>
                                    </div>
                                </div>
                                <div className="space-y-1.5 text-xs text-slate-300">
                                    <div className="flex items-center gap-2">
                                        <Navigation size={12} className="text-slate-400 shrink-0" />
                                        <span className="font-mono tabular-nums text-slate-200">
                                            {d.lat.toFixed(4)}, {d.lng.toFixed(4)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div
                                            className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                                d.status === 'online'
                                                    ? 'bg-emerald-400 animate-pulse'
                                                    : 'bg-slate-500'
                                            }`}
                                        />
                                        <span
                                            className={`font-medium ${
                                                d.status === 'online' ? 'text-emerald-400' : 'text-slate-400'
                                            }`}
                                        >
                                            {d.status === 'online' ? 'En Línea' : 'Desconectado'}
                                        </span>
                                        <span className="text-slate-400 ml-auto font-mono tabular-nums">
                                            {d.timestamp > 0 ? new Date(d.timestamp).toLocaleTimeString() : 'N/A'}
                                        </span>
                                    </div>

                                    {d.meta?.zones && d.meta.zones.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-slate-800">
                                            <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
                                                Zonas Asignadas
                                            </span>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {d.meta.zones.map((z) => (
                                                    <span
                                                        key={z.id}
                                                        className="bg-brand-500/10 text-brand-300 px-1.5 py-0.5 rounded text-[10px] border border-brand-500/25"
                                                    >
                                                        {z.name}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Popup>
                    </SmoothMarker>
                ))}

                {/* Render Packages */}
                {validPackages.map((p) => {
                    const statusToken = getPackageStatusToken(p.status);
                    const packageIcon =
                        packageIcons.get(statusToken.hexColor) ??
                        packageIcons.get(fallbackPackageColor)!;

                    return (
                        <Marker
                            key={p.id}
                            position={[p.lat, p.lng]}
                            icon={packageIcon}
                        >
                            <Popup className="custom-popup-dark" maxWidth={260}>
                                <div className="p-0.5 min-w-[160px]">
                                    <h3 className="font-semibold text-slate-100 text-xs font-mono tabular-nums flex items-center gap-1.5">
                                        <Package size={12} className="text-brand-400 shrink-0" />
                                        <span className="truncate">{p.trackingCode}</span>
                                    </h3>
                                    <div className="text-xs text-slate-300 mt-1 leading-snug">
                                        {p.recipientAddress}
                                    </div>
                                    <span
                                        className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border mt-2 inline-block ${statusToken.badgeClass}`}
                                    >
                                        {statusToken.label}
                                    </span>
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>

            {/* Overlay Stats */}
            <div className="absolute bottom-3 left-3 sm:bottom-5 sm:left-5 max-w-[calc(100%-1.5rem)] bg-slate-900/90 backdrop-blur-md text-white px-3 py-2.5 sm:p-3 rounded-xl border border-slate-800/80 shadow-2xl z-[1000] flex flex-wrap items-center gap-3 sm:gap-4">
                <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Activos</span>
                    <span className="text-xl sm:text-2xl font-bold text-emerald-400 tabular-nums">
                        {activeDrivers.length}
                    </span>
                </div>
                <div className="h-8 w-px bg-slate-800/80" />
                <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Total Flota</span>
                    <span className="text-base sm:text-lg font-semibold text-slate-200 tabular-nums">
                        {allDrivers.length}
                    </span>
                </div>
                {validPackages.length > 0 && (
                    <>
                        <div className="h-8 w-px bg-slate-800/80" />
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Paquetes</span>
                            <span className="text-base sm:text-lg font-semibold text-amber-400 tabular-nums">
                                {validPackages.length}
                            </span>
                        </div>
                    </>
                )}
                {activeZonePolygons.length > 0 && (
                    <>
                        <div className="h-8 w-px bg-slate-800/80" />
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Zonas</span>
                            <span className="text-base sm:text-lg font-semibold text-brand-400 tabular-nums">
                                {activeZonePolygons.length}
                            </span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
