
import { useMemo } from 'react';
import { MapContainer, TileLayer, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useSocket } from '../context/SocketContext';
import { SmoothMarker } from './SmoothMarker';

// --- Fix Leaflet Default Icon in Webpack/Vite ---
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;
// ------------------------------------------------

// Generate a consistent color based on string hash
const stringToColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
}

// Custom Icon Generator
const createDriverIcon = (driverId: string) => {
    const color = stringToColor(driverId);
    return L.divIcon({
        className: 'custom-driver-icon',
        html: `<div style="
            background-color: ${color};
            width: 24px;
            height: 24px;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 0 10px ${color};
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            color: white;
            font-weight: bold;
        ">🚚</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
};

export function LiveMap() {
    const { locations } = useSocket();
    
    // Convert Map to Array
    const drivers = useMemo(() => Array.from(locations.values()), [locations]);

    // Calculate center dynamically or fallback to Buenos Aires (Obelisco)
    const center: [number, number] = drivers.length > 0 
        ? [drivers[0].lat, drivers[0].lng] 
        : [-34.6037, -58.3816];

    return (
        <div className="h-full w-full rounded-xl overflow-hidden border border-slate-700 shadow-2xl relative z-0">
             <MapContainer 
                center={center} 
                zoom={13} 
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={true}
             >
                {/* Dark Mode Tiles for "Hacker" Aesthetic */}
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                
                {drivers.map(driver => (
                    <SmoothMarker 
                        key={driver.driverId} 
                        position={[driver.lat, driver.lng]}
                        icon={createDriverIcon(driver.driverId)}
                    >
                        <Popup>
                            <div className="font-mono text-xs">
                                <strong style={{color: stringToColor(driver.driverId)}}>Driver {driver.driverId.split('-')[0]}</strong><br />
                                <strong>ID:</strong> {driver.driverId.substring(0,8)}...<br />
                                <strong>Lat/Lng:</strong> {driver.lat.toFixed(4)}, {driver.lng.toFixed(4)}<br />
                                <strong>Last Update:</strong> {new Date(driver.timestamp).toLocaleTimeString()}
                            </div>
                        </Popup>
                    </SmoothMarker>
                ))}
            </MapContainer>
            
            {/* Overlay Stats */}
            <div className="absolute bottom-4 left-4 bg-slate-900/80 backdrop-blur text-white p-2 rounded border border-slate-700 text-xs z-[1000]">
                Active Drivers: {drivers.length}
            </div>
        </div>
    );
}
