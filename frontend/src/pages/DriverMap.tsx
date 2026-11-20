
import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useAuth } from '../context/AuthContext';
import { packageService, type Package } from '../services/packageService';
import { useDriverLocation } from '../hooks/useDriverLocation';
import { Navigation, Package as PackageIcon } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getPackageStatusToken } from '../utils/packageStatus';

// --- Icons ---
const createDriverIcon = () => {
    const html = renderToStaticMarkup(
        <div className="relative flex items-center justify-center w-8 h-8">
            <div className="absolute inset-0 rounded-full bg-brand-500 opacity-20 animate-pulse"></div>
            <div className="relative z-10 p-1.5 rounded-full bg-brand-600 border-2 border-white shadow-lg">
                <Navigation color="white" size={14} className="transform -rotate-45" />
            </div>
        </div>
    );
    return L.divIcon({ className: 'driver-icon', html, iconSize: [32, 32], iconAnchor: [16, 16] });
};

const createPackageIcon = (status: string, index: number) => {
    const color = getPackageStatusToken(status).hexColor;

    const html = renderToStaticMarkup(
        <div className="relative flex flex-col items-center">
             <div className="relative z-10 px-2 py-0.5 rounded-md text-white font-bold font-mono tabular-nums text-xs shadow-md mb-1" style={{backgroundColor: color}}>
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

    // Global Tracking
    const { location } = useDriverLocation();

    const myLoc = useMemo<[number, number] | null>(
        () => (location ? [location.lat, location.lng] : null),
        [location]
    );

    useEffect(() => {
        if (!token) return;

        let cancelled = false;
        packageService.getMyPackages(token).then(data => {
            if (cancelled) return;
            const active = data.filter(p => !['delivered', 'cancelled'].includes(p.status) && p.lat && p.lng);
            setPackages(active);
        }).catch(console.error);

        return () => {
            cancelled = true;
        };
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
                                    className="w-full min-h-[48px] bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                                 >
                                     <Navigation size={12} /> Navegar Aquí
                                 </button>
                             </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>

            {/* Bottom Floating Stats */}
            <div className="absolute bottom-20 left-4 right-4 bg-slate-900/90 backdrop-blur border border-slate-800/80 p-4 rounded-xl z-[1000] shadow-2xl flex justify-between items-center">
                 <div>
                     <p className="text-xs text-slate-400 uppercase font-semibold tracking-wider">Ruta Actual</p>
                     <p className="text-white font-bold text-lg tabular-nums">{packages.length} Destinos</p>
                 </div>
                 {packages.length > 0 && packages[0].lat && packages[0].lng && (
                     <button 
                        onClick={() => openNav(packages[0].lat!, packages[0].lng!)}
                        className="min-h-[48px] bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg font-bold shadow-lg shadow-brand-950/30 text-sm flex items-center gap-2 transition-colors"
                     >
                         <Navigation className="h-4 w-4" />
                         Ir al #1
                     </button>
                 )}
            </div>
        </div>
    );
}
