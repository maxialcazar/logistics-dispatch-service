import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { packageService, type Package } from '../services/packageService';
import { MapPin, Truck, Check, X, Navigation, Phone, Route, Camera, PenLine, Trash2, ShieldCheck, WifiOff, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { useDriverLocation } from '../hooks/useDriverLocation';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { enqueueStatusUpdate } from '../services/offlineQueue';
import { Skeleton } from '../components/Skeleton';
import { StatusBadge } from '../components/StatusBadge';
import { getPackageStatusToken } from '../utils/packageStatus';

// ---------- Canvas Signature Pad Hook ----------
function useSignaturePad(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const isDrawing = useRef(false);

  const getPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const source = 'touches' in e ? e.touches[0] : e;
    return {
      x: (source.clientX - rect.left) * (canvas.width / rect.width),
      y: (source.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    isDrawing.current = true;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e.nativeEvent as MouseEvent | TouchEvent, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, [canvasRef]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e.nativeEvent as MouseEvent | TouchEvent, canvas);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#e2e8f0'; // slate-200
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }, [canvasRef]);

  const endDraw = useCallback(() => {
    isDrawing.current = false;
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, [canvasRef]);

  const isEmpty = useCallback((): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const ctx = canvas.getContext('2d')!;
    const pixelBuffer = new Uint32Array(
      ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer
    );
    return !pixelBuffer.some(color => color !== 0);
  }, [canvasRef]);

  const getDataUrl = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.toDataURL('image/png');
  }, [canvasRef]);

  return { startDraw, draw, endDraw, clearCanvas, isEmpty, getDataUrl };
}

// ---------- POD Modal Component ----------
interface PODModalProps {
  pkg: Package;
  onConfirm: (pkg: Package, signature: string | null, photo: string | null) => void;
  onClose: () => void;
}

