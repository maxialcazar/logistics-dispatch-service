import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  AlertCircle,
  ArchiveRestore,
  Camera,
  Check,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  History,
  ImageOff,
  Loader2,
  MapPin,
  Navigation,
  Package as PackageIcon,
  PenLine,
  Phone,
  RefreshCw,
  Save,
  ShieldAlert,
  Truck,
  User,
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Drawer } from './Drawer';
import { Skeleton } from './Skeleton';
import { StatusBadge } from './StatusBadge';
import { ApiError } from '../services/apiClient';
import {
  packageService,
  type PackageDetail,
  type UpdatePackageInput,
} from '../services/packageService';
import type { Zone } from '../services/zoneService';
import {
  PACKAGE_STATUS_ORDER,
  getPackageStatusToken,
  type PackageStatus,
} from '../utils/packageStatus';
import { buildTrackingUrl } from '../utils/trackingLinks';

interface PackageDetailDrawerProps {
  isOpen: boolean;
  packageId: string | null;
  onClose: () => void;
  token: string | null;
  zones: Zone[];
  onPackageUpdated: () => void | Promise<void>;
  onCopyTrackingLink: (trackingCode: string) => Promise<boolean>;
}

type DrawerTab = 'operations' | 'edit';

interface EditFormState {
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  recipientAddress: string;
  addressStreet: string;
  addressNumber: string;
  addressFloor: string;
  addressCity: string;
  addressZip: string;
  addressReferences: string;
  senderName: string;
  senderAddress: string;
  senderPhone: string;
  lat: string;
  lng: string;
  weight: string;
  volume: string;
  estimatedDeliveryAt: string;
  deliveryWindowStart: string;
  deliveryWindowEnd: string;
}

const EMPTY_FORM: EditFormState = {
  recipientName: '',
  recipientPhone: '',
  recipientEmail: '',
  recipientAddress: '',
  addressStreet: '',
  addressNumber: '',
  addressFloor: '',
  addressCity: '',
  addressZip: '',
  addressReferences: '',
  senderName: '',
  senderAddress: '',
  senderPhone: '',
  lat: '',
  lng: '',
  weight: '',
  volume: '',
  estimatedDeliveryAt: '',
  deliveryWindowStart: '',
  deliveryWindowEnd: '',
};

