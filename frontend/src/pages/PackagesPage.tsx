import { useState, useEffect } from 'react';
import { Plus, Package, MapPin, Phone, Calendar, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { packageService, type Package as IPackage } from '../services/packageService';
import clsx from 'clsx';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function PackagesPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [packages, setPackages] = useState<IPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>(''); // '' = all
  const [searchTerm, setSearchTerm] = useState('');
  
  // New State for Archiving
  const [showArchived, setShowArchived] = useState(false);

  // Confirmation Modal State
  const [confirmState, setConfirmState] = useState<{
      isOpen: boolean;
      title: string;
      message: string;
      action: () => Promise<void>;
      variant: 'warning' | 'danger' | 'info';
      isLoading: boolean;
      hideCancel?: boolean;
      confirmText?: string;
  }>({
      isOpen: false,
      title: '',
      message: '',
      action: async () => {},
      variant: 'warning',
      isLoading: false
  });

  useEffect(() => {
    fetchPackages();
  }, [token, activeFilter, page, showArchived]);

  const fetchPackages = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await packageService.getPackages(token, activeFilter || undefined, page, 10, showArchived);
      setPackages(res.items);
      setTotalPages(res.meta.totalPages);
    } catch (err: any) {
        console.error(err);
        setError("Error al cargar paquetes");
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveClick = () => {
      if (!token) return;
      const toArchive = packages
        .filter(p => p.status === 'delivered' || p.status === 'cancelled')
        .map(p => p.id);

      if (toArchive.length === 0) {
          setConfirmState({
              isOpen: true,
              title: 'Información',
              message: 'No hay paquetes finalizados (Entregados o Cancelados) para limpiar en esta página.',
              variant: 'info',
              isLoading: false,
              hideCancel: true,
              confirmText: 'Entendido',
              action: async () => {} // Just close
          });
          return;
      }

      setConfirmState({
          isOpen: true,
          title: 'Limpiar Paquetes Finalizados',
          message: `Se moverán ${toArchive.length} paquetes (Entregados o Cancelados) a la sección de Expirados. ¿Deseas continuar?`,
          variant: 'warning',
          isLoading: false,
          action: async () => {
              setConfirmState(prev => ({ ...prev, isLoading: true }));
              try {
                  await packageService.archivePackages(token, toArchive);
                  await fetchPackages(); 
                  setConfirmState(prev => ({ ...prev, isOpen: false }));
              } catch (e) {
                  console.error(e);
                  setConfirmState(prev => ({ ...prev, isLoading: false, isOpen: false }));
                  alert("Error al archivar paquetes"); 
              }
          }
      });
  };

  const handleDeleteClick = () => {
      if (!token) return;
      const toDelete = packages.map(p => p.id);

      if (toDelete.length === 0) return;

      setConfirmState({
          isOpen: true,
          title: 'Eliminar Historial Definitivamente',
          message: `Estás a punto de ELIMINAR PERMANENTEMENTE ${toDelete.length} paquetes archivados de esta página. Esta acción no se puede deshacer.`,
          variant: 'danger',
          isLoading: false,
          action: async () => {
              setConfirmState(prev => ({ ...prev, isLoading: true }));
              try {
                  await packageService.deletePackages(token, toDelete);
                  await fetchPackages();
                  setConfirmState(prev => ({ ...prev, isOpen: false }));
              } catch (e) {
                  console.error(e);
                  setConfirmState(prev => ({ ...prev, isLoading: false })); 
                  alert("Error al eliminar paquetes");
              }
          }
      });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">Pendiente</span>;
      case 'assigned': return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20">Asignado</span>;
      case 'in_transit': return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-500/10 text-purple-500 border border-purple-500/20">En Camino</span>;
      case 'delivered': return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20">Entregado</span>;
      case 'cancelled': return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20">Cancelado</span>;
      default: return <span className="text-slate-400">{status}</span>;
    }
  };

  // Note: filtering is client-side on the current PAGE only for now.
  // Ideally, search should trigger server-side query, but sticking to simple client filter for visual consistency with current code.
  const filteredPackages = packages.filter(p => 
    p.trackingCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.recipientName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* ... (Header and Toolbar remain same) ... */}
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Package className="h-8 w-8 text-blue-500" />
            {showArchived ? 'Paquetes Expirados' : 'Gestión de Paquetes'}
          </h1>
          <p className="text-slate-400 mt-1">
              {showArchived ? 'Historial de envíos archivados.' : 'Administra todos los envíos y su estado actual.'}
          </p>
        </div>
        <div className="flex gap-2">
            <button
                onClick={() => { setShowArchived(!showArchived); setPage(1); }}
                className={clsx(
                    "flex items-center gap-2 px-4 py-2 font-medium rounded-lg transition-all border",
                    showArchived 
                        ? "bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
                        : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white"
                )}
            >
                {showArchived ? 'Volver a Activos' : 'Ver Expirados'}
            </button>

            {!showArchived && (
                <>
                    <button
                        onClick={handleArchiveClick}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 hover:bg-orange-900/40 hover:text-orange-400 hover:border-orange-500/50 text-slate-300 font-medium rounded-lg transition-all"
                        title="Mover paquetes entregados/cancelados a Expirados"
                    >
                        Limpiar Finalizados
                    </button>
                    <button
                        onClick={() => navigate('/packages/new')}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg shadow-lg shadow-blue-900/30 transition-all"
                    >
                        <Plus className="h-5 w-5" />
                        Nuevo Paquete
                    </button>
                </>
            )}

            {showArchived && (
                 <button
                    onClick={handleDeleteClick}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600/20 border border-red-500/50 hover:bg-red-600 hover:text-white text-red-500 font-medium rounded-lg transition-all"
                >
                    Vaciar Lista
                </button>
            )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
         <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input 
              type="text"
              placeholder="Buscar por tracking o nombre..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-all text-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
         </div>
         <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
             {['', 'pending', 'assigned', 'in_transit', 'delivered', 'cancelled'].map((status) => (
               <button
                 key={status}
                 onClick={() => { setActiveFilter(status); setPage(1); }} // Reset page on filter change
                 className={clsx(
                   "px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border",
                   activeFilter === status 
                     ? "bg-blue-600/10 border-blue-600/30 text-blue-400" 
                     : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                 )}
               >
                 {status === '' ? 'Todos' : status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
               </button>
             ))}
         </div>
      </div>

      {/* Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        {loading ? (
             <div className="p-12 text-center text-slate-500 animate-pulse">Cargando paquetes...</div>
        ) : error ? (
             <div className="p-12 text-center text-red-400">Error: {error}</div>
        ) : filteredPackages.length === 0 ? (
             <div className="p-12 text-center text-slate-500">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No se encontraron paquetes.</p>
             </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/50 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-4 font-semibold">Tracking</th>
                  <th className="px-6 py-4 font-semibold">Destinatario</th>
                  <th className="px-6 py-4 font-semibold">Ubicación</th>
                  <th className="px-6 py-4 font-semibold">Estado</th>
                  <th className="px-6 py-4 font-semibold">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-sm">
                {filteredPackages.map((pkg) => (
                  <tr key={pkg.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-mono text-white font-medium">{pkg.trackingCode}</div>
                      <div className="text-xs text-slate-500">ID: {pkg.id.substring(0,8)}...</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-200 font-medium">{pkg.recipientName}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                         <Phone className="h-3 w-3" /> {pkg.recipientPhone}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-300 max-w-xs truncate" title={pkg.recipientAddress}>
                          {pkg.recipientAddress}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> Zona: {pkg.zone?.name || 'Sin Asignar'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(pkg.status)}
                    </td>
                    <td className="px-6 py-4 text-slate-400 whitespace-nowrap">
                       <div className="flex items-center gap-2">
                           <Calendar className="h-3 w-3" />
                           {new Date(pkg.createdAt).toLocaleDateString()}
                       </div>
                       <div className="text-xs text-slate-600 mt-0.5">
                           {new Date(pkg.createdAt).toLocaleTimeString()}
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

       {/* Pagination */}
       <div className="flex items-center justify-between text-sm text-slate-400 px-2 py-4 border-t border-slate-800 bg-slate-900/50 rounded-b-xl">
           <div>Página {page} de {totalPages}</div>
           <div className="flex gap-2">
               <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white" 
               >
                 Anterior
               </button>
               <button 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
                className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white" 
               >
                 Siguiente
               </button>
           </div>
       </div>

       {/* Confirm Dialog */}
       <ConfirmDialog
           isOpen={confirmState.isOpen}
           onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
           onConfirm={confirmState.action}
           title={confirmState.title}
           message={confirmState.message}
           variant={confirmState.variant}
           isLoading={confirmState.isLoading}
           confirmText={confirmState.variant === 'danger' ? 'Borrar Todo' : 'Confirmar'}
       />
    </div>
  );
}
