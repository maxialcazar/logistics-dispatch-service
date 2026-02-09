
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { driverService } from '../services/driverService';
import { zoneService } from '../services/zoneService';
import { packageService } from '../services/packageService';
import { LiveMap } from '../components/LiveMap';
import { Skeleton } from '../components/Skeleton';
import { Map, Filter, Search, X, Check, Package, MapPin, Truck } from 'lucide-react';
import clsx from 'clsx';

// Types
interface Zone { id: string; name: string; }
interface Driver { id: string; name: string; zones: { id: string }[]; user?: { username: string } }
interface ActivePackage { id: string; trackingCode: string; driverId?: string; status: string; }

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

    // Fetch Initial Data
    useEffect(() => {
        if (!token) return;
        const load = async () => {
            try {
                const [z, d, p] = await Promise.all([
                    zoneService.getZones(token),
                    driverService.getDrivers(token),
                    // Fetch only active packages for filtering
                    packageService.getPackages(token, 'assigned', 1), // Only page 1 for now? ideally all active.
                    // NOTE: Real-world app needs a dedicated 'search' endpoint. 
                    // For now we load partial active packages or search dynamically. 
                    // Let's rely on client-side filter of loaded packages, acknowledging limitation.
                ]);
                setZones(z.items || []);
                setDrivers(d.items || []);
                setActivePackages(p.items || []); // Only first page of packages. Valid for demo.
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [token]);

    // Derived Visible Drivers
    const visibleDriverIds = useMemo(() => {
        // Start with all drivers
        let filtered = drivers;

        // 1. Filter by Zones (OR logic: if driver has ANY of selected zones)
        if (selectedZones.length > 0) {
            filtered = filtered.filter(d => 
                d.zones?.some(z => selectedZones.includes(z.id))
            );
        }

        // 2. Filter by Specific Drivers (OR logic)
        if (selectedDrivers.length > 0) {
            filtered = filtered.filter(d => selectedDrivers.includes(d.id));
        }

        // 3. Filter by Package (AND logic: driver must carry matching package)
        if (packageSearch.length > 2) {
            // Find packages that match search
            const matches = activePackages.filter(p => 
                p.trackingCode.toLowerCase().includes(packageSearch.toLowerCase())
            );
            const driverIds = matches.map(p => p.driverId).filter(Boolean);
            filtered = filtered.filter(d => driverIds.includes(d.id));
        }

        return filtered.map(d => d.id);
    }, [drivers, activePackages, selectedZones, selectedDrivers, packageSearch]);

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
                    <div className="relative group">
                        <button className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:text-white hover:border-purple-500 transition-colors">
                            <MapPin className="h-4 w-4 text-purple-400" />
                            {selectedZones.length > 0 ? `${selectedZones.length} Zonas` : 'Filtrar Zonas'}
                        </button>
                        {/* Dropdown Content */}
                        <div className="absolute top-full right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-xl p-2 hidden group-hover:block z-[1000]">
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
                    </div>

                    {/* Driver Filter Dropdown */}
                    <div className="relative group">
                        <button className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:text-white hover:border-blue-500 transition-colors">
                            <Truck className="h-4 w-4 text-blue-400" />
                            {selectedDrivers.length > 0 ? `${selectedDrivers.length} Conductores` : 'Filtrar Conductores'}
                        </button>
                         <div className="absolute top-full right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-xl p-2 hidden group-hover:block z-[1000]">
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
                            onClick={() => { setSelectedZones([]); setSelectedDrivers([]); setPackageSearch(''); }}
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
                 <LiveMap visibleDriverIds={visibleDriverIds} />
            </div>
        </div>
    );
}
