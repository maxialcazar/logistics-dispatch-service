import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { driverService } from '../services/driverService';
import { zoneService } from '../services/zoneService';
import { packageService } from '../services/packageService';
import { useSocket } from '../context/SocketContext';
import { LiveMap } from '../components/LiveMap';
import { Skeleton } from '../components/Skeleton';
import { Map, MapPin, Truck, Search, X, Check } from 'lucide-react';

// Types
interface Zone { id: string; name: string; }
interface Driver { id: string; name: string; zones: { id: string; name: string }[]; user?: { username: string } }
interface ActivePackage { 
    id: string; 
    trackingCode: string; 
    driverId?: string; 
    zoneId?: string;
    zone?: { id: string; name?: string };
    status: string;
    lat?: number | null;
    lng?: number | null;
    recipientAddress?: string;
}

const isValidCoordinate = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const hasValidCoordinates = (
    pkg: ActivePackage
): pkg is ActivePackage & { lat: number; lng: number } =>
    isValidCoordinate(pkg.lat) && isValidCoordinate(pkg.lng);

const getPackageZoneId = (pkg: ActivePackage): string | undefined =>
    pkg.zoneId ?? pkg.zone?.id;

const doesPackageMatchDriver = (pkg: ActivePackage, driver: Driver): boolean => {
    if (pkg.driverId && pkg.driverId === driver.id) {
        return true;
    }
    const pkgZoneId = getPackageZoneId(pkg);
    if (!pkgZoneId) {
        return false;
    }
    return driver.zones?.some((z) => z.id === pkgZoneId) ?? false;
};

