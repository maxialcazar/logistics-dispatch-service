
import { useState, useEffect } from 'react';
import { Plus, Map, User, Search, Check, Power, Truck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { zoneService, type Zone } from '../services/zoneService';
import { driverService, type Driver } from '../services/driverService';
import { Modal } from '../components/Modal';
import { Skeleton } from '../components/Skeleton';
import { toast } from 'sonner';
import clsx from 'clsx';

import { ConfirmDialog } from '../components/ConfirmDialog';

export function ZonesPage() {
  const { token } = useAuth();
  const [zones, setZones] = useState<Zone[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Assign Modal
  const [assignZone, setAssignZone] = useState<Zone | null>(null);
  const [searchDriver, setSearchDriver] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Confirm Dialog
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

  const fetchData = async () => {
    if (!token) return;
    try {
      const [zonesData, driversData] = await Promise.all([
          zoneService.getZones(token),
          driverService.getDrivers(token)
      ]);
      setZones(zonesData.items || []);
      setDrivers(driversData.items || []);
    } catch (err: unknown) {
      toast.error('Error al cargar datos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleCreateZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZoneName.trim()) return;

    setCreateLoading(true);
    const toastId = toast.loading('Creando zona...');
    
    try {
      if (!token) throw new Error("No token");
      await zoneService.createZone(token, { name: newZoneName, coordinates: [] });
      toast.success('Zona creada', { id: toastId });
      setNewZoneName('');
      setShowCreateModal(false);
      fetchData(); 
    } catch (err: unknown) {
      if (err instanceof Error) {
           toast.error(err.message, { id: toastId });
      } else {
           toast.error('Error al crear zona', { id: toastId });
      }
    } finally {
      setCreateLoading(false);
    }
  };

  const handleToggleActive = async (zone: Zone) => {
    // Prevent activating if no driver
    if (!zone.isActive && !zone.driver) {
        toast.error('No se puede activar una zona sin conductor asignado');
        return;
    }

    const newStatus = !zone.isActive;
    const toastId = toast.loading(newStatus ? 'Activando zona...' : 'Desactivando zona...');

    try {
        await zoneService.updateZone(token!, zone.id, { isActive: newStatus });
        
        // Optimistic Update
        setZones(prev => prev.map(z => z.id === zone.id ? { ...z, isActive: newStatus } : z));
        toast.success(newStatus ? 'Zona activada' : 'Zona desactivada', { id: toastId });

        if (newStatus) {
            toast.info('Los paquetes pendientes en esta zona han sido asignados al conductor');
        }
    } catch (err: unknown) {
        toast.error('Error al actualizar estado', { id: toastId });
        console.error(err);
    }
  };

  const handleAssignDriver = async (driverId: string) => {
      if (!assignZone || !token) return;
      
      setActionLoading(true);
      const toastId = toast.loading('Asignando conductor...');
      
      try {
          await zoneService.updateZone(token, assignZone.id, { driverId });
          
          toast.success('Conductor asignado', { id: toastId });
          setAssignZone(null);
          // Refresh to get full object updates or do manual optimistic
          fetchData();
      } catch (err: unknown) {
          toast.error('Error al asignar conductor', { id: toastId });
          console.error(err);
      } finally {
          setActionLoading(false);
      }
  };

  const handleBulkStatus = (isActive: boolean) => {
    setConfirmConfig({
        isOpen: true,
        title: isActive ? 'Activar Todas las Zonas' : 'Desactivar Todas las Zonas',
        message: isActive 
             ? '¿Estás seguro de que deseas activar todas las zonas que tienen un conductor asignado? Esta acción asignará automáticamente los paquetes pendientes.' 
             : '¿Estás seguro de que deseas desactivar TODAS las zonas? Los conductores dejarán de recibir nuevas asignaciones.',
        variant: isActive ? 'info' : 'warning', // Warning for deactivation is safer than danger
        onConfirm: async () => {
             setConfirmLoading(true);
             const toastId = toast.loading(isActive ? 'Activando zonas...' : 'Desactivando zonas...');
             try {
                 await zoneService.setAllZonesStatus(token!, isActive);
                 toast.success(isActive ? 'Zonas activadas' : 'Zonas desactivadas', { id: toastId });
                 await fetchData();
                 setConfirmConfig(prev => ({ ...prev, isOpen: false }));
             } catch (err: unknown) {
                 if (err instanceof Error) {
                      toast.error(err.message, { id: toastId });
                 } else {
                      toast.error('Error al actualizar estado masivo', { id: toastId });
                 }
             } finally {
                 setConfirmLoading(false);
             }
        }
    });
  };

  /*
  const handleUnassignDriver = async (zone: Zone) => {
      if (!confirm('¿Desasignar conductor de esta zona?')) return;
      const toastId = toast.loading('Desasignando...');
      try {
          await zoneService.updateZone(token!, zone.id, { driverId: undefined });
          toast.success('Conductor desasignado', { id: toastId });
          setZones(prev => prev.map(z => z.id === zone.id ? { ...z, driver: undefined, isActive: false } : z));
      } catch (err) {
          toast.error('Error al desasignar');
      }
  };
  */

  // Filter drivers for modal
  const modalDrivers = drivers.filter(d => 
      d.name.toLowerCase().includes(searchDriver.toLowerCase()) ||
      d.user?.username.toLowerCase().includes(searchDriver.toLowerCase())
  );

  if (loading) return (
      <div className="space-y-6">
          <div className="flex justify-between">
               <Skeleton className="h-10 w-48" />
               <Skeleton className="h-10 w-32" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
          </div>
      </div>
  );

  return (
    <div className="space-y-6 relative h-[calc(100vh-100px)] flex flex-col">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Map className="h-8 w-8 text-purple-500" />
            Gestión de Zonas
          </h1>
          <p className="text-slate-400 mt-1">Administra y asigna conductores a tus zonas geográficas.</p>
        </div>
          <div className="flex gap-2">
            <button
               onClick={() => handleBulkStatus(false)}
               className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg border border-slate-700 transition-all hover:text-white"
            >
              <Power className="h-4 w-4 text-slate-400" />
              <span className="hidden sm:inline">Desactivar Todas</span>
            </button>
            <button
               onClick={() => handleBulkStatus(true)}
               className="flex items-center gap-2 px-4 py-2 bg-green-600/10 hover:bg-green-600/20 text-green-400 font-medium rounded-lg border border-green-600/20 hover:border-green-600/30 transition-all"
            >
              <Power className="h-4 w-4" />
              <span className="hidden sm:inline">Activar Todas</span>
            </button>
            <div className="w-px h-8 bg-slate-800 mx-2 hidden sm:block"></div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg shadow-lg shadow-purple-900/30 transition-all"
            >
              <Plus className="h-5 w-5" />
              <span className="hidden sm:inline">Nueva Zona</span>
            </button>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 overflow-y-auto min-h-0 pb-4 pr-2">
          {zones.map((zone) => (
            <div key={zone.id} className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col shadow-lg hover:border-slate-700 transition-all group relative overflow-hidden min-h-[220px]">
               {/* Active Indicator Gradient */}
               <div className={clsx(
                   "absolute top-0 left-0 right-0 h-1 transition-all duration-500", 
                   zone.isActive ? "bg-gradient-to-r from-green-500 to-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]" : "bg-slate-800"
               )} />

               {/* Card Content */}
               <div className="p-6 flex-1 flex flex-col">
                   {/* Header */}
                   <div className="mb-4">
                       <h3 className="text-xl font-bold text-white tracking-tight leading-snug line-clamp-2" title={zone.name}>
                           {zone.name}
                       </h3>
                       <div className="mt-2 flex items-center gap-2">
                           <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 select-all">
                               ID: {zone.id.slice(0, 8)}
                           </span>
                           {zone.isActive && (
                               <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-900/10 px-2 py-0.5 rounded border border-green-900/20 uppercase tracking-wider">
                                   <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                                   Activa
                               </span>
                           )}
                       </div>
                   </div>

                   {/* Middle Spacer / Stats (Future) */}
                   <div className="flex-1"></div>

                   {/* Footer Actions Area */}
                   <div className="pt-4 mt-2 border-t border-slate-800/50 flex flex-col gap-4">
                       
                       {/* Driver Section */}
                       <div className="flex items-center justify-between">
                           {zone.driver ? (
                               <div className="flex items-center gap-3 flex-1 min-w-0">
                                   <div className="h-10 w-10 shrink-0 rounded-full bg-blue-900/20 text-blue-400 flex items-center justify-center border border-blue-900/30">
                                       <User className="h-5 w-5" />
                                   </div>
                                   <div className="flex flex-col truncate">
                                       <span className="text-sm font-semibold text-slate-200 truncate">{zone.driver.name}</span>
                                       <button 
                                           onClick={() => setAssignZone(zone)}
                                           className="text-xs text-blue-400 hover:text-blue-300 text-left hover:underline truncate"
                                       >
                                           Cambiar conductor
                                       </button>
                                   </div>
                               </div>
                           ) : (
                               <button 
                                   onClick={() => setAssignZone(zone)}
                                   className="flex-1 py-2 px-3 border border-dashed border-slate-700 rounded-lg text-slate-400 hover:text-white hover:border-purple-500 hover:bg-purple-900/10 flex items-center justify-center gap-2 transition-all group-hover/btn text-sm"
                               >
                                   <Truck className="h-4 w-4" />
                                   <span>Asignar Conductor</span>
                               </button>
                           )}
                       </div>

                       {/* Toggle Switch (Full Width if needed or aligned) */}
                       <div className="flex items-center justify-between bg-slate-950/30 p-2 rounded-lg border border-slate-800/50">
                           <span className="text-xs font-medium text-slate-500 uppercase tracking-wider pl-1">Estado de Zona</span>
                           
                           <button 
                               onClick={() => handleToggleActive(zone)}
                               disabled={!zone.driver}
                               className={clsx(
                                   "relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-slate-900",
                                   zone.isActive ? "bg-green-600" : "bg-slate-700",
                                   !zone.driver && "opacity-50 cursor-not-allowed"
                               )}
                               title={!zone.driver ? "Asigna un conductor primero" : (zone.isActive ? "Desactivar Zona" : "Activar Zona")}
                           >
                               <span
                                   className={clsx(
                                       "inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-md",
                                       zone.isActive ? "translate-x-6" : "translate-x-1"
                                   )}
                               />
                           </button>
                       </div>
                   </div>
               </div>
            </div>
          ))}
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Crear Nueva Zona"
        footer={
           <button
             onClick={handleCreateZone}
             disabled={createLoading || !newZoneName.trim()}
             className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium shadow-lg shadow-purple-900/20 disabled:opacity-50"
           >
             {createLoading ? 'Creando...' : 'Crear Zona'}
           </button>
        }
      >
          <div className="space-y-4">
              <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Nombre</label>
                  <input 
                    type="text" 
                    value={newZoneName}
                    onChange={e => setNewZoneName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none"
                    placeholder="Ej. Zona Centro"
                    autoFocus
                  />
              </div>
          </div>
      </Modal>

      {/* Assign Driver Modal */}
      <Modal
        isOpen={!!assignZone}
        onClose={() => setAssignZone(null)}
        title={`Asignar Conductor a ${assignZone?.name}`}
      >
          <div className="space-y-4">
              <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input 
                      type="text"
                      value={searchDriver}
                      onChange={e => setSearchDriver(e.target.value)}
                      placeholder="Buscar conductor..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:border-blue-500 outline-none"
                      autoFocus
                  />
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                  {modalDrivers.map(driver => (
                      <button
                          key={driver.id}
                          disabled={actionLoading}
                          onClick={() => handleAssignDriver(driver.id)}
                          className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all group text-left"
                      >
                          <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-slate-800 group-hover:bg-slate-700 flex items-center justify-center text-slate-400 group-hover:text-blue-400 transition-colors">
                                  <Truck className="h-4 w-4" />
                              </div>
                              <div>
                                  <div className="text-sm font-medium text-slate-200">{driver.name}</div>
                                  <div className="text-xs text-slate-500">@{driver.user?.username}</div>
                              </div>
                          </div>
                          {assignZone?.driver?.id === driver.id && (
                              <Check className="h-4 w-4 text-green-500" />
                          )}
                      </button>
                  ))}
                  {modalDrivers.length === 0 && (
                      <div className="text-center py-6 text-slate-500 text-sm">
                          No se encontraron conductores.
                      </div>
                  )}
              </div>
          </div>
      </Modal>

      <ConfirmDialog 
          isOpen={confirmConfig.isOpen}
          onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
          onConfirm={confirmConfig.onConfirm}
          title={confirmConfig.title}
          message={confirmConfig.message}
          variant={confirmConfig.variant}
          isLoading={confirmLoading}
      />
    </div>
  );
}
