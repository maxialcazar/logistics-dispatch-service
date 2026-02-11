import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { packageService, type Package } from '../services/packageService';
import { MapPin, Truck, Check, X, Navigation, Phone, Route } from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { useDriverLocation } from '../hooks/useDriverLocation';

export function DriverDashboard() {
  const { token } = useAuth();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  // Enable Real-Time Tracking
  useDriverLocation();

  const fetchMyPackages = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await packageService.getMyPackages(token);
      // Filter out completed packages
      const active = data.filter(p => !['delivered', 'cancelled'].includes(p.status));
      setPackages(active);
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar paquetes');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchMyPackages();
  }, [fetchMyPackages]);

  const handleStatusUpdate = async (pkg: Package, newStatus: string) => {
    if (!token) return;
    setUpdating(pkg.id);
    const loadingToast = toast.loading('Actualizando estado...');

    try {
        await packageService.updateStatus(token, pkg.id, newStatus);
        
        toast.success(`Paquete ${newStatus === 'delivered' ? 'entregado' : newStatus}`, { id: loadingToast });
        
        if (['delivered', 'cancelled'].includes(newStatus)) {
            setPackages(prev => prev.filter(p => p.id !== pkg.id));
        } else {
             fetchMyPackages();
        }

    } catch (err: unknown) {
        let msg = 'Error al actualizar';
        if (err instanceof Error) msg = err.message;
        toast.error(msg, { id: loadingToast });
    } finally {
        setUpdating(null);
    }
  };

  const openNavigation = (pkg: Package) => {
      if (pkg.lat && pkg.lng) {
          window.open(`https://www.google.com/maps/dir/?api=1&destination=${pkg.lat},${pkg.lng}`, '_blank');
      } else {
          const cleanAddress = pkg.recipientAddress.trim();
          const query = encodeURIComponent(`${cleanAddress}, Argentina`);
          window.open(`https://www.google.com/maps/dir/?api=1&destination=${query}`, '_blank');
      }
  };

  const handleOptimizeRoute = () => {
    if (packages.length < 2) {
        toast.info("No hay suficientes paquetes para optimizar");
        return;
    }

    const toastId = toast.loading("Calculando ruta óptima...");

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude: startLat, longitude: startLng } = pos.coords;
            
            // Separate packages with and without GPS
            const withGPS = packages.filter(p => p.lat && p.lng);
            const withoutGPS = packages.filter(p => !p.lat || !p.lng);

            // Nearest Neighbor Algorithm
            let currentLat = startLat;
            let currentLng = startLng;
            const optimized: Package[] = [];
            const remaining = [...withGPS];

            while (remaining.length > 0) {
                // Find closest to current point
                let closestIndex = -1;
                let minDist = Infinity;

                remaining.forEach((p, idx) => {
                    const d = Math.pow(p.lat! - currentLat, 2) + Math.pow(p.lng! - currentLng, 2);
                    if (d < minDist) {
                        minDist = d;
                        closestIndex = idx;
                    }
                });

                if (closestIndex !== -1) {
                    const nextPkg = remaining[closestIndex];
                    optimized.push(nextPkg);
                    currentLat = nextPkg.lat!;
                    currentLng = nextPkg.lng!;
                    remaining.splice(closestIndex, 1);
                }
            }

            // Combine: Optimized GPS + Non-GPS at end
            setPackages([...optimized, ...withoutGPS]);
            toast.success("Ruta optimizada por cercanía", { id: toastId });
        },
        (err) => {
            console.error(err);
            toast.error("No se pudo obtener ubicación para optimizar", { id: toastId });
        }
    );
  };

  if (loading) {
      return <div className="p-8 text-center text-slate-500 animate-pulse">Cargando tareas...</div>;
  }

  if (packages.length === 0) {
       return (
          <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center h-full gap-4">
              <div className="h-20 w-20 bg-slate-800 rounded-full flex items-center justify-center">
                  <Check className="h-10 w-10 text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-white">¡Todo Listo!</h2>
              <p>No tienes paquetes pendientes asignados.</p>
              <button onClick={() => fetchMyPackages()} className="text-blue-500 underline text-sm">Actualizar</button>
          </div>
      );
  }

  return (
    <div className="p-4 space-y-4 pb-24 relative">
       <h2 className="text-lg font-bold text-white mb-2 flex justify-between items-center">
           <span>Mis Entregas ({packages.length})</span>
           <div className="flex gap-2">
               <button 
                  onClick={handleOptimizeRoute} 
                  className="text-xs text-purple-400 bg-purple-900/20 px-2 py-1 rounded border border-purple-500/20 flex items-center gap-1 hover:bg-purple-900/40 transition-colors"
                >
                  <Route size={12} /> Optimizar
               </button>
               <button onClick={() => fetchMyPackages()} className="text-xs text-blue-400 bg-blue-900/20 px-2 py-1 rounded hover:bg-blue-900/40 transition-colors">Refrescar</button>
           </div>
       </h2>
       
       {packages.map(pkg => (
           <div key={pkg.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg relative">
               {/* Header Status Bar */}
               <div className={clsx("h-1.5 w-full", 
                   pkg.status === 'in_transit' ? 'bg-purple-500 animate-pulse' : 
                   pkg.status === 'assigned' ? 'bg-blue-500' : 'bg-slate-700'
               )} />

               <div className="p-4">
                   <div className="flex justify-between items-start mb-2">
                       <span className="font-mono text-xs text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">#{pkg.trackingCode}</span>
                       <span className={clsx(
                           "text-xs font-bold px-2 py-0.5 rounded-full uppercase",
                           pkg.status === 'in_transit' ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" :
                           pkg.status === 'assigned' ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : 
                           "bg-slate-700 text-slate-400"
                       )}>
                           {pkg.status.replace('_', ' ')}
                       </span>
                   </div>

                   <h3 className="text-lg font-bold text-white mb-1">{pkg.recipientName}</h3>
                   
                   <div className="flex items-start gap-2 text-slate-300 text-sm mb-3">
                       <MapPin className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                       <span className="leading-tight">{pkg.recipientAddress}</span>
                   </div>

                   {pkg.recipientPhone && (
                       <div className="flex items-center gap-2 text-slate-400 text-xs mb-4">
                           <Phone className="h-3 w-3" />
                           <span>{pkg.recipientPhone}</span>
                       </div>
                   )}
                
                   {/* ACTION BUTTONS */}
                   <div className="grid grid-cols-2 gap-3 mt-4">
                       <button 
                           onClick={() => openNavigation(pkg)}
                           className="col-span-2 bg-slate-800 hover:bg-slate-700 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 border border-slate-700 transition-all"
                       >
                           <Navigation className="h-4 w-4 text-blue-400" />
                           Navegar a Destino
                       </button>

                       {pkg.status !== 'in_transit' ? (
                           <button 
                               onClick={() => handleStatusUpdate(pkg, 'in_transit')}
                               disabled={!!updating}
                               className="col-span-2 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2 active:scale-95 transition-transform"
                           >
                               <Truck className="h-5 w-5" />
                               Iniciar Viaje
                           </button>
                       ) : (
                           <>
                               <button 
                                   onClick={() => handleStatusUpdate(pkg, 'delivered')}
                                   disabled={!!updating}
                                   className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-green-900/30 flex items-center justify-center gap-2 active:scale-95 transition-transform"
                               >
                                   <Check className="h-5 w-5" />
                                   Entregado
                               </button>
                               <button 
                                   onClick={() => handleStatusUpdate(pkg, 'cancelled')}
                                   disabled={!!updating}
                                   className="bg-red-600/10 border border-red-500/30 hover:bg-red-600 hover:text-white text-red-500 font-bold py-3 rounded-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
                               >
                                   <X className="h-5 w-5" />
                                   Fallido
                               </button>
                           </>
                       )}
                   </div>
               </div>
           </div>
       ))}
    </div>
  );
}
