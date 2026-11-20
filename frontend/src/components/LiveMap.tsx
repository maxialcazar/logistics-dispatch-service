
import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Popup, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useSocket } from '../context/SocketContext';
import { Truck, Navigation, User, Package } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getPackageStatusToken } from '../utils/packageStatus';

// --- Types ---
interface DriverInfo {
    id: string;
    name: string;
    lat?: number | null;
    lng?: number | null;
    user?: { username: string };
    zones?: { id: string, name: string }[];
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

// --- Icons Generator ---
// Creates a divIcon with a Truck SVG inside
const createCustomIcon = (_driver: DriverInfo | undefined, status: string) => {
    const isOnline = status === 'online';
    
    // Emerald (Online) or Slate (Offline)
    const colorBg = isOnline ? 'bg-emerald-600' : 'bg-slate-600'; 
    const colorPulse = isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500 hidden';

    const html = renderToStaticMarkup(
        <div className="relative flex items-center justify-center w-8 h-8">
            <div className={`absolute inset-0 rounded-full opacity-20 ${colorPulse}`}></div>
            <div className={`relative z-10 p-1.5 rounded-full border-2 border-white shadow-lg ${colorBg}`}>
                <Truck color="white" size={14} />
            </div>
        </div>
    );

    return L.divIcon({
        className: 'custom-driver-icon-v2',
        html: html,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
    });
};

const createPackageIcon = (status: string) => {
    const color = getPackageStatusToken(status).hexColor;
    
    const html = renderToStaticMarkup(
        <div className="relative flex items-center justify-center w-6 h-6">
            <div className={`absolute inset-0 rounded-sm opacity-50`} style={{backgroundColor: color}}></div>
            <div className={`relative z-10 p-1 rounded-sm border border-white shadow-sm`} style={{backgroundColor: color}}>
                <Package color="white" size={12} />
            </div>
        </div>
    );

    return L.divIcon({
        className: 'custom-package-icon',
        html: html,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
};

// --- Helper Component to Fit Bounds ---
function FitBounds({ markers }: { markers: SocketLocation[] }) {
    const map = useMap();
    
    useEffect(() => {
        if (markers.length === 0) return;
        
        // Create bounds from all markers
        const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]));
        
        // Pad bounds slightly
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });
    }, [markers.length]); // Only refit when count changes (avoids jitter on every movement)
    
    return null;
}

// --- Main Component ---
interface LiveMapProps {
    visibleDriverIds?: string[]; 
    allDrivers?: DriverInfo[]; // Metadata to enrich popups
    packages?: PackageLocation[]; // New Prop
}

