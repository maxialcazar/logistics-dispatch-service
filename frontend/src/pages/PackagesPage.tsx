import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Archive,
  ArchiveRestore,
  Calendar,
  Check,
  Copy,
  Download,
  FilterX,
  Loader2,
  MapPin,
  Package,
  PanelRightOpen,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { packageService, type Package as IPackage } from '../services/packageService';
import { zoneService, type Zone } from '../services/zoneService';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { BulkImportModal } from '../components/BulkImportModal';
import { PackageDetailDrawer } from '../components/PackageDetailDrawer';
import { Skeleton, SkeletonTableRows } from '../components/Skeleton';
import { StatusBadge } from '../components/StatusBadge';
import { PACKAGE_STATUS_ORDER, getPackageStatusToken } from '../utils/packageStatus';
import { buildTrackingUrl, copyTextToClipboard } from '../utils/trackingLinks';

const PAGE_LIMIT = 15;

export function PackagesPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = (searchParams.get('search') ?? '').trim().slice(0, 200);

  const statePackageId =
    typeof (location.state as { packageId?: unknown } | null)?.packageId === 'string'
      ? (location.state as { packageId: string }).packageId
      : null;

  const [syncedUrlSearch, setSyncedUrlSearch] = useState(urlSearch);
  const [syncedLocationKey, setSyncedLocationKey] = useState('');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [packages, setPackages] = useState<IPackage[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Server-side filters
  const [activeFilter, setActiveFilter] = useState<string>('');
  const [zoneFilter, setZoneFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [showArchived, setShowArchived] = useState(false);
  const [searchTerm, setSearchTerm] = useState(urlSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(urlSearch);

  // Selection & Modals/Drawers
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [detailPackageId, setDetailPackageId] = useState<string | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkModalKey, setBulkModalKey] = useState(0);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const selectAllRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const copyFeedbackTimerRef = useRef<number | null>(null);

  // Sync URL search query param (e.g. from CommandPalette)
  if (urlSearch !== syncedUrlSearch) {
    setSyncedUrlSearch(urlSearch);
    setSearchTerm(urlSearch);
    setDebouncedSearch(urlSearch);
    setPage(1);
    setSelectedIds(new Set());
    if (urlSearch) {
      setActiveFilter('');
      setZoneFilter('');
      setDateFrom('');
      setDateTo('');
      setShowArchived(false);
    }
  }

  // Open detail drawer when navigated with explicit packageId from CommandPalette
  if (statePackageId && location.key !== syncedLocationKey) {
    setSyncedLocationKey(location.key);
    setDetailPackageId(statePackageId);
  }

  const clearUrlSearchParam = () => {
    if (!searchParams.has('search')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('search');
    setSyncedUrlSearch('');
    setSearchParams(next, { replace: true });
  };

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
    isLoading: false,
  });

  const hasInvalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const hasActiveFilters = Boolean(
    activeFilter || zoneFilter || dateFrom || dateTo || debouncedSearch || searchTerm
  );

  // Debounce search input
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

  // Load zones once per session token
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();

    zoneService
      .getZones(token, 1, 100, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setZones(res.items || []);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
          return;
        }
        console.error('Error loading zones for filter:', err);
      });

    return () => controller.abort();
  }, [token]);

  const fetchPackages = useCallback(async () => {
    if (!token) return;
    if (hasInvalidDateRange) {
      abortControllerRef.current?.abort();
      setLoading(false);
      return;
    }

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
        PAGE_LIMIT,
        showArchived,
        debouncedSearch || undefined,
        controller.signal,
        {
          zoneId: zoneFilter || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }
      );
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;

      const nextTotalPages = Math.max(1, res.meta.totalPages || 1);
      setTotalPages(nextTotalPages);
      setTotalItems(res.meta.total ?? res.items.length);

      if (page > nextTotalPages) {
        setPage(nextTotalPages);
        setSelectedIds(new Set());
        return;
      }

      setPackages(res.items);
      setSelectedIds((prev) => {
        if (prev.size === 0) return prev;
        const visible = new Set(res.items.map((item) => item.id));
        const next = new Set(Array.from(prev).filter((id) => visible.has(id)));
        return next.size === prev.size ? prev : next;
      });
    } catch (err: unknown) {
      if (
        controller.signal.aborted ||
        requestId !== requestIdRef.current ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        return;
      }
      console.error(err);
      setError(err instanceof Error ? err.message : 'Error al cargar paquetes');
    } finally {
      if (requestId === requestIdRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [
    token,
    activeFilter,
    zoneFilter,
    dateFrom,
    dateTo,
    hasInvalidDateRange,
    page,
    showArchived,
    debouncedSearch,
  ]);

  useEffect(() => {
    void fetchPackages();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetchPackages]);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current !== null) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }
    };
  }, []);

  const visibleIds = packages.map((p) => p.id);
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected, loading, packages.length]);

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
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
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleResetFilters = () => {
    clearUrlSearchParam();
    setSearchTerm('');
    setDebouncedSearch('');
    setActiveFilter('');
    setZoneFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
    setSelectedIds(new Set());
  };

  const handleCopyTrackingLink = useCallback(
    async (trackingCode: string, packageId?: string): Promise<boolean> => {
      const url = buildTrackingUrl(trackingCode);
      const copied = await copyTextToClipboard(url);
      if (!copied) {
        toast.error('No se pudo copiar el enlace al portapapeles.');
        return false;
      }

      toast.success(`Enlace de tracking copiado (${trackingCode})`);
      if (packageId) {
        setCopiedId(packageId);
        if (copyFeedbackTimerRef.current !== null) {
          window.clearTimeout(copyFeedbackTimerRef.current);
        }
        copyFeedbackTimerRef.current = window.setTimeout(() => {
          setCopiedId(null);
        }, 1800);
      }
      return true;
    },
    []
  );

  const handleExportCsv = async () => {
    if (!token || exportingCsv) return;
    if (hasInvalidDateRange) {
      toast.error('Corrige el rango de fechas antes de exportar.');
      return;
    }

    setExportingCsv(true);
    let objectUrl: string | null = null;

    try {
      const { blob, filename } = await packageService.exportPackagesCsv(token, {
        search: debouncedSearch || undefined,
        status: activeFilter || undefined,
        zoneId: zoneFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        isArchived: showArchived,
      });

      objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download =
        filename || `paquetes-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      toast.success('Exportación CSV descargada');
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : 'Error al exportar paquetes en CSV.'
      );
    } finally {
      if (objectUrl) {
        const urlToRevoke = objectUrl;
        window.setTimeout(() => URL.revokeObjectURL(urlToRevoke), 1000);
      }
      setExportingCsv(false);
    }
  };

  const handleArchiveClick = () => {
    if (!token) return;
    const selectedPackages = packages.filter((p) => selectedIds.has(p.id));

    if (selectedPackages.length === 0) {
      setConfirmState({
        isOpen: true,
        title: 'Sin selección',
        message:
          'Selecciona al menos un paquete finalizado (Entregado o Cancelado) para archivar.',
        variant: 'info',
        isLoading: false,
        hideCancel: true,
        confirmText: 'Entendido',
        action: async () => {},
      });
      return;
    }

    const toArchive = selectedPackages
      .filter((p) => p.status === 'delivered' || p.status === 'cancelled')
      .map((p) => p.id);

    if (toArchive.length === 0) {
      setConfirmState({
        isOpen: true,
        title: 'Información',
        message:
          'Ninguno de los paquetes seleccionados está finalizado (Entregado o Cancelado) para archivar.',
        variant: 'info',
        isLoading: false,
        hideCancel: true,
        confirmText: 'Entendido',
        action: async () => {},
      });
      return;
    }

    const skippedCount = selectedPackages.length - toArchive.length;
    const skippedNote =
      skippedCount > 0
        ? ` (${skippedCount} ${
            skippedCount === 1
              ? 'paquete activo seleccionado será omitido'
              : 'paquetes activos seleccionados serán omitidos'
          })`
        : '';

    setConfirmState({
      isOpen: true,
      title: 'Archivar Paquetes Seleccionados',
      message: `Se moverán ${toArchive.length} ${
        toArchive.length === 1 ? 'paquete finalizado' : 'paquetes finalizados'
      } (Entregados o Cancelados) a la sección de Expirados${skippedNote}. ¿Deseas continuar?`,
      variant: 'warning',
      isLoading: false,
      hideCancel: false,
      confirmText: 'Archivar',
      action: async () => {
        setConfirmState((prev) => ({ ...prev, isLoading: true }));
        try {
          await packageService.archivePackages(token, toArchive);
          setSelectedIds(new Set());
          toast.success(
            `${toArchive.length} ${
              toArchive.length === 1 ? 'paquete archivado' : 'paquetes archivados'
            }`
          );
          await fetchPackages();
          setConfirmState((prev) => ({ ...prev, isLoading: false, isOpen: false }));
        } catch (e) {
          console.error(e);
          setConfirmState((prev) => ({ ...prev, isLoading: false, isOpen: false }));
          toast.error('Error al archivar paquetes');
        }
      },
    });
  };

  const handleUnarchiveIds = async (targetIds: string[]) => {
    if (!token || targetIds.length === 0) return;

    setConfirmState({
      isOpen: true,
      title: 'Restaurar Paquetes Archivados',
      message: `Se restaurarán ${targetIds.length} ${
        targetIds.length === 1 ? 'paquete' : 'paquetes'
      } de Expirados a la lista de Activos.`,
      variant: 'info',
      isLoading: false,
      hideCancel: false,
      confirmText: 'Restaurar',
      action: async () => {
        setConfirmState((prev) => ({ ...prev, isLoading: true }));
        try {
          const res = await packageService.unarchivePackages(token, targetIds);
          setSelectedIds(new Set());
          toast.success(
            `${res.count} ${
              res.count === 1 ? 'paquete restaurado' : 'paquetes restaurados'
            }`
          );
          await fetchPackages();
          setConfirmState((prev) => ({ ...prev, isLoading: false, isOpen: false }));
        } catch (err: unknown) {
          console.error(err);
          setConfirmState((prev) => ({ ...prev, isLoading: false, isOpen: false }));
          toast.error(
            err instanceof Error ? err.message : 'Error al desarchivar paquetes'
          );
        }
      },
    });
  };

  const handleDeleteClick = () => {
    if (!token) return;
    const toDelete = packages.filter((p) => selectedIds.has(p.id)).map((p) => p.id);

    if (toDelete.length === 0) {
      setConfirmState({
        isOpen: true,
        title: 'Sin selección',
        message: 'Selecciona al menos un paquete archivado para eliminar.',
        variant: 'info',
        isLoading: false,
        hideCancel: true,
        confirmText: 'Entendido',
        action: async () => {},
      });
      return;
    }

    setConfirmState({
      isOpen: true,
      title: 'Eliminar Paquetes Seleccionados',
      message: `Estás a punto de ELIMINAR PERMANENTEMENTE ${toDelete.length} ${
        toDelete.length === 1
          ? 'paquete archivado seleccionado'
          : 'paquetes archivados seleccionados'
      }. Esta acción no se puede deshacer.`,
      variant: 'danger',
      isLoading: false,
      hideCancel: false,
      confirmText: 'Eliminar Seleccionados',
      action: async () => {
        setConfirmState((prev) => ({ ...prev, isLoading: true }));
        try {
          await packageService.deletePackages(token, toDelete);
          setSelectedIds(new Set());
          toast.success(
            `${toDelete.length} ${
              toDelete.length === 1 ? 'paquete eliminado' : 'paquetes eliminados'
            }`
          );
          await fetchPackages();
          setConfirmState((prev) => ({ ...prev, isLoading: false, isOpen: false }));
        } catch (e) {
          console.error(e);
          setConfirmState((prev) => ({ ...prev, isLoading: false, isOpen: false }));
          toast.error('Error al eliminar paquetes');
        }
      },
    });
  };

  const openBulkImport = () => {
    setBulkModalKey((prev) => prev + 1);
    setShowBulkModal(true);
  };

  return (
    <div className="space-y-4">
      {/* Compact High-Density Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <Package className="h-6 w-6 text-brand-400 shrink-0" />
              <span>{showArchived ? 'Paquetes Expirados' : 'Gestión de Paquetes'}</span>
            </h1>
            <span className="inline-flex items-center rounded-full border border-slate-800/80 bg-slate-900 px-2.5 py-0.5 text-xs font-mono text-slate-300 tabular-nums">
              {totalItems} {totalItems === 1 ? 'envío' : 'envíos'}
            </span>
          </div>
          <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
            {showArchived
              ? 'Historial de envíos archivados listos para restaurar o depurar.'
              : 'Vista operativa de alta densidad con filtros, importación masiva y detalle POD.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowArchived((prev) => !prev);
              setPage(1);
              setSelectedIds(new Set());
            }}
            className={clsx(
              'min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border',
              showArchived
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                : 'bg-slate-900 border-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800'
            )}
          >
            {showArchived ? (
              <>
                <Package className="h-3.5 w-3.5" />
                <span>Ver Activos</span>
              </>
            ) : (
              <>
                <Archive className="h-3.5 w-3.5" />
                <span>Ver Expirados</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exportingCsv || hasInvalidDateRange}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exportingCsv ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-400" />
            ) : (
              <Download className="h-3.5 w-3.5 text-brand-400" />
            )}
            <span>Exportar CSV</span>
          </button>

          {!showArchived && (
            <>
              <button
                type="button"
                onClick={openBulkImport}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white text-xs font-medium rounded-lg transition-colors"
              >
                <Upload className="h-3.5 w-3.5 text-brand-400" />
                <span>Importar CSV/JSON</span>
              </button>

              <button
                type="button"
                onClick={() => navigate('/packages/new')}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-brand-950/30 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Nuevo Paquete</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* High-Density Server-Side Filter Toolbar */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-3 space-y-2.5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
          {/* Search */}
          <div className="relative md:col-span-5">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              maxLength={200}
              aria-label="Buscar paquetes"
              placeholder="Buscar tracking, destinatario, dirección o teléfono..."
              className="w-full h-9 bg-slate-950 border border-slate-800/80 rounded-lg pl-9 pr-8 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors"
              value={searchTerm}
              onChange={(e) => {
                clearUrlSearchParam();
                setSearchTerm(e.target.value);
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  clearUrlSearchParam();
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

          {/* Zone Filter */}
          <div className="md:col-span-3">
            <select
              aria-label="Filtrar por zona"
              value={zoneFilter}
              onChange={(e) => {
                setZoneFilter(e.target.value);
                setPage(1);
                setSelectedIds(new Set());
              }}
              className="w-full h-9 bg-slate-950 border border-slate-800/80 rounded-lg px-2.5 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-brand-500 transition-colors"
            >
              <option value="">Todas las zonas</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="md:col-span-4 grid grid-cols-2 gap-2">
            <div className="relative">
              <input
                type="date"
                aria-label="Fecha desde"
                title="Fecha desde"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                  setSelectedIds(new Set());
                }}
                className="w-full h-9 bg-slate-950 border border-slate-800/80 rounded-lg px-2.5 text-xs text-slate-200 tabular-nums focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>
            <div className="relative">
              <input
                type="date"
                aria-label="Fecha hasta"
                title="Fecha hasta"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                  setSelectedIds(new Set());
                }}
                className="w-full h-9 bg-slate-950 border border-slate-800/80 rounded-lg px-2.5 text-xs text-slate-200 tabular-nums focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>
          </div>
        </div>

        {hasInvalidDateRange && (
          <p role="alert" className="text-xs text-amber-300">
            La fecha inicial («Desde») no puede ser posterior a la fecha final («Hasta»).
          </p>
        )}

        {/* Status Pills + Clear Filters */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
            {(['', ...PACKAGE_STATUS_ORDER] as const).map((status) => (
              <button
                type="button"
                key={status}
                onClick={() => {
                  setActiveFilter(status);
                  setPage(1);
                  setSelectedIds(new Set());
                }}
                className={clsx(
                  'px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors border',
                  activeFilter === status
                    ? 'bg-brand-500/15 border-brand-500/35 text-brand-300'
                    : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:text-white'
                )}
              >
                {status === '' ? 'Todos' : getPackageStatusToken(status).label}
              </button>
            ))}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-800 bg-slate-950 hover:bg-slate-800 text-xs text-slate-300 hover:text-white transition-colors"
            >
              <FilterX className="h-3.5 w-3.5 text-slate-400" />
              <span className="hidden sm:inline">Limpiar filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* Contextual Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 bg-brand-950/40 border border-brand-500/30 rounded-xl text-xs">
          <div className="flex items-center gap-3">
            <span className="text-brand-200 font-semibold tabular-nums">
              {selectedIds.size}{' '}
              {selectedIds.size === 1 ? 'paquete seleccionado' : 'paquetes seleccionados'}
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-slate-300 hover:text-white underline underline-offset-2 transition-colors"
            >
              Limpiar selección
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!showArchived ? (
              <button
                type="button"
                onClick={handleArchiveClick}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/35 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 font-medium transition-colors tabular-nums disabled:opacity-50"
              >
                <Archive className="h-3.5 w-3.5" />
                <span>Archivar Seleccionados ({selectedIds.size})</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void handleUnarchiveIds(Array.from(selectedIds))}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 font-medium transition-colors tabular-nums disabled:opacity-50"
                >
                  <ArchiveRestore className="h-3.5 w-3.5" />
                  <span>Restaurar Seleccionados ({selectedIds.size})</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/35 bg-red-500/15 hover:bg-red-600 text-red-200 hover:text-white font-medium transition-colors tabular-nums disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Eliminar Seleccionados ({selectedIds.size})</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Data Container */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <>
            <div className="hidden md:block overflow-x-auto custom-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-950/60 text-[11px] text-slate-400 uppercase tracking-wider">
                    <th className="w-10 px-3 py-2.5" />
                    <th className="px-3.5 py-2.5 font-semibold">Tracking</th>
                    <th className="px-3.5 py-2.5 font-semibold">Destinatario</th>
                    <th className="px-3.5 py-2.5 font-semibold">Ubicación</th>
                    <th className="px-3.5 py-2.5 font-semibold">Estado</th>
                    <th className="px-3.5 py-2.5 font-semibold">Fecha</th>
                    <th className="px-3.5 py-2.5 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  <SkeletonTableRows
                    rows={8}
                    cellClassName="px-3.5 py-2.5"
                    columns={['short', 'text', 'text', 'icon-text', 'pill', 'short', 'short']}
                  />
                </tbody>
              </table>
            </div>
            <div className="md:hidden p-3 space-y-2.5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          </>
        ) : error ? (
          <div role="alert" className="p-10 text-center space-y-3">
            <p className="text-sm text-red-300">Error: {error}</p>
            <button
              type="button"
              onClick={() => void fetchPackages()}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-700/80 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reintentar
            </button>
          </div>
        ) : packages.length === 0 ? (
          <div className="p-10 text-center text-slate-400 flex flex-col items-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-800/80 bg-slate-950 text-slate-500">
              <Package className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-white mb-1">
              {hasActiveFilters
                ? 'No se encontraron paquetes con los filtros aplicados'
                : showArchived
                  ? 'No hay paquetes archivados'
                  : 'Aún no hay paquetes registrados'}
            </p>
            <p className="text-xs text-slate-400 max-w-md mb-4">
              {hasActiveFilters
                ? 'Ajusta los criterios de búsqueda, zona, estado o fechas para ver resultados.'
                : showArchived
                  ? 'Los paquetes entregados o cancelados que archives aparecerán aquí.'
                  : 'Crea un envío individual o importa hasta 500 paquetes desde CSV/JSON.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700/80 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition-colors"
                >
                  <FilterX className="h-3.5 w-3.5" />
                  Limpiar filtros
                </button>
              ) : (
                !showArchived && (
                  <>
                    <button
                      type="button"
                      onClick={openBulkImport}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700/80 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition-colors"
                    >
                      <Upload className="h-3.5 w-3.5 text-brand-400" />
                      Importar CSV/JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/packages/new')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-brand-950/30 transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      Crear Paquete
                    </button>
                  </>
                )
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Desktop High-Density Table */}
            <div className="hidden md:block overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-950/60 text-[11px] text-slate-400 uppercase tracking-wider">
                    <th className="w-10 px-3 py-2.5">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={handleToggleSelectAll}
                        disabled={packages.length === 0 || loading}
                        aria-label="Seleccionar todos los paquetes de la página actual"
                        className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-brand-600 focus:ring-brand-500 focus:ring-offset-0 cursor-pointer disabled:opacity-50"
                      />
                    </th>
                    <th className="px-3.5 py-2.5 font-semibold">Tracking</th>
                    <th className="px-3.5 py-2.5 font-semibold">Destinatario</th>
                    <th className="px-3.5 py-2.5 font-semibold">Dirección y Zona</th>
                    <th className="px-3.5 py-2.5 font-semibold">Estado</th>
                    <th className="px-3.5 py-2.5 font-semibold">Fecha</th>
                    <th className="px-3.5 py-2.5 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-xs">
                  {packages.map((pkg) => {
                    const isSelected = selectedIds.has(pkg.id);
                    const isCopied = copiedId === pkg.id;

                    return (
                      <tr
                        key={pkg.id}
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest('button, a, input, select')) return;
                          setDetailPackageId(pkg.id);
                        }}
                        className={clsx(
                          'hover:bg-slate-800/40 transition-colors cursor-pointer group',
                          isSelected && 'bg-brand-950/25',
                          detailPackageId === pkg.id && 'bg-slate-800/50'
                        )}
                      >
                        <td className="w-10 px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(pkg.id)}
                            aria-label={`Seleccionar paquete ${pkg.trackingCode}`}
                            className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-brand-600 focus:ring-brand-500 focus:ring-offset-0 cursor-pointer"
                          />
                        </td>

                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setDetailPackageId(pkg.id)}
                            className="text-left group-hover:text-brand-300 transition-colors"
                          >
                            <div className="font-mono text-xs font-semibold text-white group-hover:text-brand-300 tabular-nums">
                              {pkg.trackingCode}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                              {pkg.id.substring(0, 8)}
                            </div>
                          </button>
                        </td>

                        <td className="px-3.5 py-2.5">
                          <div className="text-xs font-medium text-slate-100 truncate max-w-[180px]">
                            {pkg.recipientName}
                          </div>
                          <div className="text-[11px] text-slate-400 tabular-nums flex items-center gap-1 mt-0.5">
                            <Phone className="h-3 w-3 shrink-0" />
                            <span>{pkg.recipientPhone}</span>
                          </div>
                        </td>

                        <td className="px-3.5 py-2.5">
                          <div
                            className="text-xs text-slate-200 max-w-[240px] lg:max-w-xs truncate"
                            title={pkg.recipientAddress}
                          >
                            {pkg.recipientAddress}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0 text-brand-400" />
                            <span>{pkg.zone?.name || 'Sin asignar'}</span>
                          </div>
                        </td>

                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <StatusBadge status={pkg.status} size="sm" />
                        </td>

                        <td className="px-3.5 py-2.5 text-slate-300 tabular-nums whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-xs">
                            <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                            <span>{new Date(pkg.createdAt).toLocaleDateString()}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {new Date(pkg.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </td>

                        <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleCopyTrackingLink(pkg.trackingCode, pkg.id)}
                              aria-label={`Copiar enlace de tracking de ${pkg.trackingCode}`}
                              title="Copiar enlace de tracking"
                              className={clsx(
                                'inline-flex items-center gap-1 px-2 py-1.5 rounded-md border text-[11px] font-medium transition-colors',
                                isCopied
                                  ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300'
                                  : 'border-slate-800 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white'
                              )}
                            >
                              {isCopied ? (
                                <>
                                  <Check className="h-3 w-3" />
                                  <span>Copiado</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3 text-brand-400" />
                                  <span className="hidden xl:inline">Copiar link</span>
                                </>
                              )}
                            </button>

                            {showArchived && (
                              <button
                                type="button"
                                onClick={() => void handleUnarchiveIds([pkg.id])}
                                aria-label={`Restaurar paquete ${pkg.trackingCode}`}
                                title="Restaurar a Activos"
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-[11px] font-medium text-emerald-300 transition-colors"
                              >
                                <ArchiveRestore className="h-3 w-3" />
                                <span className="hidden xl:inline">Restaurar</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setDetailPackageId(pkg.id)}
                              aria-label={`Abrir detalle de ${pkg.trackingCode}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-700/80 bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-white transition-colors"
                            >
                              <PanelRightOpen className="h-3 w-3 text-brand-400" />
                              <span>Detalle</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile High-Density Card List (<768px) */}
            <div className="md:hidden divide-y divide-slate-800/80">
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950/60 text-xs text-slate-400">
                <label className="inline-flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={handleToggleSelectAll}
                    disabled={packages.length === 0 || loading}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-brand-600"
                  />
                  <span>Seleccionar página ({packages.length})</span>
                </label>
                <span className="tabular-nums font-mono text-[11px]">
                  Pág. {page}/{totalPages}
                </span>
              </div>

              {packages.map((pkg) => {
                const isSelected = selectedIds.has(pkg.id);
                const isCopied = copiedId === pkg.id;

                return (
                  <div
                    key={pkg.id}
                    className={clsx(
                      'p-3.5 space-y-2.5',
                      isSelected && 'bg-brand-950/20'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(pkg.id)}
                          aria-label={`Seleccionar paquete ${pkg.trackingCode}`}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-brand-600 shrink-0"
                        />
                        <button
                          type="button"
                          onClick={() => setDetailPackageId(pkg.id)}
                          className="text-left min-w-0"
                        >
                          <p className="font-mono text-sm font-semibold text-white tabular-nums truncate">
                            {pkg.trackingCode}
                          </p>
                        </button>
                      </div>
                      <StatusBadge status={pkg.status} size="sm" />
                    </div>

                    <div className="space-y-1 pl-6 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-medium text-slate-100">{pkg.recipientName}</span>
                        <span className="text-slate-400 tabular-nums">{pkg.recipientPhone}</span>
                      </div>
                      <p className="text-slate-300 line-clamp-2">{pkg.recipientAddress}</p>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-brand-400" />
                          {pkg.zone?.name || 'Sin asignar'}
                        </span>
                        <span>{new Date(pkg.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pl-6 pt-1">
                      <button
                        type="button"
                        onClick={() => void handleCopyTrackingLink(pkg.trackingCode, pkg.id)}
                        className={clsx(
                          'flex-1 min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors',
                          isCopied
                            ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300'
                            : 'border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-800'
                        )}
                      >
                        {isCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 text-brand-400" />
                            <span>Copiar enlace</span>
                          </>
                        )}
                      </button>

                      {showArchived && (
                        <button
                          type="button"
                          onClick={() => void handleUnarchiveIds([pkg.id])}
                          className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs font-medium text-emerald-300"
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                          <span>Restaurar</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setDetailPackageId(pkg.id)}
                        className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700/80 bg-slate-800 text-xs font-medium text-white hover:bg-slate-700 transition-colors"
                      >
                        <PanelRightOpen className="h-3.5 w-3.5 text-brand-400" />
                        <span>Ver detalle</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm text-slate-400 px-4 py-2.5 border border-slate-800/80 bg-slate-900 rounded-xl">
        <div className="tabular-nums">
          Página {page} de {totalPages} · {totalItems} resultados
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setPage((p) => Math.max(1, p - 1));
              setSelectedIds(new Set());
            }}
            disabled={page === 1 || loading}
            className="min-h-[36px] px-3.5 py-1.5 bg-slate-950 border border-slate-800/80 rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white text-xs font-medium"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => {
              setPage((p) => Math.min(totalPages, p + 1));
              setSelectedIds(new Set());
            }}
            disabled={page === totalPages || loading}
            className="min-h-[36px] px-3.5 py-1.5 bg-slate-950 border border-slate-800/80 rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white text-xs font-medium"
          >
            Siguiente
          </button>
        </div>
      </div>

      {/* Bulk Import Modal */}
      <BulkImportModal
        key={bulkModalKey}
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        token={token}
        zones={zones}
        onImported={fetchPackages}
      />

      {/* Package Detail Drawer */}
      <PackageDetailDrawer
        isOpen={Boolean(detailPackageId)}
        packageId={detailPackageId}
        onClose={() => setDetailPackageId(null)}
        token={token}
        zones={zones}
        onPackageUpdated={fetchPackages}
        onCopyTrackingLink={(code) => handleCopyTrackingLink(code)}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={() => {
          if (!confirmState.isLoading) {
            setConfirmState((prev) => ({ ...prev, isOpen: false }));
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
