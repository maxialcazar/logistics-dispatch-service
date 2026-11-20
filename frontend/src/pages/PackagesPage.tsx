import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Package, MapPin, Phone, Calendar, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { packageService, type Package as IPackage } from '../services/packageService';
import clsx from 'clsx';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Skeleton } from '../components/Skeleton';

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
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // New State for Archiving
  const [showArchived, setShowArchived] = useState(false);

  // Explicit row selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

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
    const normalized = searchTerm.trim().slice(0, 200);
    if (normalized === debouncedSearch) return;

    const timer = window.setTimeout(() => {
      setDebouncedSearch(normalized);
      setPage(1);
      setSelectedIds(new Set());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchTerm, debouncedSearch]);

  const fetchPackages = useCallback(async () => {
    if (!token) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');

    try {
      const res = await packageService.getPackages(
        token,
        activeFilter || undefined,
        page,
        10,
        showArchived,
        debouncedSearch || undefined,
        controller.signal
      );
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;

      const nextTotalPages = Math.max(1, res.meta.totalPages || 1);
      setTotalPages(nextTotalPages);

      if (page > nextTotalPages) {
        setPage(nextTotalPages);
        setSelectedIds(new Set());
        return;
      }

      setPackages(res.items);
    } catch (err: unknown) {
      if (
        controller.signal.aborted ||
        requestId !== requestIdRef.current ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        return;
      }
      console.error(err);
      setError('Error al cargar paquetes');
    } finally {
      if (requestId === requestIdRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [token, activeFilter, page, showArchived, debouncedSearch]);

  useEffect(() => {
    void fetchPackages();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetchPackages]);

  const visibleIds = packages.map(p => p.id);
  const selectedVisibleCount = visibleIds.filter(id => selectedIds.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected, loading, packages.length]);

  const toggleSelectRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach(id => next.delete(id));
      } else {
        visibleIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleArchiveClick = () => {
      if (!token) return;
      const selectedPackages = packages.filter(p => selectedIds.has(p.id));

      if (selectedPackages.length === 0) {
          setConfirmState({
              isOpen: true,
              title: 'Sin selección',
              message: 'Selecciona al menos un paquete finalizado (Entregado o Cancelado) para archivar.',
              variant: 'info',
              isLoading: false,
              hideCancel: true,
              confirmText: 'Entendido',
              action: async () => {} // Just close
          });
          return;
      }

      const toArchive = selectedPackages
        .filter(p => p.status === 'delivered' || p.status === 'cancelled')
        .map(p => p.id);

      if (toArchive.length === 0) {
          setConfirmState({
              isOpen: true,
              title: 'Información',
              message: 'Ninguno de los paquetes seleccionados está finalizado (Entregado o Cancelado) para archivar.',
              variant: 'info',
              isLoading: false,
              hideCancel: true,
              confirmText: 'Entendido',
              action: async () => {} // Just close
          });
          return;
      }

      const skippedCount = selectedPackages.length - toArchive.length;
      const skippedNote =
        skippedCount > 0
          ? ` (${skippedCount} ${skippedCount === 1 ? 'paquete activo seleccionado será omitido' : 'paquetes activos seleccionados serán omitidos'})`
          : '';

      setConfirmState({
          isOpen: true,
          title: 'Archivar Paquetes Seleccionados',
          message: `Se moverán ${toArchive.length} ${toArchive.length === 1 ? 'paquete finalizado' : 'paquetes finalizados'} (Entregados o Cancelados) a la sección de Expirados${skippedNote}. ¿Deseas continuar?`,
          variant: 'warning',
          isLoading: false,
          hideCancel: false,
          confirmText: 'Archivar',
          action: async () => {
              setConfirmState(prev => ({ ...prev, isLoading: true }));
              try {
                  await packageService.archivePackages(token, toArchive);
                  setSelectedIds(new Set());
                  toast.success(
                    `${toArchive.length} ${toArchive.length === 1 ? 'paquete archivado' : 'paquetes archivados'}`
                  );
                  await fetchPackages();
                  setConfirmState(prev => ({ ...prev, isLoading: false, isOpen: false }));
              } catch (e) {
                  console.error(e);
                  setConfirmState(prev => ({ ...prev, isLoading: false, isOpen: false }));
                  toast.error("Error al archivar paquetes");
              }
          }
      });
  };

  const handleDeleteClick = () => {
      if (!token) return;
      const toDelete = packages
        .filter(p => selectedIds.has(p.id))
        .map(p => p.id);

      if (toDelete.length === 0) {
          setConfirmState({
              isOpen: true,
              title: 'Sin selección',
              message: 'Selecciona al menos un paquete archivado para eliminar.',
              variant: 'info',
              isLoading: false,
              hideCancel: true,
              confirmText: 'Entendido',
              action: async () => {}
          });
          return;
      }

      setConfirmState({
          isOpen: true,
          title: 'Eliminar Paquetes Seleccionados',
          message: `Estás a punto de ELIMINAR PERMANENTEMENTE ${toDelete.length} ${toDelete.length === 1 ? 'paquete archivado seleccionado' : 'paquetes archivados seleccionados'}. Esta acción no se puede deshacer.`,
          variant: 'danger',
          isLoading: false,
          hideCancel: false,
          confirmText: 'Eliminar Seleccionados',
          action: async () => {
              setConfirmState(prev => ({ ...prev, isLoading: true }));
              try {
                  await packageService.deletePackages(token, toDelete);
                  setSelectedIds(new Set());
                  toast.success(
                    `${toDelete.length} ${toDelete.length === 1 ? 'paquete eliminado' : 'paquetes eliminados'}`
                  );
                  await fetchPackages();
                  setConfirmState(prev => ({ ...prev, isLoading: false, isOpen: false }));
              } catch (e) {
                  console.error(e);
                  setConfirmState(prev => ({ ...prev, isLoading: false, isOpen: false }));
                  toast.error("Error al eliminar paquetes");
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

  return (
    <div className="space-y-6">
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
        <div className="flex gap-2 flex-wrap">
            <button
                type="button"
                onClick={() => {
                  setShowArchived(!showArchived);
                  setPage(1);
                  setSelectedIds(new Set());
                }}
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
                        type="button"
                        onClick={handleArchiveClick}
                        disabled={selectedIds.size === 0 || loading}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 hover:bg-orange-900/40 hover:text-orange-400 hover:border-orange-500/50 text-slate-300 font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-800 disabled:hover:text-slate-300 disabled:hover:border-slate-700"
                        title={
                          selectedIds.size === 0
                            ? 'Selecciona paquetes finalizados para archivar'
                            : 'Mover paquetes finalizados seleccionados a Expirados'
                        }
                    >
                        Archivar Seleccionados ({selectedIds.size})
                    </button>
                    <button
                        type="button"
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
                    type="button"
                    onClick={handleDeleteClick}
                    disabled={selectedIds.size === 0 || loading}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600/20 border border-red-500/50 hover:bg-red-600 hover:text-white text-red-500 font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-600/20 disabled:hover:text-red-500"
                    title={
                      selectedIds.size === 0
                        ? 'Selecciona paquetes archivados para eliminar'
                        : 'Eliminar permanentemente los paquetes seleccionados'
                    }
                >
                    Eliminar Seleccionados ({selectedIds.size})
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
              maxLength={200}
              placeholder="Buscar por tracking, destinatario, dirección o teléfono..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-8 py-2 text-white focus:outline-none focus:border-blue-500 transition-all text-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setDebouncedSearch('');
                  setPage(1);
                  setSelectedIds(new Set());
                }}
                aria-label="Limpiar búsqueda"
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
         </div>
         <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
             {['', 'pending', 'assigned', 'in_transit', 'delivered', 'cancelled'].map((status) => (
               <button
                 type="button"
                 key={status}
                 onClick={() => {
                   setActiveFilter(status);
                   setPage(1);
                   setSelectedIds(new Set());
                 }}
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

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-blue-950/30 border border-blue-800/50 rounded-xl text-sm">
          <span className="text-blue-200 font-medium">
            {selectedIds.size} {selectedIds.size === 1 ? 'paquete seleccionado' : 'paquetes seleccionados'}
          </span>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-slate-300 hover:text-white underline underline-offset-2 transition-colors"
          >
            Limpiar selección
          </button>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        {loading ? (
             <div className="p-6 space-y-4">
                {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
             </div>
        ) : error ? (
             <div className="p-12 text-center text-red-400">Error: {error}</div>
        ) : packages.length === 0 ? (
             <div className="p-12 text-center text-slate-400 flex flex-col items-center">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="mb-4">
                  {debouncedSearch
                    ? `No se encontraron paquetes para "${debouncedSearch}".`
                    : 'No se encontraron paquetes.'}
                </p>
                <button
                    type="button"
                    onClick={() => navigate('/packages/new')}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg shadow-lg shadow-blue-900/30 transition-all"
                >
                    <Plus className="h-4 w-4" />
                    Crear Paquete
                </button>
             </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/50 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="w-12 px-4 py-4">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={handleToggleSelectAll}
                      disabled={packages.length === 0 || loading}
                      aria-label="Seleccionar todos los paquetes de la página actual"
                      className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </th>
                  <th className="px-6 py-4 font-semibold">Tracking</th>
                  <th className="px-6 py-4 font-semibold">Destinatario</th>
                  <th className="px-6 py-4 font-semibold">Ubicación</th>
                  <th className="px-6 py-4 font-semibold">Estado</th>
                  <th className="px-6 py-4 font-semibold">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-sm">
                {packages.map((pkg) => {
                  const isSelected = selectedIds.has(pkg.id);
                  return (
                  <tr
                    key={pkg.id}
                    className={clsx(
                      "hover:bg-slate-800/30 transition-colors group",
                      isSelected && "bg-blue-950/20"
                    )}
                  >
                    <td className="w-12 px-4 py-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectRow(pkg.id)}
                        aria-label={`Seleccionar paquete ${pkg.trackingCode}`}
                        className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                      />
                    </td>
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
                  );
                })}
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
                type="button"
                onClick={() => {
                  setPage(p => Math.max(1, p - 1));
                  setSelectedIds(new Set());
                }}
                disabled={page === 1 || loading}
                className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white" 
               >
                 Anterior
               </button>
               <button 
                type="button"
                onClick={() => {
                  setPage(p => Math.min(totalPages, p + 1));
                  setSelectedIds(new Set());
                }}
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
           onClose={() => {
             if (!confirmState.isLoading) {
               setConfirmState(prev => ({ ...prev, isOpen: false }));
             }
           }}
           onConfirm={confirmState.action}
           title={confirmState.title}
           message={confirmState.message}
           variant={confirmState.variant}
           isLoading={confirmState.isLoading}
           confirmText={confirmState.confirmText}
           hideCancel={confirmState.hideCancel}
       />
    </div>
  );
}