export function MonitorPage() {
    const { token } = useAuth();
    
    // Data
    const [zones, setZones] = useState<Zone[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [activePackages, setActivePackages] = useState<ActivePackage[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [selectedZones, setSelectedZones] = useState<string[]>([]);
    const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
    const [packageSearch, setPackageSearch] = useState('');
    const [isZoneDropdownOpen, setIsZoneDropdownOpen] = useState(false);
    const [isDriverDropdownOpen, setIsDriverDropdownOpen] = useState(false);

    const { socket } = useSocket();

    // Fetch Initial Data
    useEffect(() => {
        if (!token) return;
        const load = async () => {
            try {
                const [z, d, p] = await Promise.all([
                    zoneService.getZones(token),
                    driverService.getDrivers(token, 1, 100), // Page 1, Limit 100
                    // Fetch ALL active packages (limit increased)
                    packageService.getPackages(token, undefined, 1, 1000), 
                ]);
                setZones(z.items || []);
                const mappedDrivers = (d.items || []).map((drv) => ({
                    ...drv,
                    zones: drv.zones || []
                }));
                setDrivers(mappedDrivers);
                setActivePackages(p.items || []);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [token]);

    // WebSocket Listener for Package Updates
    useEffect(() => {
        if (!socket) return;

        const handlePackageUpdate = (data: {
            packageId: string;
            status: string;
            lat?: number | null;
            lng?: number | null;
        }) => {
            if (!data?.packageId) return;
            setActivePackages((prev) =>
                prev.map((p) => {
                    if (p.id === data.packageId) {
                        return {
                            ...p,
                            status: data.status ?? p.status,
                            // Preserve existing lat/lng if update is missing them or 0
                            lat: data.lat && data.lat !== 0 ? data.lat : p.lat,
                            lng: data.lng && data.lng !== 0 ? data.lng : p.lng,
                        };
                    }
                    return p;
                })
            );
        };

        socket.on('package-status-updated', handlePackageUpdate);

        return () => {
            socket.off('package-status-updated', handlePackageUpdate);
        };
    }, [socket]);

    const normalizedSearch = packageSearch.trim().toLowerCase();

    // Derived Filtered Packages (synced with zone, driver, and search filters)
    const filteredPackages = useMemo(() => {
        const selectedDriverList =
            selectedDrivers.length > 0
                ? drivers.filter((d) => selectedDrivers.includes(d.id))
                : [];

        return activePackages.filter((pkg) => {
            if (selectedZones.length > 0) {
                const pkgZoneId = getPackageZoneId(pkg);
                if (!pkgZoneId || !selectedZones.includes(pkgZoneId)) {
                    return false;
                }
            }

            if (selectedDrivers.length > 0) {
                const matchesSelectedDriver = selectedDriverList.some((driver) =>
                    doesPackageMatchDriver(pkg, driver)
                );
                if (!matchesSelectedDriver) {
                    return false;
                }
            }

            if (normalizedSearch.length > 0) {
                const tracking = (pkg.trackingCode ?? '').toLowerCase();
                if (!tracking.includes(normalizedSearch)) {
                    return false;
                }
            }

            return true;
        });
    }, [activePackages, drivers, selectedZones, selectedDrivers, normalizedSearch]);

    // Map-ready Packages (omit entries without finite numeric coordinates; never fallback to 0, 0)
    const mapPackages = useMemo(
        () =>
            filteredPackages
                .filter(hasValidCoordinates)
                .map((p) => ({
                    id: p.id,
                    trackingCode: p.trackingCode,
                    lat: p.lat,
                    lng: p.lng,
                    status: p.status,
                    recipientAddress: p.recipientAddress || 'Sin Dirección',
                })),
        [filteredPackages]
    );

    // Derived Visible Drivers
    const visibleDriverIds = useMemo(() => {
        // Start with all drivers
        let filtered = drivers;

        // 1. Filter by Zones (OR logic: if driver has ANY of selected zones)
        if (selectedZones.length > 0) {
            filtered = filtered.filter((d) =>
                d.zones?.some((z) => selectedZones.includes(z.id))
            );
        }

        // 2. Filter by Specific Drivers (OR logic)
        if (selectedDrivers.length > 0) {
            filtered = filtered.filter((d) => selectedDrivers.includes(d.id));
        }

        // 3. Filter by Package (AND logic: driver covers zone of matching package, or matches p.driverId fallback)
        if (normalizedSearch.length > 0) {
            filtered = filtered.filter((d) =>
                filteredPackages.some((pkg) => doesPackageMatchDriver(pkg, d))
            );
        }

        return filtered.map((d) => d.id);
    }, [drivers, filteredPackages, selectedZones, selectedDrivers, normalizedSearch]);

    // Helpers to toggle filters
    const toggleZone = (id: string) => {
        setSelectedZones(prev => prev.includes(id) ? prev.filter(z => z !== id) : [...prev, id]);
    };

    const toggleDriver = (id: string) => {
        setSelectedDrivers(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
    };

    if (loading) {
        return (
            <div className="h-[calc(100vh-100px)] flex flex-col space-y-4">
                <Skeleton className="h-[72px] w-full rounded-xl" />
                <Skeleton className="flex-1 w-full rounded-xl" />
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col space-y-4">
            {/* Header / Filters Bar */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between shadow-lg">
                <div className="flex items-center gap-3">
                     <div className="bg-blue-600/20 p-2 rounded-lg text-blue-400">
                        <Map className="h-6 w-6" />
                     </div>
                     <div>
                        <h1 className="text-xl font-bold text-white">Monitor de Flota</h1>
                        <p className="text-xs text-slate-400">
                            Mostrando {visibleDriverIds.length} de {drivers.length} conductores
                        </p>
                     </div>
                </div>

                {/* Filter Controls */}
                <div className="flex flex-wrap gap-3 flex-1 justify-end w-full lg:w-auto">
                    
                    {/* Zone Filter Dropdown (Custom implementation for multi-select) */}
                    <div className="relative">
                        <button
                            type="button"
                            aria-expanded={isZoneDropdownOpen}
                            onClick={() => {
                                setIsZoneDropdownOpen(prev => !prev);
                                setIsDriverDropdownOpen(false);
                            }}
                            className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:text-white hover:border-purple-500 transition-colors"
                        >
                            <MapPin className="h-4 w-4 text-purple-400" />
                            {selectedZones.length > 0 ? `${selectedZones.length} Zonas` : 'Filtrar Zonas'}
                        </button>
                        {/* Dropdown Content */}
                        {isZoneDropdownOpen && (
                            <div className="absolute top-full right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-xl p-2 z-[1000]">
                                <div className="text-xs font-semibold text-slate-500 mb-2 px-2 uppercase">Seleccionar Zonas</div>
                                <div className="max-h-60 overflow-y-auto space-y-1">
                                    {zones.map(z => (
                                        <div 
                                            key={z.id} 
                                            onClick={() => toggleZone(z.id)}
                                            className="flex items-center justify-between p-2 hover:bg-slate-800 rounded cursor-pointer"
                                        >
                                            <span className="text-sm text-slate-300">{z.name}</span>
                                            {selectedZones.includes(z.id) && <Check className="h-4 w-4 text-purple-500" />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Driver Filter Dropdown */}
                    <div className="relative">
                        <button
                            type="button"
                            aria-expanded={isDriverDropdownOpen}
                            onClick={() => {
                                setIsDriverDropdownOpen(prev => !prev);
                                setIsZoneDropdownOpen(false);
                            }}
                            className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:text-white hover:border-blue-500 transition-colors"
                        >
                            <Truck className="h-4 w-4 text-blue-400" />
                            {selectedDrivers.length > 0 ? `${selectedDrivers.length} Conductores` : 'Filtrar Conductores'}
                        </button>
                        {isDriverDropdownOpen && (
                            <div className="absolute top-full right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-xl p-2 z-[1000]">
                                <div className="text-xs font-semibold text-slate-500 mb-2 px-2 uppercase">Seleccionar Conductores</div>
                                <div className="max-h-60 overflow-y-auto space-y-1">
                                    {drivers.map(d => (
                                        <div 
                                            key={d.id} 
                                            onClick={() => toggleDriver(d.id)}
                                            className="flex items-center justify-between p-2 hover:bg-slate-800 rounded cursor-pointer"
                                        >
                                            <div className="flex flex-col">
                                                <span className="text-sm text-slate-300">{d.name}</span>
                                                <span className="text-[10px] text-slate-500">@{d.user?.username}</span>
                                            </div>
                                            {selectedDrivers.includes(d.id) && <Check className="h-4 w-4 text-blue-500" />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Package Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                        <input 
                            type="text"
                            placeholder="Buscar Paquete..."
                            value={packageSearch}
                            onChange={e => setPackageSearch(e.target.value)}
                            className="w-48 bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-green-500 text-sm"
                        />
                    </div>
                    
                    {/* Clear Filters */}
                    {(selectedZones.length > 0 || selectedDrivers.length > 0 || packageSearch) && (
                        <button 
                            type="button"
                            onClick={() => { setSelectedZones([]); setSelectedDrivers([]); setPackageSearch(''); setIsZoneDropdownOpen(false); setIsDriverDropdownOpen(false); }}
                            className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Limpiar Filtros"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Map Area */}
            <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden relative shadow-2xl">
                 <LiveMap 
                    visibleDriverIds={visibleDriverIds} 
                    allDrivers={drivers} 
                    packages={mapPackages}
                 />
            </div>
        </div>
    );
}
