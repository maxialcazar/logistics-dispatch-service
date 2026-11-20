import {
  AlertCircle,
  BarChart3,
  Compass,
  CornerDownLeft,
  Loader2,
  Map,
  MapPin,
  Package as PackageIcon,
  PieChart,
  PlusCircle,
  Search,
  Settings,
  Truck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { packageService, type Package as IPackage } from '../services/packageService';
import { driverService, type AppDriver } from '../services/driverService';
import { zoneService, type Zone } from '../services/zoneService';
import { StatusBadge } from './StatusBadge';
import { Skeleton } from './Skeleton';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DirectoryCache {
  token: string;
  drivers: AppDriver[];
  zones: Zone[];
}

interface QuickCommand {
  id: string;
  label: string;
  subtitle: string;
  path: string;
  keywords: string;
  icon: LucideIcon;
}

type PaletteEntry =
  | { kind: 'package'; uid: string; pkg: IPackage }
  | { kind: 'driver'; uid: string; driver: AppDriver }
  | { kind: 'zone'; uid: string; zone: Zone }
  | { kind: 'command'; uid: string; command: QuickCommand };

interface PaletteSection {
  id: string;
  title: string;
  badgeText?: string;
  startIndex: number;
  items: PaletteEntry[];
}

const PACKAGE_SEARCH_DEBOUNCE_MS = 250;
const PACKAGE_SEARCH_LIMIT = 8;
const DIRECTORY_PREVIEW_LIMIT = 5;
const DIRECTORY_SEARCH_LIMIT = 8;

const QUICK_COMMANDS: QuickCommand[] = [
  {
    id: 'dashboard',
    label: 'Tablero Principal',
    subtitle: 'KPIs operativos y resumen del turno',
    path: '/',
    keywords: 'inicio dashboard kpi resumen tablero',
    icon: BarChart3,
  },
  {
    id: 'dispatch',
    label: 'Centro de Despacho',
    subtitle: 'Asignación y coordinación de envíos',
    path: '/dispatch',
    keywords: 'despacho asignar envios rutas',
    icon: Truck,
  },
  {
    id: 'monitor',
    label: 'Mapa en Vivo',
    subtitle: 'Rastreo de conductores y entregas en tiempo real',
    path: '/monitor',
    keywords: 'mapa vivo monitoreo gps ubicacion flota',
    icon: Map,
  },
  {
    id: 'packages',
    label: 'Paquetes',
    subtitle: 'Listado completo, filtros y gestión de envíos',
    path: '/packages',
    keywords: 'paquetes envios tracking ordenes',
    icon: PackageIcon,
  },
  {
    id: 'packages-new',
    label: 'Nuevo Paquete',
    subtitle: 'Registrar una nueva orden de envío',
    path: '/packages/new',
    keywords: 'crear nuevo paquete registrar orden',
    icon: PlusCircle,
  },
  {
    id: 'drivers',
    label: 'Conductores',
    subtitle: 'Flota de repartidores y credenciales',
    path: '/drivers',
    keywords: 'conductores choferes repartidores flota',
    icon: Truck,
  },
  {
    id: 'zones',
    label: 'Zonas',
    subtitle: 'Geocercas, cobertura y asignación territorial',
    path: '/zones',
    keywords: 'zonas geocercas poligonos cobertura',
    icon: MapPin,
  },
  {
    id: 'analytics',
    label: 'Reportes',
    subtitle: 'Métricas de entregas y rendimiento operativo',
    path: '/analytics',
    keywords: 'reportes analytics estadisticas eficiencia',
    icon: PieChart,
  },
  {
    id: 'settings',
    label: 'Configuración',
    subtitle: 'Preferencias de alertas, perfil y empresa',
    path: '/settings',
    keywords: 'configuracion ajustes perfil alertas',
    icon: Settings,
  },
];

function normalizeText(value: string | undefined | null): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

interface CommandPaletteDialogProps {
  onClose: () => void;
  token: string | null;
  initialDrivers: AppDriver[];
  initialZones: Zone[];
  hasCachedDirectory: boolean;
  onDirectoryLoaded: (token: string, drivers: AppDriver[], zones: Zone[]) => void;
}

function CommandPaletteDialog({
  onClose,
  token,
  initialDrivers,
  initialZones,
  hasCachedDirectory,
  onDirectoryLoaded,
}: CommandPaletteDialogProps) {
  const navigate = useNavigate();
  const listboxId = useId();
  const titleId = useId();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const [drivers, setDrivers] = useState<AppDriver[]>(initialDrivers);
  const [zones, setZones] = useState<Zone[]>(initialZones);
  const [directoryLoading, setDirectoryLoading] = useState(!hasCachedDirectory && Boolean(token));
  const [directoryError, setDirectoryError] = useState('');

  const [packages, setPackages] = useState<IPackage[]>([]);
  const [packageTotal, setPackageTotal] = useState(0);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [packageError, setPackageError] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<globalThis.Map<string, HTMLButtonElement>>(new globalThis.Map());
  const navigationSourceRef = useRef<'keyboard' | 'pointer'>('keyboard');
  const directoryRequestIdRef = useRef(0);
  const packageRequestIdRef = useRef(0);
  const onDirectoryLoadedRef = useRef(onDirectoryLoaded);
  const initialSnapshotRef = useRef({
    drivers: initialDrivers,
    zones: initialZones,
    hasCached: hasCachedDirectory,
  });

  useEffect(() => {
    onDirectoryLoadedRef.current = onDirectoryLoaded;
  }, [onDirectoryLoaded]);

  // Body scroll lock & focus restoration on open/close
  useEffect(() => {
    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    inputRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousActiveElement && document.contains(previousActiveElement)) {
        previousActiveElement.focus();
      }
    };
  }, []);

  // Load drivers & zones once per open (revalidates quietly when cached)
  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();
    const requestId = ++directoryRequestIdRef.current;

    void Promise.allSettled([
      driverService.getDrivers(token, 1, 100, controller.signal),
      zoneService.getZones(token, 1, 100, controller.signal),
    ]).then(([driversResult, zonesResult]) => {
      if (controller.signal.aborted || requestId !== directoryRequestIdRef.current) {
        return;
      }

      const snapshot = initialSnapshotRef.current;
      let nextDrivers = snapshot.drivers;
      let nextZones = snapshot.zones;
      let failedCount = 0;

      if (driversResult.status === 'fulfilled') {
        nextDrivers = driversResult.value.items || [];
        setDrivers(nextDrivers);
      } else if (!isAbortError(driversResult.reason)) {
        failedCount += 1;
      }

      if (zonesResult.status === 'fulfilled') {
        nextZones = zonesResult.value.items || [];
        setZones(nextZones);
      } else if (!isAbortError(zonesResult.reason)) {
        failedCount += 1;
      }

      if (driversResult.status === 'fulfilled' && zonesResult.status === 'fulfilled') {
        onDirectoryLoadedRef.current(token, nextDrivers, nextZones);
        setDirectoryError('');
      } else if (failedCount === 2 && !snapshot.hasCached) {
        setDirectoryError('No se pudieron cargar conductores ni zonas.');
      } else if (failedCount > 0) {
        setDirectoryError('Algunos datos de flota no se pudieron actualizar.');
      } else {
        setDirectoryError('');
      }

      setDirectoryLoading(false);
    });

    return () => {
      controller.abort();
    };
  }, [token]);

  // Debounced server-side package search with stale-response protection
  useEffect(() => {
    const trimmedQuery = query.trim().slice(0, 200);
    if (!token || !trimmedQuery) {
      return;
    }

    const controller = new AbortController();
    const requestId = ++packageRequestIdRef.current;

    const timer = window.setTimeout(() => {
      void packageService
        .getPackages(
          token,
          undefined,
          1,
          PACKAGE_SEARCH_LIMIT,
          false,
          trimmedQuery,
          controller.signal
        )
        .then((res) => {
          if (controller.signal.aborted || requestId !== packageRequestIdRef.current) {
            return;
          }
          setPackages(res.items || []);
          setPackageTotal(res.meta?.total ?? res.items?.length ?? 0);
          setPackageError('');
          setPackagesLoading(false);
        })
        .catch((err: unknown) => {
          if (
            controller.signal.aborted ||
            requestId !== packageRequestIdRef.current ||
            isAbortError(err)
          ) {
            return;
          }
          setPackages([]);
          setPackageTotal(0);
          setPackageError('No se pudieron buscar paquetes en este momento.');
          setPackagesLoading(false);
        });
    }, PACKAGE_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [token, query]);

  const handleQueryChange = (nextValue: string) => {
    const normalized = nextValue.trim();
    setQuery(nextValue);
    setActiveIndex(0);
    navigationSourceRef.current = 'keyboard';

    if (!normalized) {
      packageRequestIdRef.current += 1;
      setPackages([]);
      setPackageTotal(0);
      setPackagesLoading(false);
      setPackageError('');
      return;
    }

    if (token) {
      setPackagesLoading(true);
      setPackageError('');
    }
  };

  const normalizedQuery = normalizeText(query);
  const hasSearchQuery = normalizedQuery.length > 0;

  const matchedDrivers = useMemo(() => {
    if (!hasSearchQuery) {
      return drivers.slice(0, DIRECTORY_PREVIEW_LIMIT);
    }

    return drivers
      .filter((driver) => {
        const zoneNames = driver.zones?.map((z) => z.name).join(' ') ?? '';
        const haystack = normalizeText(
          `${driver.name} ${driver.user?.username ?? ''} ${zoneNames}`
        );
        return haystack.includes(normalizedQuery);
      })
      .slice(0, DIRECTORY_SEARCH_LIMIT);
  }, [drivers, hasSearchQuery, normalizedQuery]);

  const matchedZones = useMemo(() => {
    if (!hasSearchQuery) {
      return zones.slice(0, DIRECTORY_PREVIEW_LIMIT);
    }

    return zones
      .filter((zone) => {
        const haystack = normalizeText(
          `${zone.name} ${zone.description ?? ''} ${zone.driver?.name ?? ''}`
        );
        return haystack.includes(normalizedQuery);
      })
      .slice(0, DIRECTORY_SEARCH_LIMIT);
  }, [zones, hasSearchQuery, normalizedQuery]);

  const matchedCommands = useMemo(() => {
    if (!hasSearchQuery) {
      return QUICK_COMMANDS;
    }

    return QUICK_COMMANDS.filter((command) => {
      const haystack = normalizeText(
        `${command.label} ${command.subtitle} ${command.keywords} ${command.path}`
      );
      return haystack.includes(normalizedQuery);
    });
  }, [hasSearchQuery, normalizedQuery]);

  const sections = useMemo<PaletteSection[]>(() => {
    const list: PaletteSection[] = [];
    let offset = 0;

    if (hasSearchQuery && !packagesLoading && packages.length > 0) {
      const items: PaletteEntry[] = packages.map((pkg) => ({
        kind: 'package',
        uid: `package:${pkg.id}`,
        pkg,
      }));
      list.push({
        id: 'packages',
        title: 'Paquetes',
        badgeText:
          packageTotal > packages.length
            ? `${packages.length} de ${packageTotal}`
            : `${packages.length}`,
        startIndex: offset,
        items,
      });
      offset += items.length;
    }

    if (matchedDrivers.length > 0) {
      const items: PaletteEntry[] = matchedDrivers.map((driver) => ({
        kind: 'driver',
        uid: `driver:${driver.id}`,
        driver,
      }));
      list.push({
        id: 'drivers',
        title: 'Conductores',
        badgeText:
          !hasSearchQuery && drivers.length > matchedDrivers.length
            ? `${matchedDrivers.length} de ${drivers.length}`
            : `${matchedDrivers.length}`,
        startIndex: offset,
        items,
      });
      offset += items.length;
    }

    if (matchedZones.length > 0) {
      const items: PaletteEntry[] = matchedZones.map((zone) => ({
        kind: 'zone',
        uid: `zone:${zone.id}`,
        zone,
      }));
      list.push({
        id: 'zones',
        title: 'Zonas',
        badgeText:
          !hasSearchQuery && zones.length > matchedZones.length
            ? `${matchedZones.length} de ${zones.length}`
            : `${matchedZones.length}`,
        startIndex: offset,
        items,
      });
      offset += items.length;
    }

    if (matchedCommands.length > 0) {
      const items: PaletteEntry[] = matchedCommands.map((command) => ({
        kind: 'command',
        uid: `command:${command.id}`,
        command,
      }));
      list.push({
        id: 'commands',
        title: 'Navegación Rápida',
        badgeText: `${matchedCommands.length}`,
        startIndex: offset,
        items,
      });
      offset += items.length;
    }

    return list;
  }, [
    hasSearchQuery,
    packagesLoading,
    packages,
    packageTotal,
    matchedDrivers,
    drivers.length,
    matchedZones,
    zones.length,
    matchedCommands,
  ]);

  const flatItems = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections]
  );

  const clampedActiveIndex =
    flatItems.length === 0 ? -1 : Math.min(Math.max(activeIndex, 0), flatItems.length - 1);
  const activeItem = clampedActiveIndex >= 0 ? flatItems[clampedActiveIndex] : null;

  const getOptionId = (uid: string) =>
    `${listboxId}-option-${uid.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  // Scroll active item into view on keyboard navigation
  useEffect(() => {
    if (!activeItem || navigationSourceRef.current !== 'keyboard') return;
    const node = optionRefs.current.get(activeItem.uid);
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeItem]);

  const executeItem = (item: PaletteEntry) => {
    onClose();

    switch (item.kind) {
      case 'package':
        navigate(`/packages?search=${encodeURIComponent(item.pkg.trackingCode)}`, {
          state: {
            search: item.pkg.trackingCode,
            packageId: item.pkg.id,
          },
        });
        break;
      case 'driver':
        navigate('/drivers', {
          state: {
            driverId: item.driver.id,
            driverName: item.driver.name,
          },
        });
        break;
      case 'zone':
        navigate('/zones', {
          state: {
            zoneId: item.zone.id,
            zoneName: item.zone.name,
          },
        });
        break;
      case 'command':
        navigate(item.command.path);
        break;
    }
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    if (flatItems.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      navigationSourceRef.current = 'keyboard';
      setActiveIndex((prev) => {
        const current = prev >= flatItems.length ? 0 : prev;
        return (current + 1) % flatItems.length;
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      navigationSourceRef.current = 'keyboard';
      setActiveIndex((prev) => {
        const current = prev >= flatItems.length ? 0 : prev;
        return (current - 1 + flatItems.length) % flatItems.length;
      });
      return;
    }

    if (event.key === 'Enter') {
      if (event.target instanceof HTMLButtonElement) {
        return;
      }
      if (activeItem) {
        event.preventDefault();
        executeItem(activeItem);
      }
    }
  };

  const isSearchingAny = packagesLoading || (directoryLoading && flatItems.length === 0);
  const showEmptyState =
    hasSearchQuery && !packagesLoading && !directoryLoading && flatItems.length === 0;

  const dialog = (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center px-3 pt-3 pb-3 sm:px-4 sm:pt-[11vh]"
      onKeyDown={handleDialogKeyDown}
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Palette Surface */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex w-full max-w-2xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[min(39rem,78vh)] flex-col overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900 shadow-2xl shadow-black/70"
      >
        <h2 id={titleId} className="sr-only">
          Paleta de comandos y búsqueda global
        </h2>

        {/* Search Input Header */}
        <div className="flex items-center gap-2.5 border-b border-slate-800/80 bg-slate-950/80 px-3.5 py-2.5 sm:px-4 sm:py-3">
          {packagesLoading ? (
            <Loader2
              className="h-4 w-4 flex-shrink-0 animate-spin text-brand-400"
              aria-hidden="true"
            />
          ) : (
            <Search
              className="h-4 w-4 flex-shrink-0 text-slate-400"
              aria-hidden="true"
            />
          )}

          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={sections.length > 0}
            aria-controls={sections.length > 0 ? listboxId : undefined}
            aria-activedescendant={activeItem ? getOptionId(activeItem.uid) : undefined}
            aria-label="Buscar paquetes, conductores, zonas o vistas"
            maxLength={200}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Buscar tracking, destinatario, conductor, zona o ir a..."
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-slate-400 focus:outline-none"
          />

          {query.length > 0 && (
            <button
              type="button"
              onClick={() => {
                handleQueryChange('');
                inputRef.current?.focus();
              }}
              aria-label="Limpiar búsqueda"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar paleta de comandos"
            className="sm:hidden flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-slate-800/80 bg-slate-900 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>

          <kbd className="hidden sm:inline-flex flex-shrink-0 items-center rounded border border-slate-800/80 bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-400">
            ESC
          </kbd>
        </div>

        {/* Scrollable Results Container */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 space-y-3">
          {/* Search guidance banner when query is empty */}
          {!hasSearchQuery && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
              <div className="flex items-center gap-2 min-w-0">
                <PackageIcon className="h-3.5 w-3.5 flex-shrink-0 text-brand-400" aria-hidden="true" />
                <span className="truncate">
                  Escribe un código de tracking o destinatario para buscar paquetes en vivo.
                </span>
              </div>
            </div>
          )}

          {/* Error notices */}
          {packageError && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
            >
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <span>{packageError}</span>
            </div>
          )}

          {directoryError && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
            >
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <span>{directoryError}</span>
            </div>
          )}

          {/* Loading Skeletons */}
          {(packagesLoading || directoryLoading) && (
            <div role="status" aria-label="Buscando resultados" className="space-y-1.5 px-1">
              <span className="sr-only">Buscando resultados...</span>
              <div className="flex items-center justify-between px-2 py-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-12" />
              </div>
              {[0, 1, 2].map((idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2.5"
                >
                  <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className={clsx('h-3.5', idx === 1 ? 'w-44' : 'w-56')} />
                    <Skeleton className="h-3 w-36" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full flex-shrink-0" />
                </div>
              ))}
            </div>
          )}

          {/* Grouped Results Listbox */}
          {sections.length > 0 && (
            <div
              id={listboxId}
              role="listbox"
              aria-label="Resultados de búsqueda"
              className="space-y-3"
            >
              {sections.map((section) => {
                const sectionHeadingId = `${listboxId}-group-${section.id}`;
                return (
                  <div
                    key={section.id}
                    role="group"
                    aria-labelledby={sectionHeadingId}
                    className="space-y-1"
                  >
                    <div
                      role="presentation"
                      className="flex items-center justify-between px-2.5 pt-1 pb-0.5"
                    >
                      <span
                        id={sectionHeadingId}
                        className="text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                      >
                        {section.title}
                      </span>
                      {section.badgeText && (
                        <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                          {section.badgeText}
                        </span>
                      )}
                    </div>

                    <div role="presentation" className="space-y-0.5">
                      {section.items.map((item, idx) => {
                        const itemIndex = section.startIndex + idx;
                        const isActive = itemIndex === clampedActiveIndex;

                        return (
                          <button
                            key={item.uid}
                            id={getOptionId(item.uid)}
                            ref={(el) => {
                              if (el) {
                                optionRefs.current.set(item.uid, el);
                              } else {
                                optionRefs.current.delete(item.uid);
                              }
                            }}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            onMouseEnter={() => {
                              navigationSourceRef.current = 'pointer';
                              setActiveIndex(itemIndex);
                            }}
                            onClick={() => executeItem(item)}
                            className={clsx(
                              'w-full min-h-[48px] flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus:outline-none',
                              isActive
                                ? 'border-brand-500/35 bg-brand-500/10 text-white'
                                : 'border-transparent text-slate-300 hover:bg-slate-800/50 hover:text-white'
                            )}
                          >
                            {item.kind === 'package' && (
                              <>
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div
                                    className={clsx(
                                      'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border',
                                      isActive
                                        ? 'border-brand-500/35 bg-brand-500/15 text-brand-400'
                                        : 'border-slate-800/80 bg-slate-950 text-slate-400'
                                    )}
                                  >
                                    <PackageIcon className="h-4 w-4" aria-hidden="true" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="font-mono text-xs font-semibold text-brand-300 tabular-nums flex-shrink-0">
                                        {item.pkg.trackingCode}
                                      </span>
                                      <span className="text-slate-600 flex-shrink-0" aria-hidden="true">
                                        ·
                                      </span>
                                      <span className="text-sm font-medium text-white truncate">
                                        {item.pkg.recipientName}
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-400 truncate mt-0.5">
                                      {item.pkg.recipientAddress}
                                      {item.pkg.zone?.name ? ` · ${item.pkg.zone.name}` : ''}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <StatusBadge status={item.pkg.status} size="sm" />
                                  {isActive && (
                                    <CornerDownLeft
                                      className="hidden sm:block h-3.5 w-3.5 text-brand-400"
                                      aria-hidden="true"
                                    />
                                  )}
                                </div>
                              </>
                            )}

                            {item.kind === 'driver' && (
                              <>
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div
                                    className={clsx(
                                      'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border',
                                      isActive
                                        ? 'border-brand-500/35 bg-brand-500/15 text-brand-400'
                                        : 'border-slate-800/80 bg-slate-950 text-slate-400'
                                    )}
                                  >
                                    <Truck className="h-4 w-4" aria-hidden="true" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-sm font-medium text-white truncate">
                                        {item.driver.name}
                                      </span>
                                      {item.driver.user?.username && (
                                        <span className="font-mono text-xs text-slate-400 truncate">
                                          @{item.driver.user.username}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-400 truncate mt-0.5">
                                      {item.driver.zones && item.driver.zones.length > 0
                                        ? `Zonas: ${item.driver.zones.map((z) => z.name).join(', ')}`
                                        : 'Sin zonas asignadas'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="rounded-md border border-slate-800/80 bg-slate-950 px-2 py-0.5 text-[11px] font-medium text-slate-300 tabular-nums">
                                    {item.driver.zones?.length ?? 0} zonas
                                  </span>
                                  {isActive && (
                                    <CornerDownLeft
                                      className="hidden sm:block h-3.5 w-3.5 text-brand-400"
                                      aria-hidden="true"
                                    />
                                  )}
                                </div>
                              </>
                            )}

                            {item.kind === 'zone' && (
                              <>
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div
                                    className={clsx(
                                      'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border',
                                      isActive
                                        ? 'border-brand-500/35 bg-brand-500/15 text-brand-400'
                                        : 'border-slate-800/80 bg-slate-950 text-slate-400'
                                    )}
                                  >
                                    <MapPin className="h-4 w-4" aria-hidden="true" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="text-sm font-medium text-white truncate block">
                                      {item.zone.name}
                                    </span>
                                    <p className="text-xs text-slate-400 truncate mt-0.5">
                                      {item.zone.driver?.name
                                        ? `Conductor: ${item.zone.driver.name}`
                                        : 'Sin conductor asignado'}
                                      {item.zone.description ? ` · ${item.zone.description}` : ''}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span
                                    className={clsx(
                                      'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
                                      item.zone.isActive
                                        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                                        : 'border-slate-700/80 bg-slate-800/80 text-slate-300'
                                    )}
                                  >
                                    {item.zone.isActive ? 'Activa' : 'Inactiva'}
                                  </span>
                                  {isActive && (
                                    <CornerDownLeft
                                      className="hidden sm:block h-3.5 w-3.5 text-brand-400"
                                      aria-hidden="true"
                                    />
                                  )}
                                </div>
                              </>
                            )}

                            {item.kind === 'command' && (
                              <>
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div
                                    className={clsx(
                                      'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border',
                                      isActive
                                        ? 'border-brand-500/35 bg-brand-500/15 text-brand-400'
                                        : 'border-slate-800/80 bg-slate-950 text-slate-400'
                                    )}
                                  >
                                    <item.command.icon className="h-4 w-4" aria-hidden="true" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="text-sm font-medium text-white truncate block">
                                      {item.command.label}
                                    </span>
                                    <p className="text-xs text-slate-400 truncate mt-0.5">
                                      {item.command.subtitle}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="hidden sm:inline font-mono text-[11px] text-slate-400">
                                    {item.command.path}
                                  </span>
                                  {isActive && (
                                    <CornerDownLeft
                                      className="hidden sm:block h-3.5 w-3.5 text-brand-400"
                                      aria-hidden="true"
                                    />
                                  )}
                                </div>
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Clear Empty State */}
          {showEmptyState && (
            <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-800/80 bg-slate-950 text-slate-400">
                <Search className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-white">
                No se encontraron resultados para «{query.trim()}»
              </p>
              <p className="mt-1 max-w-md text-xs text-slate-400">
                Verifica el código de tracking, nombre del destinatario, conductor, zona o prueba con otro término.
              </p>
              <button
                type="button"
                onClick={() => {
                  handleQueryChange('');
                  inputRef.current?.focus();
                }}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Limpiar búsqueda
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 bg-slate-950/70 px-3.5 py-2 text-[11px] text-slate-400">
          <div className="flex items-center gap-2 min-w-0">
            <Compass className="h-3.5 w-3.5 flex-shrink-0 text-brand-400" aria-hidden="true" />
            <span className="truncate tabular-nums">
              {isSearchingAny
                ? 'Buscando...'
                : `${flatItems.length} ${flatItems.length === 1 ? 'resultado' : 'resultados'}`}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-slate-800/80 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                ↑↓
              </kbd>
              <span>navegar</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-slate-800/80 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                ↵
              </kbd>
              <span>abrir</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-slate-800/80 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                Esc
              </kbd>
              <span>cerrar</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(dialog, document.body) : dialog;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const { token } = useAuth();
  const [directoryCache, setDirectoryCache] = useState<DirectoryCache | null>(null);

  if (!isOpen) return null;

  const activeCache =
    token && directoryCache && directoryCache.token === token ? directoryCache : null;

  return (
    <CommandPaletteDialog
      onClose={onClose}
      token={token}
      initialDrivers={activeCache?.drivers ?? []}
      initialZones={activeCache?.zones ?? []}
      hasCachedDirectory={Boolean(activeCache)}
      onDirectoryLoaded={(loadedToken, drivers, zones) => {
        setDirectoryCache({ token: loadedToken, drivers, zones });
      }}
    />
  );
}