function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(localVal: string): string | null {
  const trimmed = localVal.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'No disponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No disponible';
  return date.toLocaleString('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function buildInitialEditForm(detail: PackageDetail): EditFormState {
  return {
    recipientName: detail.recipientName || '',
    recipientPhone: detail.recipientPhone || '',
    recipientEmail: detail.recipientEmail || '',
    recipientAddress: detail.recipientAddress || '',
    addressStreet: detail.addressStreet || '',
    addressNumber: detail.addressNumber || '',
    addressFloor: detail.addressFloor || '',
    addressCity: detail.addressCity || '',
    addressZip: detail.addressZip || '',
    addressReferences: detail.addressReferences || '',
    senderName: detail.senderName || '',
    senderAddress: detail.senderAddress || '',
    senderPhone: detail.senderPhone || '',
    lat: detail.lat !== null && detail.lat !== undefined ? String(detail.lat) : '',
    lng: detail.lng !== null && detail.lng !== undefined ? String(detail.lng) : '',
    weight: detail.weight !== null && detail.weight !== undefined ? String(detail.weight) : '',
    volume: detail.volume !== null && detail.volume !== undefined ? String(detail.volume) : '',
    estimatedDeliveryAt: toDatetimeLocalValue(detail.estimatedDeliveryAt),
    deliveryWindowStart: toDatetimeLocalValue(detail.deliveryWindowStart),
    deliveryWindowEnd: toDatetimeLocalValue(detail.deliveryWindowEnd),
  };
}

interface PackageDetailContentProps {
  packageId: string;
  token: string;
  zones: Zone[];
  onClose: () => void;
  onPackageUpdated: () => void | Promise<void>;
  onCopyTrackingLink: (trackingCode: string) => Promise<boolean>;
}

function PackageDetailContent({
  packageId,
  token,
  zones,
  onClose,
  onPackageUpdated,
  onCopyTrackingLink,
}: PackageDetailContentProps) {
  const editFieldPrefix = useId();
  const [detail, setDetail] = useState<PackageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [activeTab, setActiveTab] = useState<DrawerTab>('operations');

  // Operations state
  const [statusInput, setStatusInput] = useState<PackageStatus>('pending');
  const [statusNote, setStatusNote] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState('');

  const [zoneInput, setZoneInput] = useState('');
  const [zoneSaving, setZoneSaving] = useState(false);
  const [zoneError, setZoneError] = useState('');

  const [unarchiving, setUnarchiving] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState<EditFormState>(EMPTY_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // POD preview state
  const [sigLightBg, setSigLightBg] = useState(false);
  const [sigImgFailed, setSigImgFailed] = useState(false);
  const [photoImgFailed, setPhotoImgFailed] = useState(false);

  // Copy feedback
  const [copiedRecently, setCopiedRecently] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);

  const syncStateFromDetail = useCallback((loaded: PackageDetail) => {
    setDetail(loaded);
    setStatusInput(loaded.status);
    setStatusNote('');
    setStatusError('');
    setZoneInput(loaded.zoneId ?? '');
    setZoneError('');
    setEditForm(buildInitialEditForm(loaded));
    setEditError('');
    setSigImgFailed(false);
    setPhotoImgFailed(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const reqId = ++requestIdRef.current;

    packageService
      .getPackageById(token, packageId, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted || reqId !== requestIdRef.current) return;
        syncStateFromDetail(loaded);
        setError('');
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (
          controller.signal.aborted ||
          reqId !== requestIdRef.current ||
          (err instanceof Error && err.name === 'AbortError')
        ) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Error al cargar el detalle del paquete.');
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [token, packageId, refreshTick, syncStateFromDetail]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const triggerReload = () => {
    setError('');
    setLoading(true);
    setRefreshTick((prev) => prev + 1);
  };

  const handleCopyLink = async () => {
    if (!detail) return;
    const copied = await onCopyTrackingLink(detail.trackingCode);
    if (copied) {
      setCopiedRecently(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedRecently(false);
      }, 2000);
    }
  };

  const isFinalized =
    detail?.status === 'delivered' || detail?.status === 'cancelled';

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || statusSaving) return;

    setStatusError('');
    setStatusSaving(true);

    try {
      const trimmedNote = statusNote.trim();
      const noteOptions = trimmedNote
        ? statusInput === 'cancelled'
          ? { reason: trimmedNote }
          : { notes: trimmedNote }
        : undefined;

      await packageService.updateStatus(
        token,
        detail.id,
        statusInput,
        undefined,
        undefined,
        undefined,
        undefined,
        noteOptions
      );

      toast.success(
        `Estado actualizado a "${getPackageStatusToken(statusInput).label}"`
      );
      triggerReload();
      await onPackageUpdated();
    } catch (err: unknown) {
      const message =
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'No se pudo cambiar el estado del paquete.';
      setStatusError(message);
      toast.error(message);
    } finally {
      setStatusSaving(false);
    }
  };

  const handleZoneReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || zoneSaving) return;

    const nextZoneId = zoneInput || null;
    if (nextZoneId === (detail.zoneId ?? null)) {
      toast.info('El paquete ya pertenece a esa zona.');
      return;
    }

    setZoneError('');
    setZoneSaving(true);

    try {
      const updated = await packageService.updatePackage(token, detail.id, {
        zoneId: nextZoneId,
      });
      syncStateFromDetail(updated);
      toast.success('Zona reasignada correctamente.');
      triggerReload();
      await onPackageUpdated();
    } catch (err: unknown) {
      const message =
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'No se pudo reasignar la zona.';
      setZoneError(message);
      toast.error(message);
    } finally {
      setZoneSaving(false);
    }
  };

  const handleUnarchive = async () => {
    if (!detail || unarchiving) return;
    setUnarchiving(true);
    try {
      await packageService.unarchivePackages(token, [detail.id]);
      toast.success(`Paquete ${detail.trackingCode} restaurado a Activos`);
      triggerReload();
      await onPackageUpdated();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : 'No se pudo desarchivar el paquete.'
      );
    } finally {
      setUnarchiving(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || editSaving) return;

    setEditError('');

    const trimmedName = editForm.recipientName.trim();
    const trimmedAddress = editForm.recipientAddress.trim();
    const trimmedPhone = editForm.recipientPhone.trim();
    const trimmedEmail = editForm.recipientEmail.trim();

    if (trimmedName.length < 2) {
      setEditError('El nombre del destinatario debe tener al menos 2 caracteres.');
      return;
    }
    if (trimmedAddress.length < 5) {
      setEditError('La dirección de entrega debe tener al menos 5 caracteres.');
      return;
    }
    if (trimmedPhone.length < 3) {
      setEditError('El teléfono del destinatario debe tener al menos 3 caracteres.');
      return;
    }
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEditError('Ingresa un correo electrónico válido.');
      return;
    }

    const parseOptionalNum = (
      raw: string,
      label: string,
      min: number,
      max?: number
    ): number | null | 'invalid' => {
      const clean = raw.trim();
      if (!clean) return null;
      const num = Number(clean);
      if (!Number.isFinite(num) || num < min || (max !== undefined && num > max)) {
        setEditError(
          max !== undefined
            ? `${label} debe ser un número entre ${min} y ${max}.`
            : `${label} debe ser un número mayor o igual a ${min}.`
        );
        return 'invalid';
      }
      return num;
    };

    const latVal = parseOptionalNum(editForm.lat, 'Latitud', -90, 90);
    if (latVal === 'invalid') return;
    const lngVal = parseOptionalNum(editForm.lng, 'Longitud', -180, 180);
    if (lngVal === 'invalid') return;
    const weightVal = parseOptionalNum(editForm.weight, 'Peso', 0);
    if (weightVal === 'invalid') return;
    const volumeVal = parseOptionalNum(editForm.volume, 'Volumen', 0);
    if (volumeVal === 'invalid') return;

    const windowStartIso = fromDatetimeLocalValue(editForm.deliveryWindowStart);
    const windowEndIso = fromDatetimeLocalValue(editForm.deliveryWindowEnd);
    const estimatedIso = fromDatetimeLocalValue(editForm.estimatedDeliveryAt);

    if (
      windowStartIso &&
      windowEndIso &&
      new Date(windowStartIso) > new Date(windowEndIso)
    ) {
      setEditError('El inicio de la ventana horaria debe ser anterior o igual al fin.');
      return;
    }

    const original = buildInitialEditForm(detail);
    const payload: UpdatePackageInput = {};

    const normOptStr = (val: string) => {
      const t = val.trim();
      return t.length > 0 ? t : null;
    };

    if (trimmedName !== original.recipientName.trim()) {
      payload.recipientName = trimmedName;
    }
    if (trimmedAddress !== original.recipientAddress.trim()) {
      payload.recipientAddress = trimmedAddress;
    }
    if (trimmedPhone !== original.recipientPhone.trim()) {
      payload.recipientPhone = trimmedPhone;
    }
    if (normOptStr(editForm.recipientEmail) !== normOptStr(original.recipientEmail)) {
      payload.recipientEmail = normOptStr(editForm.recipientEmail);
    }
    if (normOptStr(editForm.addressStreet) !== normOptStr(original.addressStreet)) {
      payload.addressStreet = normOptStr(editForm.addressStreet);
    }
    if (normOptStr(editForm.addressNumber) !== normOptStr(original.addressNumber)) {
      payload.addressNumber = normOptStr(editForm.addressNumber);
    }
    if (normOptStr(editForm.addressFloor) !== normOptStr(original.addressFloor)) {
      payload.addressFloor = normOptStr(editForm.addressFloor);
    }
    if (normOptStr(editForm.addressCity) !== normOptStr(original.addressCity)) {
      payload.addressCity = normOptStr(editForm.addressCity);
    }
    if (normOptStr(editForm.addressZip) !== normOptStr(original.addressZip)) {
      payload.addressZip = normOptStr(editForm.addressZip);
    }
    if (normOptStr(editForm.addressReferences) !== normOptStr(original.addressReferences)) {
      payload.addressReferences = normOptStr(editForm.addressReferences);
    }
    if (normOptStr(editForm.senderName) !== normOptStr(original.senderName)) {
      payload.senderName = normOptStr(editForm.senderName);
    }
    if (normOptStr(editForm.senderAddress) !== normOptStr(original.senderAddress)) {
      payload.senderAddress = normOptStr(editForm.senderAddress);
    }
    if (normOptStr(editForm.senderPhone) !== normOptStr(original.senderPhone)) {
      payload.senderPhone = normOptStr(editForm.senderPhone);
    }
    if (latVal !== (detail.lat ?? null)) {
      payload.lat = latVal;
    }
    if (lngVal !== (detail.lng ?? null)) {
      payload.lng = lngVal;
    }
    if (weightVal !== (detail.weight ?? null)) {
      payload.weight = weightVal;
    }
    if (volumeVal !== (detail.volume ?? null)) {
      payload.volume = volumeVal;
    }
    if (editForm.estimatedDeliveryAt !== original.estimatedDeliveryAt) {
      payload.estimatedDeliveryAt = estimatedIso;
    }
    if (editForm.deliveryWindowStart !== original.deliveryWindowStart) {
      payload.deliveryWindowStart = windowStartIso;
    }
    if (editForm.deliveryWindowEnd !== original.deliveryWindowEnd) {
      payload.deliveryWindowEnd = windowEndIso;
    }

    if (Object.keys(payload).length === 0) {
      toast.info('No hay cambios pendientes para guardar.');
      return;
    }

    setEditSaving(true);
    try {
      const updated = await packageService.updatePackage(token, detail.id, payload);
      syncStateFromDetail(updated);
      toast.success('Datos del paquete actualizados');
      triggerReload();
      await onPackageUpdated();
    } catch (err: unknown) {
      const message =
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'No se pudieron guardar los cambios.';
      setEditError(message);
      toast.error(message);
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <Drawer
      isOpen={true}
      onClose={onClose}
      side="right"
      size="xl"
      title={detail ? detail.trackingCode : 'Detalle de Paquete'}
      subtitle={
        detail
          ? `Creado el ${formatDateTime(detail.createdAt)}`
          : 'Historial, evidencias POD y gestión operativa'
      }
      icon={<PackageIcon className="h-4 w-4" />}
      footer={
        detail && (
          <div className="w-full flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyLink}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700/80 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition-colors"
              >
                {copiedRecently ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Enlace copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-brand-400" />
                    <span>Copiar enlace de tracking</span>
                  </>
                )}
              </button>
              <a
                href={buildTrackingUrl(detail.trackingCode)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-800/80 bg-slate-950 hover:bg-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                <span>Tracking público</span>
              </a>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-700/80 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
            >
              Cerrar
            </button>
          </div>
        )
      }
    >
      {loading ? (
        <div role="status" aria-label="Cargando detalle del paquete" className="space-y-4">
          <span className="sr-only">Cargando detalle del paquete...</span>
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-44" />
          </div>
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-500/25 bg-red-500/10 p-6 text-center space-y-3"
        >
          <AlertCircle className="h-8 w-8 text-red-400 mx-auto" />
          <p className="text-sm text-red-200">{error}</p>
          <button
            type="button"
            onClick={triggerReload}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-700/80 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reintentar
          </button>
        </div>
      ) : detail ? (
        <div className="space-y-5">
          {/* Summary Header Card */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={detail.status} size="md" />
                {detail.isArchived && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                    Archivado
                  </span>
                )}
              </div>

              {detail.isArchived && (
                <button
                  type="button"
                  onClick={handleUnarchive}
                  disabled={unarchiving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors disabled:opacity-50"
                >
                  {unarchiving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArchiveRestore className="h-3.5 w-3.5" />
                  )}
                  <span>Restaurar a Activos</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
              <div className="space-y-1">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-brand-400" />
                  Destinatario
                </span>
                <p className="text-sm font-medium text-white">{detail.recipientName}</p>
                <p className="text-slate-300 tabular-nums flex items-center gap-1">
                  <Phone className="h-3 w-3 text-slate-400" />
                  {detail.recipientPhone}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-brand-400" />
                  Entrega & Zona
                </span>
                <p className="text-sm font-medium text-white">{detail.recipientAddress}</p>
                <p className="text-slate-300 flex flex-wrap items-center gap-2">
                  <span>Zona: {detail.zone?.name || 'Sin asignar'}</span>
                  {detail.driver && (
                    <span className="inline-flex items-center gap-1 text-brand-300">
                      <Truck className="h-3 w-3" />
                      {detail.driver.name}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {(detail.deliveryWindowStart ||
              detail.deliveryWindowEnd ||
              (detail.lat !== null && detail.lat !== undefined) ||
              (detail.weight !== null && detail.weight !== undefined) ||
              (detail.volume !== null && detail.volume !== undefined)) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 tabular-nums">
                {(detail.deliveryWindowStart || detail.deliveryWindowEnd) && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3 text-slate-400" />
                    Ventana:{' '}
                    {detail.deliveryWindowStart
                      ? formatDateTime(detail.deliveryWindowStart)
                      : '—'}{' '}
                    →{' '}
                    {detail.deliveryWindowEnd
                      ? formatDateTime(detail.deliveryWindowEnd)
                      : '—'}
                  </span>
                )}
                {detail.lat !== null &&
                  detail.lat !== undefined &&
                  detail.lng !== null &&
                  detail.lng !== undefined && (
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Navigation className="h-3 w-3 text-slate-400" />
                      {detail.lat.toFixed(5)}, {detail.lng.toFixed(5)}
                    </span>
                  )}
                {detail.weight !== null && detail.weight !== undefined && (
                  <span>Peso: {detail.weight} kg</span>
                )}
                {detail.volume !== null && detail.volume !== undefined && (
                  <span>Volumen: {detail.volume} m³</span>
                )}
              </div>
            )}
          </div>

          {/* Segmented Navigation Tabs */}
          <div
            role="tablist"
            aria-label="Secciones del paquete"
            className="grid grid-cols-2 rounded-xl border border-slate-800/80 bg-slate-950 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'operations'}
              onClick={() => setActiveTab('operations')}
              className={clsx(
                'min-h-[38px] inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                activeTab === 'operations'
                  ? 'bg-brand-500/15 text-brand-300 border border-brand-500/30'
                  : 'text-slate-400 hover:text-white border border-transparent'
              )}
            >
              <History className="h-3.5 w-3.5" />
              <span>Operación, POD e Historial</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'edit'}
              onClick={() => setActiveTab('edit')}
              className={clsx(
                'min-h-[38px] inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                activeTab === 'edit'
                  ? 'bg-brand-500/15 text-brand-300 border border-brand-500/30'
                  : 'text-slate-400 hover:text-white border border-transparent'
              )}
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>Editar Datos</span>
            </button>
          </div>

          {activeTab === 'operations' ? (
            <div className="space-y-5">
              {/* Manual Status Change + Reason/Notes */}
              <form
                onSubmit={handleStatusUpdate}
                className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 space-y-3"
              >
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Cambio Manual de Estado y Motivo
                </h3>

                {statusError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 flex items-center gap-2"
                  >
                    <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                    <span>{statusError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label
                      htmlFor="drawer-status-select"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Nuevo estado
                    </label>
                    <select
                      id="drawer-status-select"
                      value={statusInput}
                      onChange={(e) => setStatusInput(e.target.value as PackageStatus)}
                      className="w-full min-h-[40px] rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white focus:border-brand-500 focus:outline-none"
                    >
                      {PACKAGE_STATUS_ORDER.map((st) => (
                        <option key={st} value={st}>
                          {getPackageStatusToken(st).label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1 flex flex-col justify-end">
                    <button
                      type="submit"
                      disabled={statusSaving}
                      className="min-h-[40px] inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-500 px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50"
                    >
                      {statusSaving ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Actualizando...</span>
                        </>
                      ) : (
                        <span>Aplicar estado</span>
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="drawer-status-note"
                    className="block text-xs font-medium text-slate-300"
                  >
                    {statusInput === 'cancelled'
                      ? 'Motivo de cancelación / incidencia'
                      : 'Notas o motivo de cambio (opcional)'}
                  </label>
                  <textarea
                    id="drawer-status-note"
                    rows={2}
                    maxLength={1000}
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    placeholder="Ej. Reprogramado a pedido del cliente, domicilio sin acceso, actualización operativa..."
                    className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </form>

              {/* Zone Reassignment */}
              <form
                onSubmit={handleZoneReassign}
                className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Reasignación de Zona
                  </h3>
                  {isFinalized && (
                    <span className="text-[11px] text-amber-300 flex items-center gap-1">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Bloqueado en estado finalizado
                    </span>
                  )}
                </div>

                {zoneError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 flex items-center gap-2"
                  >
                    <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                    <span>{zoneError}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <select
                    aria-label="Seleccionar zona para el paquete"
                    value={zoneInput}
                    onChange={(e) => setZoneInput(e.target.value)}
                    disabled={isFinalized || zoneSaving}
                    className="flex-1 min-h-[40px] rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white focus:border-brand-500 focus:outline-none disabled:opacity-50"
                  >
                    <option value="">Sin zona asignada</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} {z.isActive ? '· Activa' : '· Inactiva'}
                        {z.driver?.name ? ` (${z.driver.name})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={isFinalized || zoneSaving}
                    className="min-h-[40px] inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700/80 bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {zoneSaving ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Guardando...</span>
                      </>
                    ) : (
                      <span>Reasignar zona</span>
                    )}
                  </button>
                </div>
              </form>

              {/* Proof of Delivery (Signature & Photo) */}
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Evidencias de Entrega (POD)
                </h3>

                {!detail.signatureUrl && !detail.photoUrl ? (
                  <p className="text-xs text-slate-400 py-2">
                    Sin firma ni fotografía de entrega registradas para este envío.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Signature */}
                    <div className="rounded-xl border border-slate-800/80 bg-slate-900/70 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                          <PenLine className="h-3.5 w-3.5 text-brand-400" />
                          Firma del receptor
                        </span>
                        {detail.signatureUrl && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSigLightBg((prev) => !prev)}
                              className="text-[11px] text-slate-400 hover:text-white underline underline-offset-2"
                            >
                              {sigLightBg ? 'Fondo oscuro' : 'Fondo claro'}
                            </button>
                            <a
                              href={detail.signatureUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-brand-300 hover:text-brand-200 inline-flex items-center gap-1"
                            >
                              Abrir
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                      </div>

                      {detail.signatureUrl ? (
                        sigImgFailed ? (
                          <div className="h-32 rounded-lg border border-slate-800 bg-slate-950 flex flex-col items-center justify-center gap-1 text-xs text-slate-400">
                            <ImageOff className="h-5 w-5 text-slate-500" />
                            <span>No se pudo cargar la firma</span>
                          </div>
                        ) : (
                          <div
                            className={clsx(
                              'h-32 rounded-lg border border-slate-800 flex items-center justify-center p-2 overflow-hidden transition-colors',
                              sigLightBg ? 'bg-slate-100' : 'bg-slate-950'
                            )}
                          >
                            <img
                              src={detail.signatureUrl}
                              alt={`Firma POD ${detail.trackingCode}`}
                              onError={() => setSigImgFailed(true)}
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>
                        )
                      ) : (
                        <div className="h-32 rounded-lg border border-dashed border-slate-800 bg-slate-950/60 flex items-center justify-center text-xs text-slate-400">
                          Sin firma adjunta
                        </div>
                      )}
                    </div>

                    {/* Delivery Photo */}
                    <div className="rounded-xl border border-slate-800/80 bg-slate-900/70 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                          <Camera className="h-3.5 w-3.5 text-brand-400" />
                          Foto de entrega
                        </span>
                        {detail.photoUrl && (
                          <a
                            href={detail.photoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-brand-300 hover:text-brand-200 inline-flex items-center gap-1"
                          >
                            Ampliar
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>

                      {detail.photoUrl ? (
                        photoImgFailed ? (
                          <div className="h-32 rounded-lg border border-slate-800 bg-slate-950 flex flex-col items-center justify-center gap-1 text-xs text-slate-400">
                            <ImageOff className="h-5 w-5 text-slate-500" />
                            <span>No se pudo cargar la foto</span>
                          </div>
                        ) : (
                          <a
                            href={detail.photoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block h-32 rounded-lg border border-slate-800 bg-slate-950 overflow-hidden hover:border-brand-500/40 transition-colors"
                          >
                            <img
                              src={detail.photoUrl}
                              alt={`Foto POD ${detail.trackingCode}`}
                              onError={() => setPhotoImgFailed(true)}
                              className="h-full w-full object-cover"
                            />
                          </a>
                        )
                      ) : (
                        <div className="h-32 rounded-lg border border-dashed border-slate-800 bg-slate-950/60 flex items-center justify-center text-xs text-slate-400">
                          Sin foto adjunta
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Chronological History */}
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Historial Cronológico
                  </h3>
                  <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {detail.history.length}{' '}
                    {detail.history.length === 1 ? 'evento' : 'eventos'}
                  </span>
                </div>

                {detail.history.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">
                    Aún no hay eventos registrados en el historial.
                  </p>
                ) : (
                  <ol className="relative space-y-3 pl-5 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-slate-800">
                    {detail.history.map((entry, idx) => {
                      const isLatest = idx === detail.history.length - 1;
                      const tokenInfo = getPackageStatusToken(entry.status);
                      return (
                        <li key={entry.id} className="relative">
                          <span
                            aria-hidden="true"
                            className={clsx(
                              'absolute -left-[18px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-slate-950',
                              isLatest ? tokenInfo.dotClass : 'bg-slate-600'
                            )}
                          />
                          <div className="rounded-lg border border-slate-800/80 bg-slate-900/70 p-2.5 space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <StatusBadge status={entry.status} size="sm" />
                              <span className="text-[11px] text-slate-400 tabular-nums">
                                {formatDateTime(entry.createdAt)}
                              </span>
                            </div>
                            {entry.notes && (
                              <p className="text-xs text-slate-200 leading-relaxed">
                                {entry.notes}
                              </p>
                            )}
                            {entry.user?.username && (
                              <p className="text-[11px] text-slate-400">
                                Por:{' '}
                                <span className="font-mono text-slate-300">
                                  @{entry.user.username}
                                </span>
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              {isFinalized && (
                <div
                  role="status"
                  className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 flex items-start gap-2"
                >
                  <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Este paquete está en estado finalizado (
                    {getPackageStatusToken(detail.status).label}). El servidor no permite editar
                    sus datos en este estado.
                  </span>
                </div>
              )}

              {editError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200 flex items-center gap-2"
                >
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <fieldset
                disabled={isFinalized || editSaving}
                className="space-y-4 disabled:opacity-60"
              >
                {/* Recipient Section */}
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Destinatario
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label
                        htmlFor={`${editFieldPrefix}-recipientName`}
                        className="block text-xs font-medium text-slate-300"
                      >
                        Nombre completo *
                      </label>
                      <input
                        id={`${editFieldPrefix}-recipientName`}
                        type="text"
                        required
                        minLength={2}
                        value={editForm.recipientName}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, recipientName: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor={`${editFieldPrefix}-recipientPhone`}
                        className="block text-xs font-medium text-slate-300"
                      >
                        Teléfono *
                      </label>
                      <input
                        id={`${editFieldPrefix}-recipientPhone`}
                        type="text"
                        required
                        minLength={3}
                        value={editForm.recipientPhone}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, recipientPhone: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white tabular-nums focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label
                        htmlFor={`${editFieldPrefix}-recipientEmail`}
                        className="block text-xs font-medium text-slate-300"
                      >
                        Email (opcional)
                      </label>
                      <input
                        id={`${editFieldPrefix}-recipientEmail`}
                        type="email"
                        value={editForm.recipientEmail}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, recipientEmail: e.target.value }))
                        }
                        placeholder="cliente@empresa.com"
                        className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Address & Coordinates Section */}
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Dirección y Coordenadas
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <label
                        htmlFor={`${editFieldPrefix}-recipientAddress`}
                        className="block text-xs font-medium text-slate-300"
                      >
                        Dirección completa *
                      </label>
                      <input
                        id={`${editFieldPrefix}-recipientAddress`}
                        type="text"
                        required
                        minLength={5}
                        value={editForm.recipientAddress}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, recipientAddress: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor={`${editFieldPrefix}-addressStreet`}
                        className="block text-xs font-medium text-slate-300"
                      >
                        Calle
                      </label>
                      <input
                        id={`${editFieldPrefix}-addressStreet`}
                        type="text"
                        value={editForm.addressStreet}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, addressStreet: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label
                          htmlFor={`${editFieldPrefix}-addressNumber`}
                          className="block text-xs font-medium text-slate-300"
                        >
                          Altura
                        </label>
                        <input
                          id={`${editFieldPrefix}-addressNumber`}
                          type="text"
                          value={editForm.addressNumber}
                          onChange={(e) =>
                            setEditForm((prev) => ({ ...prev, addressNumber: e.target.value }))
                          }
                          className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white tabular-nums focus:border-brand-500 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor={`${editFieldPrefix}-addressFloor`}
                          className="block text-xs font-medium text-slate-300"
                        >
                          Piso / Depto
                        </label>
                        <input
                          id={`${editFieldPrefix}-addressFloor`}
                          type="text"
                          value={editForm.addressFloor}
                          onChange={(e) =>
                            setEditForm((prev) => ({ ...prev, addressFloor: e.target.value }))
                          }
                          placeholder="Ej. 3B"
                          className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor={`${editFieldPrefix}-addressCity`}
                        className="block text-xs font-medium text-slate-300"
                      >
                        Ciudad / Localidad
                      </label>
                      <input
                        id={`${editFieldPrefix}-addressCity`}
                        type="text"
                        value={editForm.addressCity}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, addressCity: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor={`${editFieldPrefix}-addressZip`}
                        className="block text-xs font-medium text-slate-300"
                      >
                        Código Postal (CP)
                      </label>
                      <input
                        id={`${editFieldPrefix}-addressZip`}
                        type="text"
                        value={editForm.addressZip}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, addressZip: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white tabular-nums focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label
                        htmlFor={`${editFieldPrefix}-addressReferences`}
                        className="block text-xs font-medium text-slate-300"
                      >
                        Referencias de entrega
                      </label>
                      <input
                        id={`${editFieldPrefix}-addressReferences`}
                        type="text"
                        value={editForm.addressReferences}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            addressReferences: e.target.value,
                          }))
                        }
                        placeholder="Portón negro, horario de recepción..."
                        className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor={`${editFieldPrefix}-lat`}
                        className="block text-xs font-medium text-slate-300"
                      >
                        Latitud (-90 a 90)
                      </label>
                      <input
                        id={`${editFieldPrefix}-lat`}
                        type="number"
                        step="any"
                        value={editForm.lat}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, lat: e.target.value }))}
                        placeholder="-31.4201"
                        className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs font-mono text-white tabular-nums placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor={`${editFieldPrefix}-lng`}
                        className="block text-xs font-medium text-slate-300"
                      >
                        Longitud (-180 a 180)
                      </label>
                      <input
                        id={`${editFieldPrefix}-lng`}
                        type="number"
                        step="any"
                        value={editForm.lng}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, lng: e.target.value }))}
                        placeholder="-64.1888"
                        className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs font-mono text-white tabular-nums placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Delivery Window & Dimensions */}
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Ventana Horaria y Dimensiones
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label
                        htmlFor={`${editFieldPrefix}-deliveryWindowStart`}
                        className="block text-xs font-medium text-slate-300"
                      >
                        Ventana inicio
                      </label>
                      <input
                        id={`${editFieldPrefix}-deliveryWindowStart`}
                        type="datetime-local"
                        value={editForm.deliveryWindowStart}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            deliveryWindowStart: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white tabular-nums focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor={`${editFieldPrefix}-deliveryWindowEnd`}
                        className="block text-xs font-medium text-slate-300"
                      >
                        Ventana fin
                      </label>
                      <input
                        id={`${editFieldPrefix}-deliveryWindowEnd`}
                        type="datetime-local"
                        value={editForm.deliveryWindowEnd}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            deliveryWindowEnd: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white tabular-nums focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label
                        htmlFor={`${editFieldPrefix}-estimatedDeliveryAt`}
                        className="block text-xs font-medium text-slate-300"
                      >
                        Entrega estimada
                      </label>
                      <input
                        id={`${editFieldPrefix}-estimatedDeliveryAt`}
                        type="datetime-local"
                        value={editForm.estimatedDeliveryAt}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            estimatedDeliveryAt: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white tabular-nums focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor={`${editFieldPrefix}-weight`}
                        className="block text-xs font-medium text-slate-300"
                      >
                        Peso (kg)
                      </label>
                      <input
                        id={`${editFieldPrefix}-weight`}
                        type="number"
                        min={0}
                        step="any"
                        value={editForm.weight}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, weight: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white tabular-nums focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor={`${editFieldPrefix}-volume`}
                        className="block text-xs font-medium text-slate-300"
                      >
                        Volumen (m³)
                      </label>
                      <input
                        id={`${editFieldPrefix}-volume`}
                        type="number"
                        min={0}
                        step="any"
                        value={editForm.volume}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, volume: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white tabular-nums focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Sender Optional */}
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Remitente (Opcional)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label
                        htmlFor={`${editFieldPrefix}-senderName`}
                        className="block text-xs font-medium text-slate-300"
                      >
                        Nombre
                      </label>
                      <input
                        id={`${editFieldPrefix}-senderName`}
                        type="text"
                        value={editForm.senderName}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, senderName: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor={`${editFieldPrefix}-senderPhone`}
                        className="block text-xs font-medium text-slate-300"
                      >
                        Teléfono
                      </label>
                      <input
                        id={`${editFieldPrefix}-senderPhone`}
                        type="text"
                        value={editForm.senderPhone}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, senderPhone: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white tabular-nums focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label
                        htmlFor={`${editFieldPrefix}-senderAddress`}
                        className="block text-xs font-medium text-slate-300"
                      >
                        Dirección
                      </label>
                      <input
                        id={`${editFieldPrefix}-senderAddress`}
                        type="text"
                        value={editForm.senderAddress}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, senderAddress: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-3 py-2 text-xs text-white focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isFinalized || editSaving}
                    className="min-h-[42px] inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-500 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-brand-950/30 transition-colors disabled:opacity-50"
                  >
                    {editSaving ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Guardando cambios...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-3.5 w-3.5" />
                        <span>Guardar Cambios</span>
                      </>
                    )}
                  </button>
                </div>
              </fieldset>
            </form>
          )}
        </div>
      ) : null}
    </Drawer>
  );
}

export function PackagesPageDrawerHost({
  isOpen,
  packageId,
  onClose,
  token,
  zones,
  onPackageUpdated,
  onCopyTrackingLink,
}: PackageDetailDrawerProps) {
  if (!isOpen || !packageId || !token) return null;

  return (
    <PackageDetailContent
      key={packageId}
      packageId={packageId}
      token={token}
      zones={zones}
      onClose={onClose}
      onPackageUpdated={onPackageUpdated}
      onCopyTrackingLink={onCopyTrackingLink}
    />
  );
}

export { PackagesPageDrawerHost as PackageDetailDrawer };
