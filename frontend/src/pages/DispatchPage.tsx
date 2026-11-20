
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { driverService, type AppDriver } from '../services/driverService';
import { zoneService } from '../services/zoneService';
import { MapPin, Truck, Search, GripVertical, CheckCircle, AlertTriangle, Plus } from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface Zone {
    id: string;
    name: string;
    description?: string;
}

    export function DispatchPage() {
    const { token } = useAuth();
    const [zones, setZones] = useState<Zone[]>([]);
    const [drivers, setDrivers] = useState<AppDriver[]>([]);
    const [searchZone, setSearchZone] = useState('');
    const [searchDriver, setSearchDriver] = useState('');
    const [loadingAction, setLoadingAction] = useState<string | null>(null);
    const [selectedZoneByDriver, setSelectedZoneByDriver] = useState<Record<string, string>>({});

    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        variant: 'danger' | 'warning' | 'info';
        onConfirm: () => Promise<void>;
    }>({
        isOpen: false,
        title: '',
        message: '',
        variant: 'info',
        onConfirm: async () => {},
    });
    const [confirmLoading, setConfirmLoading] = useState(false);

    // Initial Load
    useEffect(() => {
        if (!token) return;
        Promise.all([
            zoneService.getZones(token),
            driverService.getDrivers(token)
        ]).then(([zonesData, driversData]) => {
            setZones(zonesData.items || []); 
            setDrivers(driversData.items || []);
        }).catch(err => {
            console.error(err);
            toast.error('Error al cargar datos');
        });
    }, [token]);

    // Drag & Drop Logic
    const handleDragStart = (e: React.DragEvent, zone: Zone) => {
        e.dataTransfer.setData('zoneId', zone.id);
        e.dataTransfer.setData('zoneName', zone.name);
        e.dataTransfer.effectAllowed = 'copy'; 
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); 
        e.dataTransfer.dropEffect = 'copy';
    };

    const requestAssignZone = (driver: AppDriver, zoneId: string, zoneName: string) => {
        if (!zoneId) return;

        if (driver.zones?.some(z => z.id === zoneId)) {
            toast.error(`La zona ${zoneName} ya está asignada a ${driver.name}`);
            return;
        }

        setConfirmConfig({
            isOpen: true,
            title: 'Confirmar Asignación',
            message: `¿Estás seguro de asignar la zona "${zoneName}" al conductor ${driver.name}?`,
            variant: 'info',
            onConfirm: () => performAction('assign', driver, zoneId, zoneName)
        });
    };

    const handleDrop = async (e: React.DragEvent, driver: AppDriver) => {
        e.preventDefault();
        const zoneId = e.dataTransfer.getData('zoneId');
        const zoneName = e.dataTransfer.getData('zoneName');

        requestAssignZone(driver, zoneId, zoneName);
    };

    const removeZone = async (driver: AppDriver, zoneId: string) => {
        const zone = driver.zones?.find(z => z.id === zoneId);
        if (!zone) return;

        setConfirmConfig({
            isOpen: true,
            title: 'Confirmar Retiro',
            message: `¿Estás seguro de retirar la zona "${zone.name}" del conductor ${driver.name}? El conductor dejará de recibir actualizaciones para esta zona inmediatamente.`,
            variant: 'warning',
            onConfirm: () => performAction('remove', driver, zoneId, zone.name)
        });
    };

    const performAction = async (type: 'assign' | 'remove', driver: AppDriver, zoneId: string, zoneName: string) => {
        setConfirmLoading(true);
        setLoadingAction(driver.id);
        const toastId = toast.loading(type === 'assign' ? 'Asignando zona...' : 'Desasignando zona...');

        try {
            let newZones: string[];
            const currentZones = driver.zones || [];
            
            if (type === 'assign') {
                newZones = [...currentZones.map(z => z.id), zoneId];
            } else {
                newZones = currentZones.filter(z => z.id !== zoneId).map(z => z.id);
            }

            await driverService.assignZones(token!, driver.id, newZones);
            
            toast.success(type === 'assign' ? `Zona asignada a ${driver.name}` : 'Zona desasignada', { id: toastId });
            
            // Optimistic Update
            setDrivers(prev => prev.map(d => {
                if (d.id === driver.id) {
                    const current = d.zones || [];
                    const updatedZones = type === 'assign' 
                        ? [...current, { id: zoneId, name: zoneName }]
                        : current.filter(z => z.id !== zoneId);
                    return { ...d, zones: updatedZones };
                }
                return d;
            }));

            if (type === 'assign') {
                setSelectedZoneByDriver(prev => ({ ...prev, [driver.id]: '' }));
            }
            setConfirmConfig(prev => ({ ...prev, isOpen: false }));

        } catch (err) {
            toast.error('Error al realizar la acción', { id: toastId });
            console.error(err);
        } finally {
            setLoadingAction(null);
            setConfirmLoading(false);
        }
    };

    // Filters
    const filteredZones = zones.filter(z => 
        z.name.toLowerCase().includes(searchZone.toLowerCase())
    );

    const filteredDrivers = drivers.filter(d => 
        d.name.toLowerCase().includes(searchDriver.toLowerCase()) || 
        d.user?.username.toLowerCase().includes(searchDriver.toLowerCase())
    );

    return (
        <div className="flex flex-col gap-4 md:h-full md:min-h-0">
            <ConfirmDialog 
                isOpen={confirmConfig.isOpen}
                onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmConfig.onConfirm}
                title={confirmConfig.title}
                message={confirmConfig.message}
                variant={confirmConfig.variant}
                isLoading={confirmLoading}
            />

            <div className="flex-shrink-0">
                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                    <GripVertical className="h-6 w-6 text-brand-400" />    
                    Centro de Despacho
                </h1>
                <p className="text-slate-400 text-sm mt-1">Arrastra las zonas hacia los conductores para asignarlas.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:flex-1 md:min-h-0">
                {/* Column 1: Zones (Draggable Source) */}
                <div className="bg-slate-900 border border-slate-800/80 rounded-xl flex flex-col min-h-0 overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-slate-800/80 bg-slate-900 flex-shrink-0">
                        <h2 className="text-base font-semibold text-white mb-2.5 flex items-center">
                            <MapPin className="h-4 w-4 mr-2 text-brand-400" />
                            Zonas Disponibles 
                            <span className="ml-2 text-xs tabular-nums bg-slate-950 border border-slate-800/80 px-2 py-0.5 rounded text-slate-300">{filteredZones.length}</span>
                        </h2>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                            <input 
                                type="text"
                                placeholder="Buscar zona..."
                                className="w-full bg-slate-950 border border-slate-800/80 rounded-lg pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 text-sm transition-colors"
                                value={searchZone}
                                onChange={e => setSearchZone(e.target.value)}
                            />
                        </div>
                    </div>
                    
                    <div className="flex-1 min-h-0 max-h-[360px] md:max-h-none overflow-y-auto custom-scrollbar p-4 space-y-2">
                        {filteredZones.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 border border-dashed border-slate-800/80 rounded-xl flex flex-col items-center justify-center">
                                <MapPin className="h-8 w-8 mb-2 text-slate-600" />
                                <p className="text-sm font-medium">No se encontraron zonas disponibles</p>
                            </div>
                        ) : (
                        filteredZones.map(zone => (
                            <div 
                                key={zone.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, zone)}
                                className="group p-3 bg-slate-950/70 hover:bg-brand-500/5 border border-slate-800/80 hover:border-brand-500/40 rounded-lg cursor-grab active:cursor-grabbing transition-all flex justify-between items-center"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <GripVertical className="h-4 w-4 text-slate-500 group-hover:text-brand-400 flex-shrink-0" />
                                    <div className="min-w-0">
                                        <div className="font-medium text-slate-200 group-hover:text-brand-300 truncate">{zone.name}</div>
                                        {zone.description && <div className="text-xs text-slate-400 truncate">{zone.description}</div>}
                                    </div>
                                </div>
                                <div className="h-2 w-2 rounded-full bg-brand-400 flex-shrink-0" />
                            </div>
                        ))
                        )}
                    </div>
                </div>

                {/* Column 2: Drivers (Drop Target) */}
                <div className="bg-slate-900 border border-slate-800/80 rounded-xl flex flex-col min-h-0 overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-slate-800/80 bg-slate-900 flex-shrink-0">
                         <h2 className="text-base font-semibold text-white mb-2.5 flex items-center">
                            <Truck className="h-4 w-4 mr-2 text-brand-400" />
                            Conductores Activos
                            <span className="ml-2 text-xs tabular-nums bg-slate-950 border border-slate-800/80 px-2 py-0.5 rounded text-slate-300">{filteredDrivers.length}</span>
                        </h2>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                            <input 
                                type="text"
                                placeholder="Buscar conductor..."
                                className="w-full bg-slate-950 border border-slate-800/80 rounded-lg pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 text-sm transition-colors"
                                value={searchDriver}
                                onChange={e => setSearchDriver(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 max-h-[480px] md:max-h-none overflow-y-auto custom-scrollbar p-4 space-y-3">
                        {filteredDrivers.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 border border-dashed border-slate-800/80 rounded-xl flex flex-col items-center justify-center">
                                <Truck className="h-8 w-8 mb-2 text-slate-600" />
                                <p className="text-sm font-medium">No se encontraron conductores activos</p>
                            </div>
                        ) : (
                        filteredDrivers.map(driver => {
                            const assignedZoneIds = new Set((driver.zones || []).map(z => z.id));
                            const availableZones = zones.filter(z => !assignedZoneIds.has(z.id));
                            const selectedZoneId = selectedZoneByDriver[driver.id] || '';
                            const selectedZone = availableZones.find(z => z.id === selectedZoneId);

                            return (
                            <div 
                                key={driver.id}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, driver)}
                                className={clsx(
                                    "p-4 bg-slate-950 border rounded-xl transition-all relative overflow-hidden",
                                    loadingAction === driver.id ? "border-brand-500 opacity-70 animate-pulse" : "border-slate-800/80 hover:border-brand-500/40"
                                )}
                            >
                                <div className="flex justify-between items-start gap-2 mb-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="h-10 w-10 bg-slate-900 rounded-full flex items-center justify-center border border-slate-800/80 flex-shrink-0">
                                            <Truck className="h-5 w-5 text-brand-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-semibold text-white truncate">{driver.name}</div>
                                            <div className="text-xs font-mono text-slate-400 truncate">@{driver.user?.username || 'sin-usuario'}</div>
                                        </div>
                                    </div>
                                    {(driver.zones?.length || 0) > 0 ? (
                                        <span className="bg-emerald-500/10 text-emerald-300 text-xs px-2 py-0.5 rounded-full border border-emerald-500/25 flex items-center gap-1 whitespace-nowrap">
                                            <CheckCircle className="h-3 w-3" /> Activo
                                        </span>
                                    ) : (
                                        <span className="bg-amber-500/10 text-amber-300 text-xs px-2 py-0.5 rounded-full border border-amber-500/25 flex items-center gap-1 whitespace-nowrap">
                                            <AlertTriangle className="h-3 w-3" /> Sin Zona
                                        </span>
                                    )}
                                </div>

                                {/* Assigned Zones List in Driver Card */}
                                <div className="space-y-2">
                                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Zonas Asignadas</div>
                                    {(!driver.zones || driver.zones.length === 0) && (
                                        <div className="text-sm text-slate-400 italic py-2 px-3 border border-dashed border-slate-800/80 rounded-lg text-center">
                                            Sin zonas asignadas. Arrastra una zona aquí o asígnala con el botón.
                                        </div>
                                    )}
                                    <div className="flex flex-wrap gap-2">
                                        {driver.zones?.map(z => (
                                            <div key={z.id} className="group flex items-center gap-1 bg-slate-900 border border-slate-800/80 text-slate-200 text-xs px-2.5 py-1.5 rounded-md hover:border-red-500/50 hover:bg-red-950/30 transition-colors cursor-pointer" onClick={() => removeZone(driver, z.id)}>
                                                <MapPin className="h-3 w-3 text-brand-400" />
                                                {z.name}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Accessible Zone Assignment */}
                                    <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row gap-2">
                                        <select
                                            aria-label={`Seleccionar zona para ${driver.name}`}
                                            value={selectedZoneId}
                                            onChange={e => setSelectedZoneByDriver(prev => ({ ...prev, [driver.id]: e.target.value }))}
                                            disabled={availableZones.length === 0 || loadingAction === driver.id}
                                            className="flex-1 bg-slate-900 border border-slate-800/80 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500 disabled:opacity-50"
                                        >
                                            <option value="">
                                                {availableZones.length === 0 ? 'Todas las zonas asignadas' : 'Seleccionar zona para asignar...'}
                                            </option>
                                            {availableZones.map(z => (
                                                <option key={z.id} value={z.id}>{z.name}</option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            disabled={!selectedZone || loadingAction === driver.id}
                                            onClick={() => selectedZone && requestAssignZone(driver, selectedZone.id, selectedZone.name)}
                                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[36px] bg-brand-600 hover:bg-brand-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                            Asignar
                                        </button>
                                    </div>
                                </div>
                            </div>
                            );
                        })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
