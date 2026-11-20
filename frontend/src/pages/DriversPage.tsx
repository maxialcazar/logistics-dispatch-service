import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ExternalLink,
  Eye,
  Loader2,
  MapPin,
  Package as PackageIcon,
  Pencil,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { ApiError } from '../services/apiClient';
import {
  driverService,
  type AppDriver,
  type DriverDetail,
  type UpdateDriverInput,
} from '../services/driverService';
import { packageService, type Package as IPackage } from '../services/packageService';
import { Modal } from '../components/Modal';
import { Drawer } from '../components/Drawer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Skeleton, SkeletonTableRows } from '../components/Skeleton';
import { StatusBadge } from '../components/StatusBadge';

const ONLINE_RECENCY_MS = 5 * 60 * 1000;

interface SocketLocation {
  driverId: string;
  lat: number;
  lng: number;
  timestamp: number;
}

interface DriverPresence {
  isOnline: boolean;
  lastActivityMs: number | null;
  lat: number | null;
  lng: number | null;
}

function normalizeTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function getDriverPresence(
  driver: AppDriver,
  socketLocation: SocketLocation | undefined,
  nowMs: number
): DriverPresence {
  const socketTs = normalizeTimestampMs(socketLocation?.timestamp);
  const hasSocketCoords =
    socketLocation != null &&
    Number.isFinite(socketLocation.lat) &&
    Number.isFinite(socketLocation.lng);

  const isSocketFresh =
    socketLocation != null &&
    (socketTs !== null ? nowMs - socketTs <= ONLINE_RECENCY_MS : hasSocketCoords);

  const apiActivityMs = normalizeTimestampMs(driver.lastSeenAt ?? driver.lastLocationAt);

  if (isSocketFresh) {
    return {
      isOnline: true,
      lastActivityMs: socketTs ?? nowMs,
      lat: hasSocketCoords ? socketLocation.lat : driver.lat ?? null,
      lng: hasSocketCoords ? socketLocation.lng : driver.lng ?? null,
    };
  }

  if (driver.isOnline === true) {
    return {
      isOnline: true,
      lastActivityMs: apiActivityMs ?? socketTs,
      lat: driver.lat ?? null,
      lng: driver.lng ?? null,
    };
  }

  if (apiActivityMs !== null && nowMs - apiActivityMs <= ONLINE_RECENCY_MS) {
    return {
      isOnline: true,
      lastActivityMs: apiActivityMs,
      lat: driver.lat ?? null,
      lng: driver.lng ?? null,
    };
  }

  const latestMs = Math.max(socketTs ?? 0, apiActivityMs ?? 0) || null;
  return {
    isOnline: false,
    lastActivityMs: latestMs,
    lat: (hasSocketCoords ? socketLocation.lat : null) ?? driver.lat ?? null,
    lng: (hasSocketCoords ? socketLocation.lng : null) ?? driver.lng ?? null,
  };
}