function PODModal({ pkg, onConfirm, onClose }: PODModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { startDraw, draw, endDraw, clearCanvas, isEmpty, getDataUrl } = useSignaturePad(canvasRef);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setPhotoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleConfirm = () => {
    const sig = isEmpty() ? null : getDataUrl();
    setSubmitting(true);
    onConfirm(pkg, sig, photoDataUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Sheet */}
      <div className="relative w-full sm:max-w-md bg-slate-900 border border-slate-800/80 rounded-t-3xl sm:rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-700" />
        </div>

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Confirmar Entrega</h3>
              <p className="text-xs text-slate-400 font-mono tabular-nums">#{pkg.trackingCode}</p>
            </div>
          </div>
          <button onClick={onClose} className="min-h-[48px] min-w-[48px] p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors flex items-center justify-center">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5 overflow-y-auto max-h-[80vh]">
          {/* Recipient info */}
          <div className="bg-slate-950/60 rounded-xl p-3 flex items-start gap-3 border border-slate-800/80">
            <MapPin className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-white text-sm font-semibold">{pkg.recipientName}</p>
              <p className="text-slate-400 text-xs leading-tight mt-0.5">{pkg.recipientAddress}</p>
            </div>
          </div>

          {/* Signature Pad */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <PenLine size={12} />
                Firma del Receptor
              </label>
              <button
                onClick={clearCanvas}
                className="min-h-[48px] px-2 flex items-center gap-1 text-xs text-slate-400 hover:text-red-400 transition-colors"
              >
                <Trash2 size={11} />
                Borrar
              </button>
            </div>
            <div className="relative rounded-xl overflow-hidden border-2 border-dashed border-slate-700 bg-slate-950 hover:border-slate-600 transition-colors">
              <canvas
                ref={canvasRef}
                width={380}
                height={140}
                className="w-full touch-none cursor-crosshair block"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
              />
              <p className="absolute inset-0 flex items-center justify-center text-slate-600 text-xs pointer-events-none select-none font-medium">
                Firmar aquí
              </p>
            </div>
          </div>

          {/* Photo Evidence */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Camera size={12} />
              Foto de Evidencia (Opcional)
            </label>

            {photoDataUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-700">
                <img
                  src={photoDataUrl}
                  alt="Evidencia de entrega"
                  className="w-full max-h-44 object-cover"
                />
                <button
                  onClick={() => setPhotoDataUrl(null)}
                  className="min-h-[48px] min-w-[48px] absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-red-600 transition-colors flex items-center justify-center"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full min-h-[48px] h-24 rounded-xl border-2 border-dashed border-slate-700 bg-slate-950 hover:border-brand-500/50 hover:bg-slate-900 transition-all flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-brand-400"
              >
                <Camera size={24} />
                <span className="text-xs font-medium">Tomar foto del paquete</span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoCapture}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-5 py-4 border-t border-slate-800/80 grid grid-cols-2 gap-3">
          <button
            onClick={onClose}
            className="min-h-[48px] py-3 rounded-xl border border-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800 font-medium transition-all text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className={clsx(
              "min-h-[48px] py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all",
              submitting
                ? "bg-emerald-700/50 text-emerald-300 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/30 active:scale-95"
            )}
          >
            <Check size={16} />
            {submitting ? 'Enviando...' : 'Confirmar Entrega'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Main DriverDashboard ----------
export function DriverDashboard() {
  const { token } = useAuth();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [podPackage, setPodPackage] = useState<Package | null>(null);

  // Enable Real-Time GPS Tracking
  const { getCurrentLocation } = useDriverLocation();

  const fetchSeqRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchMyPackages = useCallback(async (options?: { silent?: boolean }) => {
    if (!token) return;
    const silent = options?.silent ?? false;
    const seq = ++fetchSeqRef.current;
    if (!silent) {
      setLoading(true);
    }
    try {
      const data = await packageService.getMyPackages(token);
      if (!isMountedRef.current || seq !== fetchSeqRef.current) return;
      // Filter out completed packages from the active list
      const active = data.filter(p => !['delivered', 'cancelled'].includes(p.status));
      setPackages(active);
    } catch (err) {
      if (!isMountedRef.current || seq !== fetchSeqRef.current) return;
      console.error(err);
      if (!silent) {
        toast.error('Error al cargar paquetes');
      }
    } finally {
      if (isMountedRef.current && seq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, [token]);

  const handleSyncComplete = useCallback(() => {
    return fetchMyPackages({ silent: true });
  }, [fetchMyPackages]);

  // Offline sync — drains IndexedDB queue when connectivity is restored
  const { isOnline, pendingCount, isSyncing, syncNow, refreshPendingCount } = useOfflineSync({
    token,
    onSyncComplete: handleSyncComplete,
  });

  useEffect(() => {
    fetchMyPackages();
  }, [fetchMyPackages]);

  // Generic status update (for non-delivery transitions)
  const handleStatusUpdate = async (pkg: Package, newStatus: string) => {
    if (!token) return;
    setUpdating(pkg.id);

    // OFFLINE PATH — queue for later sync
    if (!isOnline) {
      try {
        await enqueueStatusUpdate({
          packageId: pkg.id,
          trackingCode: pkg.trackingCode,
          status: newStatus,
        });
        const updatedCount = (await refreshPendingCount()) ?? pendingCount + 1;
        toast.warning('Sin conexión — actualización guardada localmente', {
          description: `Se enviará cuando vuelva la red (${updatedCount} pendiente/s)`,
          duration: 5000,
        });
        // Optimistically update local list so the driver sees the change
        setPackages(prev => prev.map(p =>
          p.id === pkg.id ? { ...p, status: newStatus as Package['status'] } : p
        ));
      } catch (err) {
        console.error('Error al guardar actualización offline:', err);
        toast.error('No se pudo guardar la actualización offline');
      } finally {
        setUpdating(null);
      }
      return;
    }

    // ONLINE PATH
    const loadingToast = toast.loading('Actualizando estado...');
    try {
      await packageService.updateStatus(token, pkg.id, newStatus);
      toast.success(
        newStatus === 'in_transit' ? 'Viaje iniciado' : `Estado: ${getPackageStatusToken(newStatus).label}`,
        { id: loadingToast }
      );
      fetchMyPackages();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar';
      toast.error(msg, { id: loadingToast });
    } finally {
      setUpdating(null);
    }
  };

  // POD delivery with signature and photo
  const handleDeliveryConfirm = async (pkg: Package, signature: string | null, photo: string | null) => {
    if (!token) return;
    setPodPackage(null);
    setUpdating(pkg.id);

    const loadingToast = toast.loading(
      isOnline ? 'Registrando entrega...' : 'Guardando entrega localmente...'
    );

    const coords = await getCurrentLocation();
    const lat = coords?.lat;
    const lng = coords?.lng;
    const currentlyOnline =
      isOnline && (typeof navigator === 'undefined' || navigator.onLine);

    // OFFLINE PATH — queue for later sync
    if (!currentlyOnline) {
      try {
        await enqueueStatusUpdate({
          packageId: pkg.id,
          trackingCode: pkg.trackingCode,
          status: 'delivered',
          lat,
          lng,
          signature: signature ?? undefined,
          photo: photo ?? undefined,
        });
        const updatedCount = (await refreshPendingCount()) ?? pendingCount + 1;
        toast.warning('Sin conexión — entrega guardada localmente', {
          id: loadingToast,
          description: `Se sincronizará cuando vuelva la red (${updatedCount} pendiente/s)`,
          duration: 5000,
        });
        if (isMountedRef.current) {
          setPackages(prev => prev.filter(p => p.id !== pkg.id));
        }
      } catch (err) {
        console.error('Error al guardar entrega offline:', err);
        toast.error('No se pudo guardar la entrega offline', { id: loadingToast });
      } finally {
        if (isMountedRef.current) {
          setUpdating(null);
        }
      }
      return;
    }

    // ONLINE PATH
    try {
      await packageService.updateStatus(
        token,
        pkg.id,
        'delivered',
        lat,
        lng,
        signature ?? undefined,
        photo ?? undefined
      );
      toast.success('✅ Entrega confirmada con evidencia', { id: loadingToast });
      if (isMountedRef.current) {
        setPackages(prev => prev.filter(p => p.id !== pkg.id));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al confirmar entrega';
      toast.error(msg, { id: loadingToast });
    } finally {
      if (isMountedRef.current) {
        setUpdating(null);
      }
    }
  };

  const openNavigation = (pkg: Package) => {
    if (pkg.lat && pkg.lng) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${pkg.lat},${pkg.lng}`, '_blank');
    } else {
      const query = encodeURIComponent(`${pkg.recipientAddress.trim()}, Argentina`);
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${query}`, '_blank');
    }
  };

  const handleOptimizeRoute = () => {
    if (packages.length < 2) {
      toast.info('No hay suficientes paquetes para optimizar');
      return;
    }
    const toastId = toast.loading('Calculando ruta óptima...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: startLat, longitude: startLng } = pos.coords;
        const withGPS = packages.filter(p => p.lat && p.lng);
        const withoutGPS = packages.filter(p => !p.lat || !p.lng);

        let currentLat = startLat;
        let currentLng = startLng;
        const optimized: Package[] = [];
        const remaining = [...withGPS];

        while (remaining.length > 0) {
          let closestIndex = -1;
          let minDist = Infinity;
          remaining.forEach((p, idx) => {
            const d = Math.pow(p.lat! - currentLat, 2) + Math.pow(p.lng! - currentLng, 2);
            if (d < minDist) { minDist = d; closestIndex = idx; }
          });
          if (closestIndex !== -1) {
            const next = remaining[closestIndex];
            optimized.push(next);
            currentLat = next.lat!;
            currentLng = next.lng!;
            remaining.splice(closestIndex, 1);
          }
        }
        setPackages([...optimized, ...withoutGPS]);
        toast.success('Ruta optimizada por cercanía', { id: toastId });
      },
      () => toast.error('No se pudo obtener ubicación para optimizar', { id: toastId })
    );
  };

  // ---------- Render States ----------
  if (loading) {
    return (
      <div className="p-4 space-y-4 pb-24">
        <div className="flex justify-between items-center mb-2">
          <Skeleton className="h-7 w-40" />
          <div className="flex gap-2">
            <Skeleton className="h-12 w-24 rounded-lg" />
            <Skeleton className="h-12 w-24 rounded-lg" />
          </div>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 space-y-3">
            <div className="flex justify-between">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Skeleton className="col-span-2 h-12 rounded-lg" />
              <Skeleton className="col-span-2 h-12 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {/* POD Modal */}
      {podPackage && (
        <PODModal
          pkg={podPackage}
          onConfirm={handleDeliveryConfirm}
          onClose={() => setPodPackage(null)}
        />
      )}

      {/* Offline / Pending Sync Banner */}
      {(!isOnline || pendingCount > 0) && (
        <div className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-amber-400">
            <WifiOff size={15} className="flex-shrink-0" />
            <span className="text-xs font-semibold">
              {!isOnline
                ? `Sin conexión${pendingCount > 0 ? ` — ${pendingCount} entrega(s) en cola` : ''}`
                : `${pendingCount} entrega(s) pendiente(s) de sincronizar`}
            </span>
          </div>
          {pendingCount > 0 && (
            <button
              onClick={syncNow}
              disabled={!isOnline || isSyncing}
              className="min-h-[48px] px-3 flex items-center gap-1 text-xs text-amber-300 hover:text-amber-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={12} className={clsx(isSyncing && 'animate-spin')} />
              {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
            </button>
          )}
        </div>
      )}

      {packages.length === 0 ? (
        <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center h-full gap-4">
          <div className="h-20 w-20 bg-slate-900 border border-slate-800/80 rounded-full flex items-center justify-center">
            <Check className="h-10 w-10 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-white">¡Todo Listo!</h2>
          <p>No tienes paquetes pendientes asignados.</p>
          <button
            onClick={() => void fetchMyPackages()}
            className="min-h-[48px] px-4 text-brand-400 hover:text-brand-300 underline text-sm flex items-center justify-center"
          >
            Actualizar
          </button>
        </div>
      ) : (
        <div className="p-4 space-y-4 pb-24 relative">
          <h2 className="text-lg font-bold text-white mb-2 flex justify-between items-center">
            <span>Mis Entregas (<span className="tabular-nums">{packages.length}</span>)</span>
            <div className="flex gap-2">
              <button
                onClick={handleOptimizeRoute}
                className="min-h-[48px] text-xs text-slate-200 bg-slate-900 px-3 py-2 rounded-lg border border-slate-800/80 flex items-center gap-1.5 hover:border-brand-500/40 hover:text-white transition-colors"
              >
                <Route size={12} className="text-brand-400" /> Optimizar
              </button>
              <button
                onClick={() => void fetchMyPackages()}
                className="min-h-[48px] text-xs text-brand-300 bg-brand-500/10 border border-brand-500/25 px-3 py-2 rounded-lg flex items-center justify-center hover:bg-brand-500/20 transition-colors"
              >
                Refrescar
              </button>
            </div>
          </h2>

        {packages.map(pkg => {
          const statusToken = getPackageStatusToken(pkg.status);
          return (
          <div key={pkg.id} className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden shadow-sm relative">
            {/* Status color bar */}
            <div className={clsx('h-1.5 w-full', statusToken.barClass, statusToken.pulse && 'animate-pulse')} />

            <div className="p-4">
              {/* Tracking code + status badge */}
              <div className="flex justify-between items-start gap-2 mb-2">
                <span className="font-mono tabular-nums text-xs text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800/80">
                  #{pkg.trackingCode}
                </span>
                <StatusBadge status={pkg.status} />
              </div>

              <h3 className="text-lg font-bold text-white mb-1">{pkg.recipientName}</h3>

              <div className="flex items-start gap-2 text-slate-300 text-sm mb-3">
                <MapPin className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                <span className="leading-tight">{pkg.recipientAddress}</span>
              </div>

              {pkg.recipientPhone && (
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-4 tabular-nums">
                  <Phone className="h-3 w-3" />
                  <span>{pkg.recipientPhone}</span>
                </div>
              )}

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                  onClick={() => openNavigation(pkg)}
                  className="col-span-2 min-h-[48px] bg-slate-950 hover:bg-slate-800 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 border border-slate-800/80 transition-all"
                >
                  <Navigation className="h-4 w-4 text-brand-400" />
                  Navegar a Destino
                </button>

                {pkg.status !== 'in_transit' ? (
                  <button
                    onClick={() => handleStatusUpdate(pkg, 'in_transit')}
                    disabled={!!updating}
                    className="col-span-2 min-h-[48px] bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-brand-950/30 flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
                  >
                    <Truck className="h-5 w-5" />
                    Iniciar Viaje
                  </button>
                ) : (
                  <>
                    {/* Delivery button now opens the POD modal */}
                    <button
                      onClick={() => setPodPackage(pkg)}
                      disabled={!!updating}
                      className="min-h-[48px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-emerald-950/30 flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
                    >
                      <ShieldCheck className="h-5 w-5" />
                      Entregado
                    </button>
                    <button
                      onClick={() => handleStatusUpdate(pkg, 'cancelled')}
                      disabled={!!updating}
                      className="min-h-[48px] bg-red-500/10 border border-red-500/30 hover:bg-red-600 hover:text-white text-red-300 font-bold py-3 rounded-lg flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
                    >
                      <X className="h-5 w-5" />
                      Fallido
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
          );
        })}
        </div>
      )}
    </>
  );
}