export function LiveMap({ visibleDriverIds, allDrivers = [], packages = [] }: LiveMapProps) {
    const { locations } = useSocket();
    
    // Filter valid packages (must have lat/lng)
    const validPackages = useMemo(() => {
        return packages.filter(p => p.lat && p.lng);
    }, [packages]);
    
    const activeDrivers = useMemo(() => {
        const driversMap = new Map<string, ActiveDriverMarker>();

        // 1. Populate with DB Drivers (Offline/Static)
        allDrivers.forEach(d => {
             // Skip if no location available in DB
             if (typeof d.lat === 'number' && typeof d.lng === 'number' && d.lat !== 0 && d.lng !== 0) {
                 driversMap.set(d.id, {
                     driverId: d.id,
                     lat: d.lat,
                     lng: d.lng,
                     timestamp: 0, // Old
                     status: 'offline', // Mark as offline initially
                     meta: d
                 });
             }
        });

        // 2. Override with Real-Time Socket Data (Online)
        locations.forEach((loc, driverId) => {
             const meta = allDrivers.find(d => d.id === driverId);
             // Use socket location as authoritative
             driversMap.set(driverId, { 
                 ...loc, 
                 status: 'online', 
                 meta 
             });
        });

        // 3. Filter by Visibility
        const result = Array.from(driversMap.values());
        if (visibleDriverIds) {
            return result.filter(d => visibleDriverIds.includes(d.driverId));
        }
        return result;
    }, [locations, visibleDriverIds, allDrivers]);

    const center: [number, number] = [-31.43547, -64.20090]; // Buenos Aires default

    return (
        <div className="h-full w-full relative z-0">
             <MapContainer 
                center={center} 
                zoom={12} 
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={true}
                className="bg-slate-900"
             >
                {/* Dark Mode Tiles */}
                <TileLayer
                    attribution='&copy; CARTO'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                
                <FitBounds markers={activeDrivers} />

                {activeDrivers.map(d => (
                    <Marker 
                        key={d.driverId} 
                        position={[d.lat, d.lng]}
                        icon={createCustomIcon(d.meta, d.status)}
                    >
                        <Popup className="custom-popup-dark">
                            <div className="p-1 min-w-[200px]">
                                <div className="flex items-center gap-3 mb-2 border-b border-slate-200 pb-2">
                                    <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-600">
                                        <User size={16} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 text-sm">{d.meta?.name || 'Conductor Desconocido'}</h3>
                                        <span className="text-xs text-slate-500 font-mono tabular-nums">ID: {d.driverId.slice(0,6)}</span>
                                    </div>
                                </div>
                                <div className="space-y-1 text-xs text-slate-600">
                                    <div className="flex items-center gap-2">
                                        <Navigation size={12} className="text-slate-400" />
                                        <span className="font-mono tabular-nums">{d.lat.toFixed(4)}, {d.lng.toFixed(4)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className={`h-1.5 w-1.5 rounded-full ${d.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                                        <span className={`font-medium ${d.status === 'online' ? 'text-emerald-600' : 'text-slate-500'}`}>
                                            {d.status === 'online' ? 'En Línea' : 'Desconectado'}
                                        </span>
                                        <span className="text-slate-400 ml-auto tabular-nums">
                                            {d.timestamp > 0 ? new Date(d.timestamp).toLocaleTimeString() : 'N/A'}
                                        </span>
                                    </div>
                                    
                                    {d.meta?.zones && d.meta.zones.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-slate-100">
                                            <span className="text-[10px] uppercase font-bold text-slate-400">Zonas Asignadas:</span>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {d.meta.zones.map((z) => (
                                                    <span key={z.id} className="bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded text-[10px] border border-brand-200">
                                                        {z.name}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                ))}

                {/* Render Packages */}
                {validPackages.map(p => (
                    <Marker 
                        key={p.id} 
                        position={[p.lat, p.lng]}
                        icon={createPackageIcon(p.status)}
                    >
                        <Popup className="custom-popup-dark">
                             <div className="p-1 min-w-[150px]">
                                <h3 className="font-bold text-slate-800 text-xs font-mono tabular-nums flex items-center gap-1">
                                    <Package size={12} /> {p.trackingCode}
                                </h3>
                                <div className="text-[10px] text-slate-500 mt-1">
                                    {p.recipientAddress}
                                </div>
                                <span className="text-[10px] font-mono uppercase bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded mt-1 inline-block">
                                    {getPackageStatusToken(p.status).label}
                                </span>
                             </div>
                        </Popup>
                    </Marker>
                ))}

            </MapContainer>
            
            {/* Overlay Stats */}
            <div className="absolute bottom-6 left-6 bg-slate-900/90 backdrop-blur-md text-white p-3 rounded-xl border border-slate-800/80 shadow-2xl z-[1000] flex items-center gap-4">
                <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Activos</span>
                    <span className="text-2xl font-bold text-emerald-400 tabular-nums">{activeDrivers.length}</span>
                </div>
                <div className="h-8 w-px bg-slate-800/80" />
                <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Total Flota</span>
                    <span className="text-lg font-semibold text-slate-200 tabular-nums">{allDrivers.length}</span>
                </div>
                {validPackages.length > 0 && (
                    <>
                        <div className="h-8 w-px bg-slate-800/80" />
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Paquetes</span>
                            <span className="text-lg font-semibold text-amber-400 tabular-nums">{validPackages.length}</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
