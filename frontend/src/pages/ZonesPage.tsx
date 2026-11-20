import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  AlertCircle,
  Check,
  Loader2,
  Map,
  MapPin,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
  Truck,
  User,
  UserX,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { zoneService, type UpdateZonePayload, type Zone } from '../services/zoneService';
import { driverService, type AppDriver } from '../services/driverService';
import { Modal } from '../components/Modal';
import { Skeleton } from '../components/Skeleton';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ZonePolygonEditor } from '../components/ZonePolygonEditor';
import {
  extractZoneLatLngVertices,
  toGeoJsonPolygonRing,
} from '../utils/mapUtils';

type ZoneModalMode = 'create' | 'edit' | null;

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  variant: 'danger' | 'warning' | 'info';
  onConfirm: () => Promise<void>;
}

const INITIAL_CONFIRM_STATE: ConfirmState = {
  isOpen: false,
  title: '',
  message: '',
  variant: 'info',
  onConfirm: async () => {},
};

export function ZonesPage() {
  const { token } = useAuth();
  const location = useLocation();
  const highlightedZoneId =
    typeof (location.state as { zoneId?: unknown } | null)?.zoneId === 'string'
      ? (location.state as { zoneId: string }).zoneId
      : null;

  const [zones, setZones] = useState<Zone[]>([]);
  const [drivers, setDrivers] = useState<AppDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Create / Edit Zone Modal
  const [zoneModalMode, setZoneModalMode] = useState<ZoneModalMode>(null);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [editorSessionKey, setEditorSessionKey] = useState(0);
  const [zoneName, setZoneName] = useState('');
  const [zoneDescription, setZoneDescription] = useState('');
  const [polygonVertices, setPolygonVertices] = useState<[number, number][]>([]);
  const [initialHadPolygon, setInitialHadPolygon] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Assign Driver Modal
  const [assignZone, setAssignZone] = useState<Zone | null>(null);
  const [searchDriver, setSearchDriver] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Confirm Dialog
  const [confirmConfig, setConfirmConfig] = useState<ConfirmState>(INITIAL_CONFIRM_STATE);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const zoneFormId = useId();
  const zoneNameInputId = useId();
  const zoneDescInputId = useId();

  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      if (!token) return;
      try {
        const [zonesData, driversData] = await Promise.all([
          zoneService.getZones(token, 1, 100, signal),
          driverService.getDrivers(token, 1, 100, signal),
        ]);
        setZones(zonesData.items || []);
        setDrivers(driversData.items || []);
        setLoadError('');
      } catch (err: unknown) {
        if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
          return;
        }
        const message = err instanceof Error ? err.message : 'Error al cargar zonas';
        setLoadError(message);
        toast.error('Error al cargar datos de zonas');
        console.error(err);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [token]
  );

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void fetchData(controller.signal);
    return () => controller.abort();
  }, [token, fetchData]);

  const handleRetryLoad = () => {
    setLoading(true);
    setLoadError('');
    void fetchData();
  };

  const openCreateModal = () => {
    setZoneModalMode('create');
    setEditingZone(null);
    setZoneName('');
    setZoneDescription('');
    setPolygonVertices([]);
    setInitialHadPolygon(false);
    setFormError('');
    setEditorSessionKey((prev) => prev + 1);
  };

  const openEditModal = (zone: Zone) => {
    const existingVertices = extractZoneLatLngVertices(zone);
    setZoneModalMode('edit');
    setEditingZone(zone);
    setZoneName(zone.name);
    setZoneDescription(zone.description ?? '');
    setPolygonVertices(existingVertices);
    setInitialHadPolygon(existingVertices.length >= 3);
    setFormError('');
    setEditorSessionKey((prev) => prev + 1);
  };

  const closeZoneModal = () => {
    if (formSubmitting) return;
    setZoneModalMode(null);
    setEditingZone(null);
    setFormError('');
  };

  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formSubmitting) return;
    if (!token) {
      setFormError('Sesión expirada. Inicia sesión nuevamente.');
      return;
    }

    const trimmedName = zoneName.trim();
    const trimmedDescription = zoneDescription.trim();

    if (trimmedName.length < 2) {
      setFormError('El nombre de la zona debe tener al menos 2 caracteres.');
      return;
    }

    const geoRing = toGeoJsonPolygonRing(polygonVertices);

    if (zoneModalMode === 'create') {
      if (!geoRing) {
        setFormError(
          'Dibuja un polígono válido con al menos 3 vértices en el mapa para crear la zona.'
        );
        return;
      }

      setFormSubmitting(true);
      setFormError('');
      const toastId = toast.loading('Creando zona...');

      try {
        await zoneService.createZone(token, {
          name: trimmedName,
          ...(trimmedDescription ? { description: trimmedDescription } : {}),
          polygon: geoRing,
        });
        toast.success('Zona creada correctamente', { id: toastId });
        setZoneModalMode(null);
        setEditingZone(null);
        await fetchData();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error al crear zona';
        setFormError(message);
        toast.error(message, { id: toastId });
      } finally {
        setFormSubmitting(false);
      }
      return;
    }

    if (zoneModalMode === 'edit' && editingZone) {
      if (polygonVertices.length > 0 && !geoRing) {
        setFormError(
          `El polígono requiere al menos 3 vértices válidos (actual: ${polygonVertices.length}).`
        );
        return;
      }

      if (initialHadPolygon && !geoRing) {
        setFormError(
          'La geocerca no puede quedar vacía. Dibuja al menos 3 vértices en el mapa.'
        );
        return;
      }

      setFormSubmitting(true);
      setFormError('');
      const toastId = toast.loading('Guardando cambios...');

      try {
        const payload: UpdateZonePayload = {
          name: trimmedName,
          description: trimmedDescription,
          ...(geoRing ? { polygon: geoRing } : {}),
        };
        await zoneService.updateZone(token, editingZone.id, payload);
        toast.success('Zona actualizada correctamente', { id: toastId });
        setZoneModalMode(null);
        setEditingZone(null);
        await fetchData();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error al actualizar zona';
        setFormError(message);
        toast.error(message, { id: toastId });
      } finally {
        setFormSubmitting(false);
      }
    }
  };

  const handleToggleActive = async (zone: Zone) => {
    if (!token) return;
    if (!zone.isActive && !zone.driver) {
      toast.error('No se puede activar una zona sin conductor asignado');
      return;
    }

    const newStatus = !zone.isActive;
    const toastId = toast.loading(newStatus ? 'Activando zona...' : 'Desactivando zona...');

    try {
      await zoneService.updateZone(token, zone.id, { isActive: newStatus });

      setZones((prev) =>
        prev.map((z) => (z.id === zone.id ? { ...z, isActive: newStatus } : z))
      );
      toast.success(newStatus ? 'Zona activada' : 'Zona desactivada', { id: toastId });

      if (newStatus) {
        toast.info('Los paquetes pendientes en esta zona han sido asignados al conductor');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al actualizar estado';
      toast.error(message, { id: toastId });
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
      setSearchDriver('');
      await fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al asignar conductor';
      toast.error(message, { id: toastId });
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkStatus = (isActive: boolean) => {
    if (!token) return;
    setConfirmConfig({
      isOpen: true,
      title: isActive ? 'Activar Todas las Zonas' : 'Desactivar Todas las Zonas',
      message: isActive
        ? '¿Estás seguro de que deseas activar todas las zonas que tienen un conductor asignado? Esta acción asignará automáticamente los paquetes pendientes.'
        : '¿Estás seguro de que deseas desactivar TODAS las zonas? Los paquetes asignados volverán a estado pendiente y los conductores dejarán de recibir nuevas asignaciones.',
      confirmText: isActive ? 'Activar Todas' : 'Desactivar Todas',
      variant: isActive ? 'info' : 'warning',
      onConfirm: async () => {
        setConfirmLoading(true);
        const toastId = toast.loading(
          isActive ? 'Activando zonas...' : 'Desactivando zonas...'
        );
        try {
          await zoneService.setAllZonesStatus(token, isActive);
          toast.success(isActive ? 'Zonas activadas' : 'Zonas desactivadas', {
            id: toastId,
          });
          await fetchData();
          setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : 'Error al actualizar estado masivo';
          toast.error(message, { id: toastId });
        } finally {
          setConfirmLoading(false);
        }
      },
    });
  };

  const handleUnassignDriver = (zone: Zone) => {
    if (!zone.driver) return;

    setConfirmConfig({
      isOpen: true,
      title: 'Desasignar Conductor',
      message: zone.isActive
        ? `¿Deseas desasignar a ${zone.driver.name} de la zona "${zone.name}"? La zona pasará a estado inactivo.`
        : `¿Deseas desasignar a ${zone.driver.name} de la zona "${zone.name}"?`,
      confirmText: 'Desasignar',
      variant: zone.isActive ? 'warning' : 'info',
      onConfirm: async () => {
        if (!token) {
          toast.error('Sesión expirada. Inicia sesión nuevamente.');
          return;
        }
        setConfirmLoading(true);
        setActionLoading(true);
        const toastId = toast.loading('Desasignando conductor...');
        try {
          await zoneService.updateZone(token, zone.id, {
            driverId: null,
            ...(zone.isActive ? { isActive: false } : {}),
          });
          setZones((prev) =>
            prev.map((z) =>
              z.id === zone.id ? { ...z, driver: undefined, isActive: false } : z
            )
          );
          setAssignZone((prev) => (prev?.id === zone.id ? null : prev));
          toast.success('Conductor desasignado', { id: toastId });
          setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
          await fetchData();
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : 'Error al desasignar conductor';
          toast.error(message, { id: toastId });
          console.error(err);
        } finally {
          setConfirmLoading(false);
          setActionLoading(false);
        }
      },
    });
  };

  const handleRequestDeleteZone = (zone: Zone) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Eliminar Zona',
      message: `¿Estás seguro de eliminar permanentemente la zona "${zone.name}"? Todos los paquetes en estado "assigned" (Asignado) de esta zona volverán automáticamente a estado "pending" (Pendiente) y se desvinculará su conductor asignado.`,
      confirmText: 'Eliminar Zona',
      variant: 'danger',
      onConfirm: async () => {
        if (!token) {
          toast.error('Sesión expirada. Inicia sesión nuevamente.');
          return;
        }
        setConfirmLoading(true);
        const toastId = toast.loading('Eliminando zona...');
        try {
          const result = await zoneService.deleteZone(token, zone.id);
          setZones((prev) => prev.filter((z) => z.id !== zone.id));
          setAssignZone((prev) => (prev?.id === zone.id ? null : prev));
          setEditingZone((prev) => (prev?.id === zone.id ? null : prev));
          setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
          const revertedMsg =
            result.revertedCount > 0
              ? `Zona "${zone.name}" eliminada. ${result.revertedCount} paquete(s) volvieron a estado Pendiente.`
              : `Zona "${zone.name}" eliminada.`;
          toast.success(revertedMsg, { id: toastId });
          await fetchData();
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : 'Error al eliminar la zona';
          toast.error(message, { id: toastId });
          console.error(err);
        } finally {
          setConfirmLoading(false);
        }
      },
    });
  };

  const zoneMetrics = useMemo(() => {
    let activeCount = 0;
    let polygonCount = 0;
    for (const z of zones) {
      if (z.isActive) activeCount += 1;
      if (extractZoneLatLngVertices(z).length >= 3) polygonCount += 1;
    }
    return { total: zones.length, activeCount, polygonCount };
  }, [zones]);

  const filteredZones = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return zones;
    return zones.filter(
      (z) =>
        z.name.toLowerCase().includes(q) ||
        (z.description ?? '').toLowerCase().includes(q) ||
        (z.driver?.name ?? '').toLowerCase().includes(q) ||
        z.id.toLowerCase().includes(q)
    );
  }, [zones, searchQuery]);

  const modalDrivers = useMemo(() => {
    const q = searchDriver.toLowerCase();
    return drivers.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.user?.username ?? '').toLowerCase().includes(q)
    );
  }, [drivers, searchDriver]);

  const referenceZones = useMemo(
    () => zones.filter((z) => z.id !== editingZone?.id),
    [zones, editingZone?.id]
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (loadError && zones.length === 0) {
    return (
      <div
        role="alert"
        className="bg-slate-900 border border-red-500/20 rounded-xl p-10 text-center flex flex-col items-center justify-center gap-3"
      >
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-red-300">Error al cargar zonas: {loadError}</p>
        <button
          type="button"
          onClick={handleRetryLoad}
          className="min-h-[38px] px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-white text-xs font-medium rounded-lg transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 relative pb-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Map className="h-7 w-7 text-brand-400 shrink-0" />
            <span>Gestión de Zonas</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Define polígonos de cobertura sobre el mapa, asigna conductores y gestiona el despacho activo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleBulkStatus(false)}
            disabled={zones.length === 0}
            className="min-h-[40px] sm:min-h-[38px] flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs sm:text-sm font-medium rounded-lg border border-slate-800/80 transition-colors hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Power className="h-4 w-4 text-slate-400" />
            <span>Desactivar<span className="hidden sm:inline"> Todas</span></span>
          </button>

          <button
            type="button"
            onClick={() => handleBulkStatus(true)}
            disabled={zones.length === 0}
            className="min-h-[40px] sm:min-h-[38px] flex items-center gap-2 px-3.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs sm:text-sm font-medium rounded-lg border border-emerald-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Power className="h-4 w-4" />
            <span>Activar<span className="hidden sm:inline"> Todas</span></span>
          </button>

          <div className="w-px h-7 bg-slate-800/80 mx-1 hidden sm:block" />

          <button
            type="button"
            onClick={openCreateModal}
            className="min-h-[40px] sm:min-h-[38px] flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs sm:text-sm font-semibold rounded-lg shadow-lg shadow-brand-950/30 transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Nueva Zona</span>
          </button>
        </div>
      </div>

      {/* Operational KPI Strip + Quick Search */}
      {zones.length > 0 && (
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800/80 text-slate-300 tabular-nums">
              <span className="text-slate-400">Total:</span>
              <span className="font-semibold text-white">{zoneMetrics.total}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 tabular-nums">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Activas: {zoneMetrics.activeCount}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-brand-500/10 border border-brand-500/25 text-brand-300 tabular-nums">
              <MapPin className="h-3.5 w-3.5" />
              <span>Con polígono: {zoneMetrics.polygonCount}/{zoneMetrics.total}</span>
            </span>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Buscar zonas"
              placeholder="Buscar zona, descripción o conductor..."
              className="w-full h-9 bg-slate-950 border border-slate-800/80 rounded-lg pl-9 pr-8 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpiar búsqueda de zonas"
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty State */}
      {zones.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-10 text-center flex flex-col items-center justify-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
            <Map className="h-6 w-6" />
          </div>
          <div className="space-y-1 max-w-md">
            <h2 className="text-base font-semibold text-white">
              No hay zonas configuradas
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Crea tu primera zona dibujando su geocerca en el mapa para automatizar la asignación de paquetes por cobertura.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-2 min-h-[40px] inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg shadow-lg shadow-brand-950/30 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Crear Primera Zona</span>
          </button>
        </div>
      ) : filteredZones.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-8 text-center space-y-2">
          <p className="text-sm text-slate-300">
            No se encontraron zonas que coincidan con &ldquo;{searchQuery}&rdquo;.
          </p>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-xs font-medium text-brand-400 hover:text-brand-300 hover:underline"
          >
            Limpiar filtro
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {filteredZones.map((zone) => {
            const vertices = extractZoneLatLngVertices(zone);
            const hasPolygon = vertices.length >= 3;
            const isHighlighted = highlightedZoneId === zone.id;

            return (
              <div
                key={zone.id}
                className={clsx(
                  'bg-slate-900 border rounded-xl flex flex-col shadow-sm transition-all group relative overflow-hidden min-h-[240px]',
                  isHighlighted
                    ? 'border-brand-500 ring-2 ring-brand-500/30'
                    : 'border-slate-800/80 hover:border-slate-700/80'
                )}
              >
                {/* Active Indicator Gradient */}
                <div
                  className={clsx(
                    'absolute top-0 left-0 right-0 h-1 transition-all duration-500',
                    zone.isActive
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                      : 'bg-slate-800'
                  )}
                />

                {/* Card Content */}
                <div className="p-5 flex-1 flex flex-col">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0 flex-1">
                      <h3
                        className="text-lg font-bold text-white tracking-tight leading-snug line-clamp-2"
                        title={zone.name}
                      >
                        {zone.name}
                      </h3>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-mono tabular-nums text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800/80 select-all">
                          ID: {zone.id.slice(0, 8)}
                        </span>

                        {zone.isActive ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/25 uppercase tracking-wider">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Activa
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[10px] font-semibold text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800/80 uppercase tracking-wider">
                            Inactiva
                          </span>
                        )}

                        {hasPolygon ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-300 bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/25 tabular-nums">
                            <MapPin className="h-3 w-3" />
                            {vertices.length} vértices
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openEditModal(zone)}
                            className="inline-flex items-center gap-1 min-h-[36px] sm:min-h-0 px-2.5 py-1.5 sm:px-2 sm:py-0.5 text-[10px] font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 rounded border border-amber-500/25 transition-colors"
                            title="Dibujar polígono de cobertura"
                          >
                            <MapPin className="h-3 w-3" />
                            Sin polígono
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Edit & Safe Delete Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(zone)}
                        title="Editar zona y polígono"
                        aria-label={`Editar zona ${zone.name}`}
                        className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700/80 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRequestDeleteZone(zone)}
                        title="Eliminar zona"
                        aria-label={`Eliminar zona ${zone.name}`}
                        className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-950/40 border border-transparent hover:border-red-900/40 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="flex-1 mb-2">
                    {zone.description ? (
                      <p
                        className="text-xs text-slate-400 leading-relaxed line-clamp-2"
                        title={zone.description}
                      >
                        {zone.description}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic">
                        Sin descripción configurada
                      </p>
                    )}
                  </div>

                  {/* Footer Actions Area */}
                  <div className="pt-4 mt-2 border-t border-slate-800/80 flex flex-col gap-3">
                    {/* Driver Section */}
                    <div className="flex items-center justify-between gap-2">
                      {zone.driver ? (
                        <>
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="h-9 w-9 shrink-0 rounded-full bg-brand-500/10 text-brand-400 flex items-center justify-center border border-brand-500/20">
                              <User className="h-4 w-4" />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-semibold text-slate-100 truncate">
                                {zone.driver.name}
                              </span>
                              <button
                                type="button"
                                onClick={() => setAssignZone(zone)}
                                className="min-h-[36px] sm:min-h-0 py-1.5 sm:py-0.5 text-xs text-brand-400 hover:text-brand-300 text-left hover:underline truncate inline-flex items-center"
                              >
                                Cambiar conductor
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleUnassignDriver(zone)}
                            disabled={actionLoading}
                            title="Desasignar conductor"
                            aria-label={`Desasignar conductor de ${zone.name}`}
                            className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-950/40 border border-transparent hover:border-red-900/40 transition-colors shrink-0 disabled:opacity-50"
                          >
                            <UserX className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAssignZone(zone)}
                          className="flex-1 min-h-[44px] sm:min-h-[38px] py-2 px-3 border border-dashed border-slate-700/80 rounded-lg text-slate-300 hover:text-white hover:border-brand-500/50 hover:bg-brand-500/5 flex items-center justify-center gap-2 transition-all text-sm"
                        >
                          <Truck className="h-4 w-4 text-brand-400" />
                          <span>Asignar Conductor</span>
                        </button>
                      )}
                    </div>

                    {/* Toggle Switch */}
                    <div className="flex items-center justify-between bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider pl-1">
                        Estado de Zona
                      </span>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={zone.isActive}
                        aria-label={`${zone.isActive ? 'Desactivar' : 'Activar'} zona ${zone.name}`}
                        onClick={() => handleToggleActive(zone)}
                        disabled={!zone.driver}
                        className={clsx(
                          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-slate-900',
                          zone.isActive ? 'bg-emerald-600' : 'bg-slate-700',
                          !zone.driver && 'opacity-50 cursor-not-allowed'
                        )}
                        title={
                          !zone.driver
                            ? 'Asigna un conductor primero'
                            : zone.isActive
                              ? 'Desactivar Zona'
                              : 'Activar Zona'
                        }
                      >
                        <span
                          className={clsx(
                            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-md',
                            zone.isActive ? 'translate-x-6' : 'translate-x-1'
                          )}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Zone Modal with Interactive Polygon Editor */}
      <Modal
        isOpen={zoneModalMode !== null}
        onClose={closeZoneModal}
        closeOnBackdropClick={!formSubmitting}
        closeOnEscape={!formSubmitting}
        size="3xl"
        icon={<Map className="h-4 w-4" />}
        title={zoneModalMode === 'edit' ? 'Editar Zona y Geocerca' : 'Crear Nueva Zona'}
        subtitle={
          zoneModalMode === 'edit'
            ? 'Actualiza el nombre, descripción o ajusta los vértices del polígono sobre el mapa.'
            : 'Nombra la zona y dibuja al menos 3 vértices sobre el mapa para delimitar su geocerca.'
        }
        footer={
          <>
            <button
              type="button"
              onClick={closeZoneModal}
              disabled={formSubmitting}
              className="min-h-[40px] sm:min-h-[38px] px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form={zoneFormId}
              disabled={formSubmitting}
              className="min-h-[40px] sm:min-h-[38px] inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-lg shadow-lg shadow-brand-950/30 transition-colors disabled:opacity-50"
            >
              {formSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>
                {formSubmitting
                  ? zoneModalMode === 'edit'
                    ? 'Guardando...'
                    : 'Creando...'
                  : zoneModalMode === 'edit'
                    ? 'Guardar Cambios'
                    : 'Crear Zona'}
              </span>
            </button>
          </>
        }
      >
        <form id={zoneFormId} onSubmit={handleSaveZone} className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-xs sm:text-sm text-red-300"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor={zoneNameInputId}
                className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
              >
                Nombre de Zona <span className="text-red-400">*</span>
              </label>
              <input
                id={zoneNameInputId}
                type="text"
                required
                minLength={2}
                maxLength={100}
                value={zoneName}
                onChange={(e) => {
                  setZoneName(e.target.value);
                  if (formError) setFormError('');
                }}
                className="w-full h-10 bg-slate-950 border border-slate-800/80 rounded-lg px-3 text-sm text-white placeholder-slate-500 focus:border-brand-500 outline-none transition-colors"
                placeholder="Ej. Zona Centro"
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor={zoneDescInputId}
                className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
              >
                Descripción
              </label>
              <input
                id={zoneDescInputId}
                type="text"
                maxLength={250}
                value={zoneDescription}
                onChange={(e) => setZoneDescription(e.target.value)}
                className="w-full h-10 bg-slate-950 border border-slate-800/80 rounded-lg px-3 text-sm text-white placeholder-slate-500 focus:border-brand-500 outline-none transition-colors"
                placeholder="Ej. Microcentro y barrios aledaños (opcional)"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Polígono de Cobertura (Leaflet){' '}
                {(zoneModalMode === 'create' || initialHadPolygon) && (
                  <span className="text-red-400">*</span>
                )}
              </span>
              {zoneModalMode === 'edit' && !initialHadPolygon && polygonVertices.length === 0 && (
                <span className="text-[11px] text-amber-300">
                  Zona sin geocerca · Opcional dibujar 3+ puntos
                </span>
              )}
            </div>

            {zoneModalMode !== null && (
              <ZonePolygonEditor
                key={editorSessionKey}
                vertices={polygonVertices}
                onChange={(next) => {
                  setPolygonVertices(next);
                  if (formError) setFormError('');
                }}
                referenceZones={referenceZones}
                hasError={
                  Boolean(formError) &&
                  (polygonVertices.length < 3 &&
                    (zoneModalMode === 'create' ||
                      initialHadPolygon ||
                      polygonVertices.length > 0))
                }
              />
            )}
          </div>
        </form>
      </Modal>

      {/* Assign Driver Modal */}
      <Modal
        isOpen={!!assignZone}
        onClose={() => {
          if (!actionLoading) {
            setAssignZone(null);
            setSearchDriver('');
          }
        }}
        title={`Asignar Conductor a ${assignZone?.name ?? ''}`}
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchDriver}
              onChange={(e) => setSearchDriver(e.target.value)}
              placeholder="Buscar conductor..."
              className="w-full bg-slate-950 border border-slate-800/80 rounded-lg pl-9 pr-3 py-2 text-white focus:border-brand-500 outline-none"
              autoFocus
            />
          </div>

          {assignZone?.driver && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => {
                const targetZone = assignZone;
                setAssignZone(null);
                setSearchDriver('');
                handleUnassignDriver(targetZone);
              }}
              className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-950/60 hover:bg-red-950/30 border border-slate-800/80 hover:border-red-900/50 transition-all group text-left disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-slate-800 group-hover:bg-red-950/60 flex items-center justify-center text-slate-400 group-hover:text-red-400 transition-colors">
                  <UserX className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-200 group-hover:text-red-300">
                    Sin asignar
                  </div>
                  <div className="text-xs text-slate-400">
                    Quitar conductor actual ({assignZone.driver.name})
                  </div>
                </div>
              </div>
            </button>
          )}

          <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1 pr-1">
            {modalDrivers.map((driver) => (
              <button
                type="button"
                key={driver.id}
                disabled={actionLoading}
                onClick={() => handleAssignDriver(driver.id)}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-slate-800 group-hover:bg-slate-700 flex items-center justify-center text-slate-400 group-hover:text-brand-400 transition-colors">
                    <Truck className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-200">{driver.name}</div>
                    <div className="text-xs font-mono text-slate-400">
                      @{driver.user?.username}
                    </div>
                  </div>
                </div>
                {assignZone?.driver?.id === driver.id && (
                  <Check className="h-4 w-4 text-emerald-400" />
                )}
              </button>
            ))}
            {modalDrivers.length === 0 && (
              <div className="text-center py-6 text-slate-400 text-sm">
                No se encontraron conductores.
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmConfig.isOpen}
        onClose={() => {
          if (!confirmLoading) {
            setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
          }
        }}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.confirmText}
        variant={confirmConfig.variant}
        isLoading={confirmLoading}
      />
    </div>
  );
}
