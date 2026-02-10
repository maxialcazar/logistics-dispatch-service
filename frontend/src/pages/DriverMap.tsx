
import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useAuth } from '../context/AuthContext';
import { packageService, type Package } from '../services/packageService';
import { Navigation, Package as PackageIcon, MapPin, User } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { toast } from 'sonner';

// --- Icons ---
const createDriverIcon = () => {
    const html = renderToStaticMarkup(
        <div className="relative flex items-center justify-center w-8 h-8">
            <div className="absolute inset-0 rounded-full bg-blue-500 opacity-20 animate-pulse"></div>
            <div className="relative z-10 p-1.5 rounded-full bg-blue-600 border-2 border-white shadow-lg">
                <Navigation color="white" size={14} className="transform -rotate-45" />
            </div>
        </div>
    );
    return L.divIcon({ className: 'driver-icon', html, iconSize: [32, 32], iconAnchor: [16, 16] });
};

const createPackageIcon = (status: string, index: number) => {
    let color = '#64748b'; // Default
    if (status === 'assigned') color = '#3b82f6'; // Blue
    if (status === 'in_transit') color = '#a855f7'; // Purple
    if (status === 'delivered') color = '#22c55e'; // Green

    const html = renderToStaticMarkup(
        <div className="relative flex flex-col items-center">
             <div className="relative z-10 px-2 py-0.5 rounded-md text-white font-bold text-xs shadow-md mb-1" style={{backgroundColor: color}}>
                 #{index + 1}
             </div>
             <div className="p-1.5 rounded-full border-2 border-white shadow-lg" style={{backgroundColor: color}}>
                <PackageIcon color="white" size={14} />
            </div>
        </div>
    );
    return L.divIcon({ className: 'pkg-icon', html, iconSize: [30, 50], iconAnchor: [15, 50], popupAnchor: [0, -45] });
};

// --- Fit Bounds Component ---
function FitBounds({ points }: { points: [number, number][] }) {
    const map = useMap();
    useEffect(() => {
        if (points.length === 0) return;
        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }, [points.length]); // Only refit on count change
    return null;
}

export function DriverMap() {
    const { token } = useAuth();
    const [packages, setPackages] = useState<Package[]>([]);
    const [myLoc, setMyLoc] = useState<[number, number] | null>(null);

    useEffect(() => {
        if (!token) return;
        
        // 1. Fetch Packages
        packageService.getMyPackages(token).then(data => {
            const active = data.filter(p => !['delivered', 'cancelled'].includes(p.status) && p.lat && p.lng);
            setPackages(active);
        }).catch(console.error);

        // 2. Watch Position
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                setMyLoc([pos.coords.latitude, pos.coords.longitude]);
                // Update server? Not strictly needed for THIS view, but good for admin monitor.
                // driverService.updateLocation(token, ...) - skipped for simplicity now
            },
            (err) => console.error("Geo error", err),
            { enableHighAccuracy: true }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, [token]);

    const points = useMemo(() => {
        const pts: [number, number][] = [];
        if (myLoc) pts.push(myLoc);
        packages.forEach(p => {
            if (p.lat && p.lng) pts.push([p.lat, p.lng]);
        });
        return pts;
    }, [myLoc, packages]);

    const openNav = (lat: number, lng: number) => {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
    };

    return (
        <div className="h-full w-full relative bg-slate-900">
             <MapContainer 
                center={[-31.416, -64.186]} // Cordoba default
                zoom={13} 
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
             >
                <TileLayer
                    attribution='&copy; CARTO'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                
                <FitBounds points={points} />

                {/* My Location */}
                {myLoc && (
                    <Marker position={myLoc} icon={createDriverIcon()}>
                         <Popup>Mi Ubicación</Popup>
                    </Marker>
                )}

                {/* Packages */}
                {packages.map((pkg, idx) => (
                    <Marker 
                        key={pkg.id} 
                        position={[pkg.lat!, pkg.lng!]}
                        icon={createPackageIcon(pkg.status, idx)}
                    >
                        <Popup className="custom-popup-dark">
                             <div className="min-w-[200px] p-2">
                                 <h3 className="font-bold text-slate-800">{pkg.recipientName}</h3>
                                 <p className="text-xs text-slate-600 mb-2">{pkg.recipientAddress}</p>
                                 <button 
                                    onClick={() => openNav(pkg.lat!, pkg.lng!)}
                                    className="w-full bg-blue-600 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-2"
                                 >
                                     <Navigation size={12} /> Navegar Aquí
                                 </button>
                             </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>

            {/* Bottom Floating Stats */}
            <div className="absolute bottom-20 left-4 right-4 bg-slate-900/90 backdrop-blur border border-slate-700 p-4 rounded-xl z-[1000] shadow-2xl flex justify-between items-center">
                 <div>
                     <p className="text-xs text-slate-400 uppercase font-bold">Ruta Actual</p>
                     <p className="text-white font-bold text-lg">{packages.length} Destinos</p>
                 </div>
                 {packages.length > 0 && packages[0].lat && packages[0].lng && (
                     <button 
                        onClick={() => openNav(packages[0].lat!, packages[0].lng!)}
                        className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-bold shadow-lg shadow-purple-900/20 text-sm flex items-center gap-2 animate-pulse"
                     >
                         <Navigation className="h-4 w-4" />
                         Ir al #1
                     </button>
                 )}
            </div>
        </div>
    );
}
