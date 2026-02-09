
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { driverService } from '../services/driverService';
import { zoneService } from '../services/zoneService';
import { MapPin, Truck, Search, GripVertical, CheckCircle, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Modal } from '../components/Modal';

interface Zone {
    id: string;
    name: string;
    description?: string;
}

interface Driver {
    id: string;
    name: string;
    user: { username: string };
    zones: { id: string, name: string }[];
}

export function DispatchPage() {
    const { token } = useAuth();
    const [zones, setZones] = useState<Zone[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchZone, setSearchZone] = useState('');
    const [searchDriver, setSearchDriver] = useState('');
    const [loadingAction, setLoadingAction] = useState<string | null>(null);

    // Confirmation Modal State
    const [confirmAction, setConfirmAction] = useState<{
        type: 'assign' | 'remove';
        driver: Driver;
        zoneId: string;
        zoneName: string;
    } | null>(null);

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
        }).finally(() => setLoading(false));
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

    const handleDrop = async (e: React.DragEvent, driver: Driver) => {
        e.preventDefault();
        const zoneId = e.dataTransfer.getData('zoneId');
        const zoneName = e.dataTransfer.getData('zoneName');
        
        if (!zoneId) return;

        // Check if already assigned
        if (driver.zones.some(z => z.id === zoneId)) {
            toast.error(`La zona ${zoneName} ya está asignada a ${driver.name}`);
            return;
        }

        // Open Modal
        setConfirmAction({
            type: 'assign',
            driver,
            zoneId,
            zoneName
        });
    };

    const removeZone = async (driver: Driver, zoneId: string) => {
        const zone = driver.zones.find(z => z.id === zoneId);
        if (!zone) return;

        // Open Modal
        setConfirmAction({
            type: 'remove',
            driver,
            zoneId,
            zoneName: zone.name
        });
    };

    // Execute Logic (called by Modal Confirm)
    const executeAction = async () => {
        if (!confirmAction) return;

        const { type, driver, zoneId, zoneName } = confirmAction;
        setLoadingAction(driver.id);
        const toastId = toast.loading(type === 'assign' ? 'Asignando zona...' : 'Desasignando zona...');

        try {
            let newZones: string[];
            
            if (type === 'assign') {
                newZones = [...driver.zones.map(z => z.id), zoneId];
            } else {
                newZones = driver.zones.filter(z => z.id !== zoneId).map(z => z.id);
            }

            await driverService.assignZones(token!, driver.id, newZones);
            
            toast.success(type === 'assign' ? `Zona asignada a ${driver.name}` : 'Zona desasignada', { id: toastId });
            
            // Optimistic Update
            setDrivers(prev => prev.map(d => {
                if (d.id === driver.id) {
                    const updatedZones = type === 'assign' 
                        ? [...d.zones, { id: zoneId, name: zoneName }]
                        : d.zones.filter(z => z.id !== zoneId);
                    return { ...d, zones: updatedZones };
                }
                return d;
            }));

        } catch (err) {
            toast.error('Error al realizar la acción', { id: toastId });
            console.error(err);
        } finally {
            setLoadingAction(null);
            setConfirmAction(null);
        }
    };

    // Filters
    const filteredZones = zones.filter(z => 
        z.name.toLowerCase().includes(searchZone.toLowerCase())
    );

    const filteredDrivers = drivers.filter(d => 
        d.name.toLowerCase().includes(searchDriver.toLowerCase()) || 
        d.user.username.toLowerCase().includes(searchDriver.toLowerCase())
    );

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col space-y-4">
            {/* Modal */}
            <Modal 
                isOpen={!!confirmAction} 
                onClose={() => setConfirmAction(null)}
                title={confirmAction?.type === 'assign' ? 'Confirmar Asignación' : 'Confirmar Retiro'}
                footer={
                    <>
                        <button 
                            onClick={() => setConfirmAction(null)} 
                            className="px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors text-sm font-medium"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={executeAction} 
                            className={clsx(
                                "px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors shadow-lg",
                                confirmAction?.type === 'assign' 
                                    ? "bg-blue-600 hover:bg-blue-500 shadow-blue-900/20" 
                                    : "bg-red-600 hover:bg-red-500 shadow-red-900/20"
                            )}
                        >
                            {confirmAction?.type === 'assign' ? 'Asignar Zona' : 'Retirar Zona'}
                        </button>
                    </>
                }
            >
                {confirmAction && (
                    <div className="space-y-3">
                        <p className="text-slate-400">
                            {confirmAction.type === 'assign' 
                                ? `¿Estás seguro de asignar la zona ` 
                                : `¿Estás seguro de retirar la zona `
                            }
                            <span className="text-purple-400 font-semibold">{confirmAction.zoneName}</span>
                            {confirmAction.type === 'assign' ? ' al conductor ' : ' del conductor '}
                            <span className="text-blue-400 font-semibold">{confirmAction.driver.name}</span>?
                        </p>
                        {confirmAction.type === 'remove' && (
                            <div className="p-3 bg-red-900/10 border border-red-900/30 rounded-lg flex items-start gap-3">
                                <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                                <p className="text-xs text-red-400">
                                    El conductor dejará de recibir actualizaciones para esta zona inmediatamente.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <GripVertical className="h-6 w-6 text-blue-500" />    
                Centro de Despacho
            </h1>
            <p className="text-slate-400 text-sm">Arrastra las zonas hacia los conductores para asignarlas.</p>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 min-h-0">
                {/* Column 1: Zones (Draggable Source) */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden shadow-lg">
                    <div className="p-4 border-b border-slate-800 bg-slate-900 sticky top-0 z-10">
                        <h2 className="text-lg font-semibold text-white mb-2 flex items-center">
                            <MapPin className="h-5 w-5 mr-2 text-purple-400" />
                            Zonas Disponibles 
                            <span className="ml-2 text-xs bg-slate-800 px-2 py-0.5 rounded text-slate-400">{filteredZones.length}</span>
                        </h2>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                            <input 
                                type="text"
                                placeholder="Buscar zona..."
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-purple-500 text-sm"
                                value={searchZone}
                                onChange={e => setSearchZone(e.target.value)}
                            />
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {filteredZones.map(zone => (
                            <div 
                                key={zone.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, zone)}
                                className="group p-3 bg-slate-800/50 hover:bg-purple-900/20 border border-slate-700 hover:border-purple-500/50 rounded-lg cursor-grab active:cursor-grabbing transition-all flex justify-between items-center"
                            >
                                <div className="flex items-center gap-3">
                                    <GripVertical className="h-4 w-4 text-slate-600 group-hover:text-purple-400" />
                                    <div>
                                        <div className="font-medium text-slate-200 group-hover:text-purple-300">{zone.name}</div>
                                        {zone.description && <div className="text-xs text-slate-500">{zone.description}</div>}
                                    </div>
                                </div>
                                <div className="h-2 w-2 rounded-full bg-purple-500"></div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Column 2: Drivers (Drop Target) */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden shadow-lg">
                    <div className="p-4 border-b border-slate-800 bg-slate-900 sticky top-0 z-10">
                         <h2 className="text-lg font-semibold text-white mb-2 flex items-center">
                            <Truck className="h-5 w-5 mr-2 text-blue-400" />
                            Conductores Activos
                            <span className="ml-2 text-xs bg-slate-800 px-2 py-0.5 rounded text-slate-400">{filteredDrivers.length}</span>
                        </h2>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                            <input 
                                type="text"
                                placeholder="Buscar conductor..."
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-blue-500 text-sm"
                                value={searchDriver}
                                onChange={e => setSearchDriver(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {filteredDrivers.map(driver => (
                            <div 
                                key={driver.id}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, driver)}
                                className={clsx(
                                    "p-4 bg-slate-950 border-2 rounded-xl transition-all relative overflow-hidden",
                                    loadingAction === driver.id ? "border-blue-500 opacity-70 animate-pulse" : "border-slate-800 hover:border-blue-500/50"
                                )}
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 bg-slate-800 rounded-full flex items-center justify-center border border-slate-700">
                                            <Truck className="h-5 w-5 text-blue-400" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-white">{driver.name}</div>
                                            <div className="text-xs text-slate-500">@{driver.user?.username || 'sin-usuario'}</div>
                                        </div>
                                    </div>
                                    {driver.zones?.length > 0 ? (
                                        <span className="bg-green-500/10 text-green-500 text-xs px-2 py-1 rounded border border-green-500/20 flex items-center gap-1">
                                            <CheckCircle className="h-3 w-3" /> Activo
                                        </span>
                                    ) : (
                                        <span className="bg-yellow-500/10 text-yellow-500 text-xs px-2 py-1 rounded border border-yellow-500/20 flex items-center gap-1">
                                            <AlertTriangle className="h-3 w-3" /> Sin Zona
                                        </span>
                                    )}
                                </div>

                                {/* Assigned Zones List in Driver Card */}
                                <div className="space-y-2">
                                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Zonas Asignadas</div>
                                    {driver.zones?.length === 0 && (
                                        <div className="text-sm text-slate-600 italic py-2 border-2 border-dashed border-slate-800 rounded-lg text-center">
                                            Arrastra una zona aquí
                                        </div>
                                    )}
                                    <div className="flex flex-wrap gap-2">
                                        {driver.zones?.map(z => (
                                            <div key={z.id} className="group flex items-center gap-1 bg-slate-800/100 border border-slate-700 text-slate-300 text-xs px-2 py-1.5 rounded-md hover:border-red-500/50 hover:bg-red-900/10 transition-colors cursor-pointer" onClick={() => removeZone(driver, z.id)}>
                                                <MapPin className="h-3 w-3 text-purple-400" />
                                                {z.name}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