function formatRelativeActivity(lastActivityMs: number | null, nowMs: number): string {
  if (lastActivityMs === null) return 'Sin señal reciente';
  const diffMs = Math.max(0, nowMs - lastActivityMs);
  if (diffMs < 60_000) return 'Hace instantes';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours} h`;
  return new Date(lastActivityMs).toLocaleDateString('es-AR');
}

function formatDriverApiError(
  err: unknown,
  action: 'create' | 'edit' | 'delete' | 'detail'
): string {
  if (err instanceof ApiError) {
    if (err.status === 409) {
      return 'El nombre de usuario ya está en uso. Elige otro distinto.';
    }
    if (err.status === 422) {
      if (action === 'delete') {
        return 'No se puede dar de baja al conductor porque tiene paquetes actualmente en tránsito.';
      }
      if (action === 'edit') {
        return 'El conductor no tiene una cuenta de usuario vinculada para actualizar sus credenciales.';
      }
    }
    if (err.status === 404) {
      return 'El conductor ya no se encuentra registrado.';
    }
  }
  return err instanceof Error ? err.message : 'Ocurrió un error inesperado.';
}

export function DriversPage() {
  const { token } = useAuth();
  const { locations, isConnected } = useSocket();
  const location = useLocation();
  const navigate = useNavigate();

  const [drivers, setDrivers] = useState<AppDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Search & Online Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');

  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    username: '',
    password: '',
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  // Edit Modal State
  const [editingDriver, setEditingDriver] = useState<AppDriver | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    username: '',
    password: '',
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete Confirm State
  const [deletingDriver, setDeletingDriver] = useState<AppDriver | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Detail Drawer State
  const [detailDriverId, setDetailDriverId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<DriverDetail | null>(null);
  const [detailPackages, setDetailPackages] = useState<IPackage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailReloadKey, setDetailReloadKey] = useState(0);
  const [syncedLocationKey, setSyncedLocationKey] = useState('');

  const detailReqSeqRef = useRef(0);

  const createFormId = useId();
  const createNameId = useId();
  const createUsernameId = useId();
  const createPasswordId = useId();

  const editFormId = useId();
  const editNameId = useId();
  const editUsernameId = useId();
  const editPasswordId = useId();

  // Support CommandPalette deep-link navigation to /drivers with state.driverId
  const stateDriverId =
    typeof (location.state as { driverId?: unknown } | null)?.driverId === 'string'
      ? (location.state as { driverId: string }).driverId
      : null;

  if (stateDriverId && location.key !== syncedLocationKey) {
    setSyncedLocationKey(location.key);
    setDetailDriverId(stateDriverId);
    setDetailData(null);
    setDetailPackages([]);
    setDetailError('');
    setDetailLoading(true);
    setDetailReloadKey((prev) => prev + 1);
  }

  // Keep relative online freshness ticking every 30s
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Load Drivers List
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    let isActive = true;

    driverService
      .getDrivers(token, 1, 100, controller.signal)
      .then((data) => {
        if (!isActive || controller.signal.aborted) return;
        setDrivers(data.items || []);
        setError('');
      })
      .catch((err: unknown) => {
        if (
          !isActive ||
          controller.signal.aborted ||
          (err instanceof Error && err.name === 'AbortError')
        ) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Error al cargar conductores');
      })
      .finally(() => {
        if (isActive && !controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [token, refreshKey]);

  // Load Driver Detail + Assigned Packages when Detail Drawer is open
  useEffect(() => {
    if (!token || !detailDriverId) return;
    const controller = new AbortController();
    const seq = ++detailReqSeqRef.current;

    Promise.all([
      driverService.getDriverById(token, detailDriverId, controller.signal),
      packageService
        .getPackages(token, undefined, 1, 100, false, undefined, controller.signal, {
          driverId: detailDriverId,
        })
        .catch(() => null),
    ])
      .then(([driverDetail, packagesRes]) => {
        if (controller.signal.aborted || seq !== detailReqSeqRef.current) return;
        setDetailData(driverDetail);
        const resolvedPackages =
          packagesRes && packagesRes.items.length > 0
            ? packagesRes.items
            : driverDetail.packages.length > 0
              ? driverDetail.packages
              : packagesRes?.items ?? [];
        setDetailPackages(resolvedPackages);
        setDetailError('');
      })
      .catch((err: unknown) => {
        if (
          controller.signal.aborted ||
          seq !== detailReqSeqRef.current ||
          (err instanceof Error && err.name === 'AbortError')
        ) {
          return;
        }
        setDetailError(formatDriverApiError(err, 'detail'));
      })
      .finally(() => {
        if (!controller.signal.aborted && seq === detailReqSeqRef.current) {
          setDetailLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [token, detailDriverId, detailReloadKey]);

  const triggerRefresh = useCallback(() => {
    setLoading(true);
    setError('');
    setRefreshKey((prev) => prev + 1);
  }, []);

  const isLoading = Boolean(token) && loading;

  const openDetailDrawer = (driverId: string) => {
    setDetailDriverId(driverId);
    setDetailData(null);
    setDetailPackages([]);
    setDetailError('');
    setDetailLoading(true);
  };

  const closeDetailDrawer = () => {
    setDetailDriverId(null);
    setDetailData(null);
    setDetailPackages([]);
    setDetailError('');
    setDetailLoading(false);
  };

  const reloadDetailDrawer = () => {
    if (!detailDriverId) return;
    setDetailError('');
    setDetailLoading(true);
    setDetailReloadKey((prev) => prev + 1);
  };

  const handleCloseCreateModal = () => {
    if (createLoading) return;
    setShowCreateModal(false);
    setCreateError('');
  };

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = createForm.name.trim();
    const trimmedUsername = createForm.username.trim();
    if (trimmedName.length < 2) {
      setCreateError('El nombre completo debe tener al menos 2 caracteres.');
      return;
    }
    if (trimmedUsername.length < 3) {
      setCreateError('El usuario de acceso debe tener al menos 3 caracteres.');
      return;
    }
    if (createForm.password.length < 6) {
      setCreateError('La contraseña inicial debe tener al menos 6 caracteres.');
      return;
    }

    setCreateLoading(true);
    setCreateError('');

    try {
      if (!token) throw new Error('Sesión expirada.');
      await driverService.createDriver(token, {
        name: trimmedName,
        username: trimmedUsername,
        password: createForm.password,
      });
      setCreateForm({ name: '', username: '', password: '' });
      setShowCreateModal(false);
      toast.success('Conductor registrado correctamente');
      triggerRefresh();
    } catch (err: unknown) {
      const msg = formatDriverApiError(err, 'create');
      setCreateError(msg);
      toast.error(msg);
    } finally {
      setCreateLoading(false);
    }
  };

  const openEditModal = (driver: AppDriver) => {
    setEditingDriver(driver);
    setEditForm({
      name: driver.name,
      username: driver.user?.username ?? '',
      password: '',
    });
    setEditError('');
  };

  const handleCloseEditModal = () => {
    if (editLoading) return;
    setEditingDriver(null);
    setEditError('');
  };

  const handleEditDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDriver) return;

    const trimmedName = editForm.name.trim();
    const trimmedUsername = editForm.username.trim();
    const rawPassword = editForm.password;

    if (trimmedName.length < 2) {
      setEditError('El nombre debe tener al menos 2 caracteres.');
      return;
    }
    const hadLinkedUsername = Boolean(editingDriver.user?.username);
    if (hadLinkedUsername && trimmedUsername.length < 3) {
      setEditError('El usuario de acceso es obligatorio y debe tener al menos 3 caracteres.');
      return;
    }
    if (!hadLinkedUsername && editForm.username.trim() !== '' && trimmedUsername.length < 3) {
      setEditError('El usuario debe tener al menos 3 caracteres.');
      return;
    }
    if (rawPassword.length > 0 && rawPassword.length < 6) {
      setEditError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }

    const payload: UpdateDriverInput = {};
    if (trimmedName !== editingDriver.name) {
      payload.name = trimmedName;
    }
    if (trimmedUsername && trimmedUsername !== (editingDriver.user?.username ?? '')) {
      payload.username = trimmedUsername;
    }
    if (rawPassword.length >= 6) {
      payload.password = rawPassword;
    }

    if (Object.keys(payload).length === 0) {
      handleCloseEditModal();
      return;
    }

    setEditLoading(true);
    setEditError('');

    try {
      if (!token) throw new Error('Sesión expirada.');
      const updated = await driverService.updateDriver(token, editingDriver.id, payload);
      setDrivers((prev) =>
        prev.map((d) =>
          d.id === editingDriver.id
            ? {
                ...d,
                ...updated,
                name: updated.name || trimmedName,
                user: updated.user ?? (trimmedUsername ? { ...d.user, username: trimmedUsername } : d.user),
                zones: updated.zones && updated.zones.length > 0 ? updated.zones : d.zones,
              }
            : d
        )
      );
      if (detailDriverId === editingDriver.id) {
        setDetailReloadKey((prev) => prev + 1);
      }
      setEditingDriver(null);
      toast.success('Datos del conductor actualizados');
    } catch (err: unknown) {
      const msg = formatDriverApiError(err, 'edit');
      setEditError(msg);
      toast.error(msg);
    } finally {
      setEditLoading(false);
    }
  };

  const handleConfirmDeleteDriver = async () => {
    if (!token || !deletingDriver || deleteLoading) return;
    setDeleteLoading(true);
    const target = deletingDriver;

    try {
      const res = await driverService.deleteDriver(token, target.id);
      setDrivers((prev) => prev.filter((d) => d.id !== target.id));
      if (detailDriverId === target.id) {
        closeDetailDrawer();
      }
      setDeletingDriver(null);

      const reverted = typeof res?.revertedCount === 'number' ? res.revertedCount : null;
      toast.success(
        reverted !== null && reverted > 0
          ? `${target.name} dado de baja. ${reverted} paquete(s) pasaron a pendiente.`
          : `${target.name} dado de baja correctamente.`
      );
    } catch (err: unknown) {
      const msg = formatDriverApiError(err, 'delete');
      toast.error(msg);
      if (err instanceof ApiError && err.status === 404) {
        setDeletingDriver(null);
        if (detailDriverId === target.id) {
          closeDetailDrawer();
        }
        triggerRefresh();
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  // Precompute presence + KPI summary
  const driversWithPresence = useMemo(() => {
    return drivers.map((driver) => ({
      driver,
      presence: getDriverPresence(driver, locations.get(driver.id), nowMs),
    }));
  }, [drivers, locations, nowMs]);

  const onlineCount = useMemo(
    () => driversWithPresence.filter((entry) => entry.presence.isOnline).length,
    [driversWithPresence]
  );

  const assignedZonesCount = useMemo(
    () => drivers.reduce((acc, d) => acc + (d.zones?.length ?? 0), 0),
    [drivers]
  );

  const filteredDrivers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return driversWithPresence.filter(({ driver, presence }) => {
      if (statusFilter === 'online' && !presence.isOnline) return false;
      if (statusFilter === 'offline' && presence.isOnline) return false;
      if (!q) return true;

      const zoneNames = driver.zones?.map((z) => z.name.toLowerCase()).join(' ') ?? '';
      return (
        driver.name.toLowerCase().includes(q) ||
        (driver.user?.username ?? '').toLowerCase().includes(q) ||
        zoneNames.includes(q)
      );
    });
  }, [driversWithPresence, searchQuery, statusFilter]);

  const selectedListDriver = useMemo(
    () => drivers.find((d) => d.id === detailDriverId) ?? null,
    [drivers, detailDriverId]
  );

  const activeDetailDriver = detailData ?? selectedListDriver;
  const activeDetailPresence = useMemo(() => {
    if (!activeDetailDriver) return null;
    return getDriverPresence(
      activeDetailDriver,
      locations.get(activeDetailDriver.id),
      nowMs
    );
  }, [activeDetailDriver, locations, nowMs]);

  return (
    <div className="space-y-5 relative pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Users className="h-7 w-7 text-brand-400" />
            Gestión de Conductores
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Administra la flota, presencia en vivo, paquetes asignados y bajas seguras.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={triggerRefresh}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800/80 text-slate-300 hover:text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            title="Actualizar lista"
          >
            <RefreshCw className={clsx('h-4 w-4', isLoading && 'animate-spin')} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg shadow-lg shadow-brand-950/30 transition-all"
          >
            <UserPlus className="h-4 w-4" />
            Nuevo Conductor
          </button>
        </div>
      </div>

      {/* Compact Operational KPI Bar */}
      {!isLoading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-slate-900 border border-slate-800/80 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Flota Registrada
              </p>
              <p className="text-xl font-bold text-white tabular-nums mt-0.5">
                {drivers.length}
              </p>
            </div>
            <div className="h-9 w-9 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
              <Users className="h-4 w-4" />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800/80 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                En Línea Ahora
              </p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <p className="text-xl font-bold text-emerald-400 tabular-nums">
                  {onlineCount}
                </p>
                <span className="text-[11px] text-slate-400">
                  {isConnected ? 'Telemetry live' : 'Socket reconectando'}
                </span>
              </div>
            </div>
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              {isConnected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4 text-amber-400" />}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800/80 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Zonas Cubiertas
              </p>
              <p className="text-xl font-bold text-white tabular-nums mt-0.5">
                {assignedZonesCount}
              </p>
            </div>
            <div className="h-9 w-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
              <MapPin className="h-4 w-4" />
            </div>
          </div>
        </div>
      )}

      {/* Search & Status Filter Toolbar */}
      {!isLoading && !error && drivers.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800/80 rounded-xl p-3">
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, usuario o zona..."
              aria-label="Buscar conductores"
              className="w-full bg-slate-950 border border-slate-800/80 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800/80">
            {(
              [
                { id: 'all', label: `Todos (${drivers.length})` },
                { id: 'online', label: `Online (${onlineCount})` },
                { id: 'offline', label: `Offline (${drivers.length - onlineCount})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={clsx(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors tabular-nums',
                  statusFilter === tab.id
                    ? 'bg-slate-800 text-white border border-slate-700/80'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Content */}
      {isLoading ? (
        <div
          role="status"
          aria-label="Cargando conductores"
          className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden shadow-sm"
        >
          <span className="sr-only">Cargando conductores...</span>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-800/80 bg-slate-950/60 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="px-5 py-3.5 font-semibold">Conductor</th>
                  <th className="px-5 py-3.5 font-semibold">Usuario</th>
                  <th className="px-5 py-3.5 font-semibold">Estado</th>
                  <th className="px-5 py-3.5 font-semibold">Zonas Asignadas</th>
                  <th className="px-5 py-3.5 font-semibold">Alta</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-sm">
                <SkeletonTableRows
                  rows={6}
                  cellClassName="px-5 py-3.5"
                  columns={['avatar-text', 'icon-text', 'pill', 'badges', 'short', 'short']}
                />
              </tbody>
            </table>
          </div>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="bg-slate-900 border border-red-500/20 rounded-xl p-10 text-center flex flex-col items-center justify-center gap-3"
        >
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm text-red-300">Error: {error}</p>
          <button
            type="button"
            onClick={triggerRefresh}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Reintentar
          </button>
        </div>
      ) : drivers.length === 0 ? (
        <div className="text-center py-14 px-6 text-slate-400 bg-slate-900 rounded-xl border border-slate-800/80">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-25" />
          <p className="text-base font-semibold text-white">No hay conductores registrados</p>
          <p className="text-sm text-slate-400 mt-1">
            Da de alta a tu primer repartidor para comenzar a asignar zonas y envíos.
          </p>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Registrar el primer conductor
          </button>
        </div>
      ) : filteredDrivers.length === 0 ? (
        <div className="text-center py-12 px-6 text-slate-400 bg-slate-900 rounded-xl border border-slate-800/80">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-25" />
          <p className="text-sm font-medium text-white">
            Sin resultados para los filtros aplicados
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
            }}
            className="mt-3 text-xs font-medium text-brand-400 hover:text-brand-300 underline"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-800/80 bg-slate-950/60 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="px-5 py-3.5 font-semibold">Conductor</th>
                  <th className="px-5 py-3.5 font-semibold">Usuario</th>
                  <th className="px-5 py-3.5 font-semibold">Estado Online</th>
                  <th className="px-5 py-3.5 font-semibold">Zonas Asignadas</th>
                  <th className="px-5 py-3.5 font-semibold">Alta</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-sm">
                {filteredDrivers.map(({ driver, presence }) => (
                  <tr
                    key={driver.id}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <button
                        type="button"
                        onClick={() => openDetailDrawer(driver.id)}
                        className="group flex items-center gap-2.5 text-left font-medium text-white hover:text-brand-300 transition-colors"
                      >
                        <span className="h-7 w-7 rounded-full bg-slate-800 border border-slate-700/80 flex items-center justify-center text-xs font-semibold text-slate-200 flex-shrink-0">
                          {driver.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="truncate">{driver.name}</span>
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-slate-300 font-mono text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                        {driver.user?.username || 'Sin Usuario'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={clsx(
                            'inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                            presence.isOnline
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
                              : 'bg-slate-800/80 text-slate-300 border-slate-700/80'
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={clsx(
                              'h-1.5 w-1.5 rounded-full',
                              presence.isOnline
                                ? 'bg-emerald-400 animate-pulse'
                                : 'bg-slate-500'
                            )}
                          />
                          {presence.isOnline ? 'Online' : 'Offline'}
                        </span>
                        <span className="text-[11px] text-slate-400 tabular-nums">
                          {formatRelativeActivity(presence.lastActivityMs, nowMs)}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-400">
                      {driver.zones && driver.zones.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {driver.zones.map((z) => (
                            <span
                              key={z.id}
                              className="px-2 py-0.5 bg-slate-950 rounded text-xs text-slate-200 border border-slate-800/80"
                            >
                              {z.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-xs">Sin zonas</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-400 tabular-nums whitespace-nowrap">
                      {new Date(driver.createdAt).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openDetailDrawer(driver.id)}
                          aria-label={`Ver detalle y paquetes de ${driver.name}`}
                          title="Ver detalle y paquetes asignados"
                          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-800/80 bg-slate-950/70 text-slate-300 hover:text-brand-300 hover:border-brand-500/40 transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(driver)}
                          aria-label={`Editar a ${driver.name}`}
                          title="Editar conductor"
                          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-800/80 bg-slate-950/70 text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingDriver(driver)}
                          aria-label={`Dar de baja a ${driver.name}`}
                          title="Dar de baja conductor"
                          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-800/80 bg-slate-950/70 text-slate-400 hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Driver Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={handleCloseCreateModal}
        closeOnBackdropClick={!createLoading}
        closeOnEscape={!createLoading}
        title="Registrar Conductor"
        icon={<UserPlus className="h-4 w-4" />}
        footer={
          <>
            <button
              type="button"
              onClick={handleCloseCreateModal}
              disabled={createLoading}
              className="px-4 py-2 min-h-[40px] text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/80 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form={createFormId}
              disabled={
                createLoading ||
                !createForm.name.trim() ||
                !createForm.username.trim() ||
                !createForm.password
              }
              className="px-4 py-2 min-h-[40px] text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 rounded-lg shadow-lg shadow-brand-950/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center gap-2"
            >
              {createLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Crear Conductor
            </button>
          </>
        }
      >
        <form id={createFormId} onSubmit={handleCreateDriver} className="space-y-4">
          {createError && (
            <div
              role="alert"
              className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm flex items-center gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor={createNameId} className="block text-xs font-medium text-slate-300">
              Nombre Completo
            </label>
            <input
              id={createNameId}
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              required
              minLength={2}
              className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 focus:outline-none disabled:opacity-50"
              placeholder="ej. Juan Perez"
              autoFocus
              disabled={createLoading}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={createUsernameId} className="block text-xs font-medium text-slate-300">
              Usuario de Acceso
            </label>
            <input
              id={createUsernameId}
              type="text"
              value={createForm.username}
              onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
              required
              minLength={3}
              className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 focus:outline-none disabled:opacity-50"
              placeholder="ej. jperez"
              disabled={createLoading}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={createPasswordId} className="block text-xs font-medium text-slate-300">
              Contraseña Inicial
            </label>
            <input
              id={createPasswordId}
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              required
              minLength={6}
              className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 focus:outline-none disabled:opacity-50"
              placeholder="Mínimo 6 caracteres"
              disabled={createLoading}
            />
          </div>
        </form>
      </Modal>

      {/* Edit Driver Modal */}
      <Modal
        isOpen={Boolean(editingDriver)}
        onClose={handleCloseEditModal}
        closeOnBackdropClick={!editLoading}
        closeOnEscape={!editLoading}
        title="Editar Conductor"
        subtitle={editingDriver ? `Actualiza datos y acceso de ${editingDriver.name}` : undefined}
        icon={<Pencil className="h-4 w-4" />}
        footer={
          <>
            <button
              type="button"
              onClick={handleCloseEditModal}
              disabled={editLoading}
              className="px-4 py-2 min-h-[40px] text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/80 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form={editFormId}
              disabled={editLoading || !editForm.name.trim()}
              className="px-4 py-2 min-h-[40px] text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 rounded-lg shadow-lg shadow-brand-950/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center gap-2"
            >
              {editLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar Cambios
            </button>
          </>
        }
      >
        <form id={editFormId} onSubmit={handleEditDriver} className="space-y-4">
          {editError && (
            <div
              role="alert"
              className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm flex items-center gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{editError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor={editNameId} className="block text-xs font-medium text-slate-300">
              Nombre Completo
            </label>
            <input
              id={editNameId}
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              required
              minLength={2}
              maxLength={120}
              className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 focus:outline-none disabled:opacity-50"
              autoFocus
              disabled={editLoading}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={editUsernameId} className="block text-xs font-medium text-slate-300">
              Usuario de Acceso
            </label>
            <input
              id={editUsernameId}
              type="text"
              value={editForm.username}
              onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
              required={Boolean(editingDriver?.user?.username)}
              minLength={3}
              maxLength={60}
              className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 focus:outline-none disabled:opacity-50"
              placeholder="ej. jperez"
              disabled={editLoading}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={editPasswordId} className="block text-xs font-medium text-slate-300">
              Nueva Contraseña (Opcional)
            </label>
            <input
              id={editPasswordId}
              type="password"
              value={editForm.password}
              onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
              minLength={6}
              maxLength={128}
              className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 focus:outline-none disabled:opacity-50"
              placeholder="Dejar vacío para conservar la actual"
              disabled={editLoading}
            />
          </div>
        </form>
      </Modal>

      {/* Delete Driver Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deletingDriver)}
        onClose={() => {
          if (!deleteLoading) setDeletingDriver(null);
        }}
        onConfirm={handleConfirmDeleteDriver}
        title="Dar de baja conductor"
        variant="danger"
        confirmText="Dar de baja"
        isLoading={deleteLoading}
        message={
          deletingDriver
            ? `¿Confirmas dar de baja a "${deletingDriver.name}"? Sus zonas asignadas${
                deletingDriver.zones?.length ? ` (${deletingDriver.zones.length})` : ''
              } quedarán desvinculadas y los paquetes en estado "Asignado" volverán automáticamente a "Pendiente". Si tiene envíos en tránsito la baja será bloqueada.`
            : ''
        }
      />

      {/* Driver Detail & Assigned Packages Drawer */}
      <Drawer
        isOpen={Boolean(detailDriverId)}
        onClose={closeDetailDrawer}
        closeOnBackdropClick={!editingDriver && !deletingDriver}
        closeOnEscape={!editingDriver && !deletingDriver}
        title={activeDetailDriver?.name || 'Detalle del Conductor'}
        subtitle={
          activeDetailDriver?.user?.username
            ? `@${activeDetailDriver.user.username}`
            : 'Ficha operativa y paquetes asignados'
        }
        icon={<Users className="h-4 w-4" />}
        size="lg"
        footer={
          activeDetailDriver ? (
            <div className="w-full flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setDeletingDriver(activeDetailDriver)}
                className="px-3.5 py-2 text-xs font-medium text-red-300 hover:text-white bg-red-500/10 hover:bg-red-600 border border-red-500/30 rounded-lg transition-colors inline-flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Dar de baja
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditModal(activeDetailDriver)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/80 rounded-lg transition-colors inline-flex items-center gap-1.5"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar datos
                </button>
                <button
                  type="button"
                  onClick={closeDetailDrawer}
                  className="px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 rounded-lg transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          ) : undefined
        }
      >
        {detailLoading ? (
          <div role="status" aria-label="Cargando detalle del conductor" className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
            </div>
            <Skeleton className="h-16 rounded-xl" />
            <div className="space-y-2.5">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          </div>
        ) : detailError ? (
          <div
            role="alert"
            className="bg-slate-950 border border-red-500/20 rounded-xl p-8 text-center flex flex-col items-center gap-3"
          >
            <AlertCircle className="h-8 w-8 text-red-400" />
            <p className="text-sm text-red-300">{detailError}</p>
            <button
              type="button"
              onClick={reloadDetailDrawer}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Reintentar
            </button>
          </div>
        ) : activeDetailDriver ? (
          <div className="space-y-6">
            {/* Presence & Telemetry Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 space-y-1.5">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                  Estado de Conexión
                </span>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={clsx(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                      activeDetailPresence?.isOnline
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700/80'
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={clsx(
                        'h-1.5 w-1.5 rounded-full',
                        activeDetailPresence?.isOnline
                          ? 'bg-emerald-400 animate-pulse'
                          : 'bg-slate-500'
                      )}
                    />
                    {activeDetailPresence?.isOnline ? 'Online' : 'Offline'}
                  </span>
                  <span className="text-xs text-slate-400 tabular-nums">
                    {formatRelativeActivity(activeDetailPresence?.lastActivityMs ?? null, nowMs)}
                  </span>
                </div>
                {activeDetailPresence?.lat != null && activeDetailPresence?.lng != null && (
                  <p className="text-[11px] font-mono text-slate-400 tabular-nums pt-0.5">
                    GPS: {activeDetailPresence.lat.toFixed(5)}, {activeDetailPresence.lng.toFixed(5)}
                  </p>
                )}
              </div>

              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 space-y-1.5">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                  Credenciales y Alta
                </span>
                <div className="flex items-center gap-1.5 text-sm font-mono text-slate-200">
                  <Shield className="h-3.5 w-3.5 text-brand-400" />
                  <span>{activeDetailDriver.user?.username || 'Sin usuario'}</span>
                </div>
                <p className="text-xs text-slate-400 tabular-nums">
                  Registrado:{' '}
                  {activeDetailDriver.createdAt
                    ? new Date(activeDetailDriver.createdAt).toLocaleDateString('es-AR')
                    : '—'}
                </p>
              </div>
            </div>

            {/* Assigned Zones */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-brand-400" />
                Zonas Asignadas ({activeDetailDriver.zones?.length ?? 0})
              </h3>
              {activeDetailDriver.zones && activeDetailDriver.zones.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {activeDetailDriver.zones.map((zone) => (
                    <span
                      key={zone.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800/80 text-xs text-slate-200"
                    >
                      <span
                        className={clsx(
                          'h-1.5 w-1.5 rounded-full',
                          zone.isActive === false ? 'bg-slate-500' : 'bg-emerald-400'
                        )}
                      />
                      {zone.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic bg-slate-950/50 border border-slate-800/80 rounded-lg px-3 py-2.5">
                  Este conductor aún no tiene zonas asignadas.
                </p>
              )}
            </div>

            {/* Assigned Packages */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <PackageIcon className="h-3.5 w-3.5 text-brand-400" />
                  Paquetes Asignados (
                  <span className="tabular-nums">{detailPackages.length}</span>)
                </h3>
                <button
                  type="button"
                  onClick={reloadDetailDrawer}
                  className="text-xs text-brand-400 hover:text-brand-300 inline-flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  Recargar
                </button>
              </div>

              {detailPackages.length === 0 ? (
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-6 text-center text-slate-400">
                  <PackageIcon className="h-8 w-8 mx-auto mb-2 opacity-25" />
                  <p className="text-sm font-medium text-slate-300">
                    Sin paquetes asignados actualmente
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Los envíos asignados al conductor o a sus zonas activas aparecerán aquí.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {detailPackages.map((pkg) => (
                    <div
                      key={pkg.id}
                      className="bg-slate-950/70 border border-slate-800/80 hover:border-slate-700/80 rounded-xl p-3 transition-colors flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono tabular-nums text-xs font-semibold text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-800/80">
                            #{pkg.trackingCode}
                          </span>
                          <StatusBadge status={pkg.status} />
                          {pkg.zone?.name && (
                            <span className="text-[11px] text-slate-400">
                              {pkg.zone.name}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-slate-100 truncate">
                          {pkg.recipientName}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {pkg.recipientAddress}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          closeDetailDrawer();
                          navigate(`/packages?search=${encodeURIComponent(pkg.trackingCode)}`, {
                            state: { packageId: pkg.id },
                          });
                        }}
                        title="Abrir paquete en Paquetes"
                        aria-label={`Abrir detalle del paquete ${pkg.trackingCode}`}
                        className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-800/80 bg-slate-900 text-slate-400 hover:text-brand-300 hover:border-brand-500/40 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
