
import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Popup, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useSocket } from '../context/SocketContext';
import { Truck, Navigation, User, Package } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';

// --- Types ---
interface DriverInfo {
    id: string;
    name: string;
    user?: { username: string };
    zones?: { id: string, name: string }[];
}

interface SocketLocation {
    driverId: string;
    lat: number;
    lng: number;
    timestamp: number;
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
const createCustomIcon = (driver: DriverInfo | undefined, active: boolean) => {
    const color = active ? '#10b981' : '#64748b'; // Green or Slate
    const html = renderToStaticMarkup(
        <div className="relative flex items-center justify-center w-8 h-8">
            <div className={`absolute inset-0 rounded-full opacity-20 ${active ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`}></div>
            <div className={`relative z-10 p-1.5 rounded-full border-2 border-white shadow-lg ${active ? 'bg-green-600' : 'bg-slate-700'}`}>
                <Truck color="white" size={14} />
            </div>
            {/* Tiny arrow potentially for bearing (future) */}
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
    let color = '#f59e0b'; // Amber (Pending)
    if (status === 'assigned') color = '#3b82f6'; // Blue
    if (status === 'in_transit') color = '#8b5cf6'; // Purple
    if (status === 'delivered') color = '#10b981'; // Green
    
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
        const allLocs = Array.from(locations.values());
        // Filter by visibility
        const filtered = visibleDriverIds 
            ? allLocs.filter(d => visibleDriverIds.includes(d.driverId))
            : allLocs;
            
        // Enrich with metadata
        return filtered.map(loc => {
            const meta = allDrivers.find(d => d.id === loc.driverId);
            return { ...loc, meta };
        });
    }, [locations, visibleDriverIds, allDrivers]);

    const center: [number, number] = [-34.6037, -58.3816]; // Buenos Aires default

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
                        icon={createCustomIcon(d.meta, true)}
                    >
                        <Popup className="custom-popup-dark">
                            <div className="p-1 min-w-[200px]">
                                <div className="flex items-center gap-3 mb-2 border-b border-slate-200 pb-2">
                                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                        <User size={16} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 text-sm">{d.meta?.name || 'Conductor Desconocido'}</h3>
                                        <span className="text-xs text-slate-500 font-mono">ID: {d.driverId.slice(0,6)}</span>
                                    </div>
                                </div>
                                <div className="space-y-1 text-xs text-slate-600">
                                    <div className="flex items-center gap-2">
                                        <Navigation size={12} className="text-slate-400" />
                                        <span>{d.lat.toFixed(4)}, {d.lng.toFixed(4)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                                        <span className="font-medium text-green-600">En Línea</span>
                                        <span className="text-slate-400 ml-auto">{new Date(d.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    
                                    {d.meta?.zones && d.meta.zones.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-slate-100">
                                            <span className="text-[10px] uppercase font-bold text-slate-400">Zonas Asignadas:</span>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {d.meta.zones.map(z => (
                                                    <span key={z.id} className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[10px] border border-purple-200">
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
                                <h3 className="font-bold text-slate-800 text-xs flex items-center gap-1">
                                    <Package size={12} /> {p.trackingCode}
                                </h3>
                                <div className="text-[10px] text-slate-500 mt-1">
                                    {p.recipientAddress}
                                </div>
                                <span className="text-[10px] font-mono uppercase bg-slate-100 px-1 rounded mt-1 inline-block">
                                    {p.status}
                                </span>
                             </div>
                        </Popup>
                    </Marker>
                ))}

            </MapContainer>
            
            {/* Overlay Stats */}
            <div className="absolute bottom-6 left-6 bg-slate-900/90 backdrop-blur-md text-white p-3 rounded-xl border border-slate-700/50 shadow-2xl z-[1000] flex items-center gap-4">
                <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Activos</span>
                    <span className="text-2xl font-bold text-green-400">{activeDrivers.length}</span>
                </div>
                <div className="h-8 w-px bg-slate-700" />
                <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Total Flota</span>
                    <span className="text-lg font-semibold text-slate-200">{allDrivers.length}</span>
                </div>
                {validPackages.length > 0 && (
                    <>
                        <div className="h-8 w-px bg-slate-700" />
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Paquetes</span>
                            <span className="text-lg font-semibold text-amber-400">{validPackages.length}</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
