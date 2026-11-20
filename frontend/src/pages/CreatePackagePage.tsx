import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Box,
  Building2,
  CheckCircle2,
  Clock,
  Globe,
  Loader2,
  MapPin,
  Package,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import {
  packageService,
  type CreatePackageInput,
} from '../services/packageService';
import { zoneService, type Zone } from '../services/zoneService';
import { Skeleton } from '../components/Skeleton';
import {
  PackageLocationPickerMap,
  type GeocodeStatus,
} from '../components/PackageLocationPickerMap';
import { toValidNonZeroLatLng } from '../utils/mapUtils';

const GEOGRAPHY_STORAGE_KEY = 'lds:create-package:geography';
const GEOCODER_DEBOUNCE_MS = 700;

interface SavedGeography {
  addressCity: string;
  addressState: string;
  addressCountry: string;
}

interface CreatePackageFormState {
  trackingCode: string;
  zoneId: string;
  senderName: string;
  senderAddress: string;
  senderPhone: string;
  recipientName: string;
  recipientPhone: string;
  addressCountry: string;
  addressState: string;
  addressCity: string;
  addressZip: string;
  addressStreet: string;
  addressNumber: string;
  addressFloor: string;
  recipientAddress: string;
  addressReferences: string;
  weight: string;
  volume: string;
  deliveryWindowStart: string;
  deliveryWindowEnd: string;
  latInput: string;
  lngInput: string;
}

function loadSavedGeography(): SavedGeography {
  try {
    const raw = window.localStorage.getItem(GEOGRAPHY_STORAGE_KEY);
    if (!raw) {
      return { addressCity: '', addressState: '', addressCountry: '' };
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return { addressCity: '', addressState: '', addressCountry: '' };
    }
    const record = parsed as Record<string, unknown>;
    return {
      addressCity: typeof record.addressCity === 'string' ? record.addressCity : '',
      addressState: typeof record.addressState === 'string' ? record.addressState : '',
      addressCountry: typeof record.addressCountry === 'string' ? record.addressCountry : '',
    };
  } catch {
    return { addressCity: '', addressState: '', addressCountry: '' };
  }
}

function persistGeography(geography: SavedGeography): void {
  try {
    window.localStorage.setItem(GEOGRAPHY_STORAGE_KEY, JSON.stringify(geography));
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

function buildComposedAddress(fields: {
  addressStreet: string;
  addressNumber: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  addressCountry: string;
}): string {
  const streetLine = [fields.addressStreet.trim(), fields.addressNumber.trim()]
    .filter(Boolean)
    .join(' ');
  if (!streetLine) {
    return '';
  }

  return [
    streetLine,
    fields.addressCity.trim(),
    fields.addressState.trim(),
    fields.addressZip.trim(),
    fields.addressCountry.trim(),
  ]
    .filter(Boolean)
    .join(', ');
}

function buildInitialFormState(geography: SavedGeography): CreatePackageFormState {
  return {
    trackingCode: '',
    zoneId: '',
    senderName: '',
    senderAddress: '',
    senderPhone: '',
    recipientName: '',
    recipientPhone: '',
    addressCountry: geography.addressCountry,
    addressState: geography.addressState,
    addressCity: geography.addressCity,
    addressZip: '',
    addressStreet: '',
    addressNumber: '',
    addressFloor: '',
    recipientAddress: '',
    addressReferences: '',
    weight: '',
    volume: '',
    deliveryWindowStart: '',
    deliveryWindowEnd: '',
    latInput: '',
    lngInput: '',
  };
}

function parseOptionalNonNegativeNumber(
  raw: string,
  label: string
): { ok: true; value: number | undefined } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: undefined };
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) {
    return {
      ok: false,
      error: `${label} debe ser un número válido mayor o igual a 0.`,
    };
  }
  return { ok: true, value: num };
}

function parseOptionalCoordinates(
  latRaw: string,
  lngRaw: string
):
  | { ok: true; lat?: number; lng?: number }
  | { ok: false; error: string } {
  const latTrimmed = latRaw.trim();
  const lngTrimmed = lngRaw.trim();

  if (!latTrimmed && !lngTrimmed) {
    return { ok: true };
  }
  if (!latTrimmed || !lngTrimmed) {
    return {
      ok: false,
      error: 'Completa tanto la latitud como la longitud, o deja ambas vacías.',
    };
  }

  const lat = Number(latTrimmed);
  const lng = Number(lngTrimmed);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return {
      ok: false,
      error: 'La latitud debe ser un número válido entre -90 y 90.',
    };
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return {
      ok: false,
      error: 'La longitud debe ser un número válido entre -180 y 180.',
    };
  }
  if (lat === 0 && lng === 0) {
    return {
      ok: false,
      error: 'Las coordenadas (0, 0) no corresponden a una ubicación válida de entrega.',
    };
  }

  return { ok: true, lat, lng };
}

function toIsoDateTimeOrError(
  localValue: string,
  label: string
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  const trimmed = localValue.trim();
  if (!trimmed) {
    return { ok: true, value: undefined };
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return {
      ok: false,
      error: `${label} no tiene una fecha y hora válida.`,
    };
  }
  return { ok: true, value: parsed.toISOString() };
}

export function CreatePackagePage() {
  const { token } = useAuth();
  const fieldPrefix = useId();

  const [zones, setZones] = useState<Zone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [zonesError, setZonesError] = useState('');

  const [formData, setFormData] = useState<CreatePackageFormState>(() =>
    buildInitialFormState(loadSavedGeography())
  );
  const [addressManuallyEdited, setAddressManuallyEdited] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Geocoder & interactive pin state
  const [geocodeStatus, setGeocodeStatus] = useState<GeocodeStatus>('idle');
  const [geocodeDisplayName, setGeocodeDisplayName] = useState<string | null>(null);
  const [geocodeMessage, setGeocodeMessage] = useState<string | null>(null);
  const [coordsManuallyAdjusted, setCoordsManuallyAdjusted] = useState(false);

  const geocodeAbortRef = useRef<AbortController | null>(null);
  const geocodeSeqRef = useRef(0);
  const lastGeocodedQueryRef = useRef<string>('');
  const isManualGeocodeRef = useRef(false);

  const fetchZones = useCallback(async () => {
    if (!token) {
      setZonesLoading(false);
      return;
    }
    setZonesLoading(true);
    setZonesError('');
    try {
      const data = await zoneService.getZones(token, 1, 100);
      setZones(data.items || []);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Error al cargar zonas de despacho.';
      setZonesError(message);
    } finally {
      setZonesLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchZones();
  }, [fetchZones]);

  // Persist operator geography preference whenever city, state, or country changes
  useEffect(() => {
    persistGeography({
      addressCity: formData.addressCity,
      addressState: formData.addressState,
      addressCountry: formData.addressCountry,
    });
  }, [formData.addressCity, formData.addressState, formData.addressCountry]);

  // Abort any in-flight geocoding call on unmount
  useEffect(() => {
    return () => {
      if (geocodeAbortRef.current) {
        geocodeAbortRef.current.abort();
      }
    };
  }, []);

  const composedAddress = useMemo(
    () =>
      buildComposedAddress({
        addressStreet: formData.addressStreet,
        addressNumber: formData.addressNumber,
        addressCity: formData.addressCity,
        addressState: formData.addressState,
        addressZip: formData.addressZip,
        addressCountry: formData.addressCountry,
      }),
    [
      formData.addressStreet,
      formData.addressNumber,
      formData.addressCity,
      formData.addressState,
      formData.addressZip,
      formData.addressCountry,
    ]
  );

  const effectiveGeocodeQuery = useMemo(() => {
    if (addressManuallyEdited) {
      return formData.recipientAddress.trim();
    }
    if (composedAddress) {
      return composedAddress;
    }
    return [
      formData.addressCity.trim(),
      formData.addressState.trim(),
      formData.addressZip.trim(),
      formData.addressCountry.trim(),
    ]
      .filter(Boolean)
      .join(', ');
  }, [
    addressManuallyEdited,
    formData.recipientAddress,
    composedAddress,
    formData.addressCity,
    formData.addressState,
    formData.addressZip,
    formData.addressCountry,
  ]);

  const shouldAutoGeocode = useMemo(() => {
    if (coordsManuallyAdjusted) return false;
    if (addressManuallyEdited) {
      return formData.recipientAddress.trim().length >= 6;
    }
    return (
      formData.addressStreet.trim().length >= 3 &&
      (formData.addressCity.trim().length >= 2 ||
        formData.addressState.trim().length >= 2 ||
        formData.addressCountry.trim().length >= 2)
    );
  }, [
    coordsManuallyAdjusted,
    addressManuallyEdited,
    formData.recipientAddress,
    formData.addressStreet,
    formData.addressCity,
    formData.addressState,
    formData.addressCountry,
  ]);

  const runGeocode = useCallback(
    async (queryText: string, mode: 'auto' | 'manual' = 'auto') => {
      const trimmed = queryText.trim();
      if (trimmed.length < 3) {
        setGeocodeStatus('idle');
        setGeocodeDisplayName(null);
        setGeocodeMessage('Ingresa calle, ciudad o país para buscar en el mapa.');
        return;
      }

      if (geocodeAbortRef.current) {
        geocodeAbortRef.current.abort();
      }
      const controller = new AbortController();
      geocodeAbortRef.current = controller;
      isManualGeocodeRef.current = mode === 'manual';
      const seqId = ++geocodeSeqRef.current;
      lastGeocodedQueryRef.current = trimmed;

      setGeocodeStatus('searching');
      setGeocodeDisplayName(null);
      setGeocodeMessage(null);

      try {
        const params = new URLSearchParams({
          format: 'json',
          limit: '1',
          q: trimmed,
        });

        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?${params.toString()}`,
          {
            signal: controller.signal,
            headers: {
              Accept: 'application/json',
            },
          }
        );

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data: unknown = await res.json();
        if (controller.signal.aborted || seqId !== geocodeSeqRef.current) {
          return;
        }

        if (Array.isArray(data) && data.length > 0) {
          const first = data[0] as Record<string, unknown>;
          const lat = Number(first.lat);
          const lng = Number(first.lon);
          const validCoords = toValidNonZeroLatLng(lat, lng);
          if (validCoords) {
            setCoordsManuallyAdjusted(false);
            setFormData((prev) => ({
              ...prev,
              latInput: validCoords[0].toFixed(6),
              lngInput: validCoords[1].toFixed(6),
            }));
            setGeocodeStatus('found');
            setGeocodeDisplayName(
              typeof first.display_name === 'string' ? first.display_name : null
            );
            setGeocodeMessage(null);
            return;
          }
        }

        setGeocodeStatus('not_found');
        setGeocodeDisplayName(null);
        setGeocodeMessage(
          'Sin coincidencia exacta. Haz clic en el mapa o ingresa coordenadas manualmente.'
        );
      } catch (err: unknown) {
        if (
          controller.signal.aborted ||
          seqId !== geocodeSeqRef.current ||
          (err instanceof Error && err.name === 'AbortError')
        ) {
          return;
        }
        setGeocodeStatus('error');
        setGeocodeDisplayName(null);
        setGeocodeMessage(
          'No se pudo consultar el geocodificador. Puedes ubicar el pin haciendo clic en el mapa.'
        );
      } finally {
        if (geocodeAbortRef.current === controller) {
          geocodeAbortRef.current = null;
          isManualGeocodeRef.current = false;
        }
      }
    },
    []
  );

  const cancelPendingGeocode = useCallback(() => {
    geocodeSeqRef.current += 1;
    isManualGeocodeRef.current = false;
    if (geocodeAbortRef.current) {
      geocodeAbortRef.current.abort();
      geocodeAbortRef.current = null;
    }
  }, []);

  // Debounced automatic geocoding protected by AbortController and sequence token
  useEffect(() => {
    if (!shouldAutoGeocode) {
      if (
        !coordsManuallyAdjusted &&
        !isManualGeocodeRef.current &&
        geocodeAbortRef.current
      ) {
        cancelPendingGeocode();
        setGeocodeStatus((prev) => (prev === 'searching' ? 'idle' : prev));
      }
      return;
    }

    const queryTrimmed = effectiveGeocodeQuery.trim();
    if (queryTrimmed === lastGeocodedQueryRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      void runGeocode(queryTrimmed, 'auto');
    }, GEOCODER_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    shouldAutoGeocode,
    coordsManuallyAdjusted,
    effectiveGeocodeQuery,
    runGeocode,
    cancelPendingGeocode,
  ]);

  const handleStructuredAddressChange = (
    field:
      | 'addressCountry'
      | 'addressState'
      | 'addressCity'
      | 'addressZip'
      | 'addressStreet'
      | 'addressNumber',
    value: string
  ) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (!addressManuallyEdited) {
        next.recipientAddress = buildComposedAddress(next);
      }
      return next;
    });
  };

  const handleManualAddressChange = (value: string) => {
    setAddressManuallyEdited(true);
    setFormData((prev) => ({ ...prev, recipientAddress: value }));
  };

  const handleSyncAddressFromFields = () => {
    setAddressManuallyEdited(false);
    setFormData((prev) => ({
      ...prev,
      recipientAddress: buildComposedAddress(prev),
    }));
  };

  const handleMapLocationChange = (
    nextLat: number,
    nextLng: number,
    source: 'map-click' | 'marker-drag'
  ) => {
    cancelPendingGeocode();
    lastGeocodedQueryRef.current = '';
    setCoordsManuallyAdjusted(true);
    setGeocodeStatus('manual');
    setGeocodeDisplayName(null);
    setGeocodeMessage(
      source === 'marker-drag'
        ? 'Pin reubicado manualmente arrastrando el marcador.'
        : 'Ubicación fijada manualmente en el mapa.'
    );
    setFormData((prev) => ({
      ...prev,
      latInput: nextLat.toFixed(6),
      lngInput: nextLng.toFixed(6),
    }));
  };

  const handleManualCoordinateInput = (
    field: 'latInput' | 'lngInput',
    value: string
  ) => {
    cancelPendingGeocode();
    lastGeocodedQueryRef.current = '';
    setCoordsManuallyAdjusted(true);
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (!next.latInput.trim() && !next.lngInput.trim()) {
        setGeocodeStatus('idle');
        setGeocodeMessage(null);
      } else {
        setGeocodeStatus('manual');
        setGeocodeDisplayName(null);
        setGeocodeMessage('Coordenadas ingresadas manualmente.');
      }
      return next;
    });
  };

  const handleClearPin = () => {
    cancelPendingGeocode();
    lastGeocodedQueryRef.current = '';
    setCoordsManuallyAdjusted(true);
    setGeocodeStatus('idle');
    setGeocodeDisplayName(null);
    setGeocodeMessage(null);
    setFormData((prev) => ({
      ...prev,
      latInput: '',
      lngInput: '',
    }));
  };

  const handleManualGeocodeClick = () => {
    lastGeocodedQueryRef.current = effectiveGeocodeQuery.trim();
    setCoordsManuallyAdjusted(false);
    void runGeocode(effectiveGeocodeQuery, 'manual');
  };

  const handleResetGeography = () => {
    setFormData((prev) => {
      const next = {
        ...prev,
        addressCountry: '',
        addressState: '',
        addressCity: '',
      };
      if (!addressManuallyEdited) {
        next.recipientAddress = buildComposedAddress(next);
      }
      return next;
    });
  };

  const handleResetForm = (keepGeography = true) => {
    cancelPendingGeocode();
    lastGeocodedQueryRef.current = '';
    setError('');
    setSuccess('');
    setAddressManuallyEdited(false);
    setCoordsManuallyAdjusted(false);
    setGeocodeStatus('idle');
    setGeocodeDisplayName(null);
    setGeocodeMessage(null);

    setFormData((prev) =>
      buildInitialFormState(
        keepGeography
          ? {
              addressCity: prev.addressCity,
              addressState: prev.addressState,
              addressCountry: prev.addressCountry,
            }
          : { addressCity: '', addressState: '', addressCountry: '' }
      )
    );
  };

  const generateTracking = () => {
    const code = 'TRK-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    setFormData((prev) => ({ ...prev, trackingCode: code }));
  };

  const parsedMapCoords = useMemo(() => {
    const latTrimmed = formData.latInput.trim();
    const lngTrimmed = formData.lngInput.trim();
    if (!latTrimmed || !lngTrimmed) {
      return { lat: null, lng: null };
    }
    const lat = Number(latTrimmed);
    const lng = Number(lngTrimmed);
    const valid = toValidNonZeroLatLng(lat, lng);
    return valid ? { lat: valid[0], lng: valid[1] } : { lat: null, lng: null };
  }, [formData.latInput, formData.lngInput]);

  const selectedZone = useMemo(
    () => zones.find((z) => z.id === formData.zoneId) ?? null,
    [zones, formData.zoneId]
  );

  const coordsInlineError = useMemo(() => {
    if (!formData.latInput.trim() && !formData.lngInput.trim()) return '';
    const check = parseOptionalCoordinates(formData.latInput, formData.lngInput);
    return check.ok ? '' : check.error;
  }, [formData.latInput, formData.lngInput]);

  // Inline live validation for delivery window range
  const deliveryWindowRangeError = useMemo(() => {
    const startTrimmed = formData.deliveryWindowStart.trim();
    const endTrimmed = formData.deliveryWindowEnd.trim();
    if (!startTrimmed || !endTrimmed) return '';
    const startDate = new Date(startTrimmed);
    const endDate = new Date(endTrimmed);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return '';
    }
    if (startDate > endDate) {
      return 'La hora de inicio de la ventana debe ser anterior o igual a la hora de fin.';
    }
    return '';
  }, [formData.deliveryWindowStart, formData.deliveryWindowEnd]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setError('');
    setSuccess('');

    if (!token) {
      setError('Sesión expirada. Inicia sesión nuevamente.');
      return;
    }

    const trackingCode = formData.trackingCode.trim();
    const recipientName = formData.recipientName.trim();
    const recipientPhone = formData.recipientPhone.trim();
    const recipientAddress = formData.recipientAddress.trim();

    if (trackingCode.length < 5) {
      setError('El código de seguimiento debe tener al menos 5 caracteres.');
      return;
    }
    if (!formData.zoneId) {
      setError('Por favor seleccione una zona de destino.');
      return;
    }
    if (recipientName.length < 2) {
      setError('El nombre del destinatario debe tener al menos 2 caracteres.');
      return;
    }
    if (recipientPhone.length < 3) {
      setError('El teléfono del destinatario debe tener al menos 3 caracteres.');
      return;
    }
    if (recipientAddress.length < 5) {
      setError('La dirección de entrega debe tener al menos 5 caracteres.');
      return;
    }

    const weightResult = parseOptionalNonNegativeNumber(formData.weight, 'Peso');
    if (!weightResult.ok) {
      setError(weightResult.error);
      return;
    }

    const volumeResult = parseOptionalNonNegativeNumber(formData.volume, 'Volumen');
    if (!volumeResult.ok) {
      setError(volumeResult.error);
      return;
    }

    const coordsResult = parseOptionalCoordinates(
      formData.latInput,
      formData.lngInput
    );
    if (!coordsResult.ok) {
      setError(coordsResult.error);
      return;
    }

    const startResult = toIsoDateTimeOrError(
      formData.deliveryWindowStart,
      'Inicio de ventana horaria'
    );
    if (!startResult.ok) {
      setError(startResult.error);
      return;
    }

    const endResult = toIsoDateTimeOrError(
      formData.deliveryWindowEnd,
      'Fin de ventana horaria'
    );
    if (!endResult.ok) {
      setError(endResult.error);
      return;
    }

    if (
      startResult.value &&
      endResult.value &&
      new Date(startResult.value) > new Date(endResult.value)
    ) {
      setError(
        'La ventana horaria de inicio debe ser anterior o igual a la de fin.'
      );
      return;
    }

    const optionalString = (val: string): string | undefined => {
      const trimmed = val.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    };

    const addressStreet = optionalString(formData.addressStreet);
    const addressNumber = optionalString(formData.addressNumber);
    const addressFloor = optionalString(formData.addressFloor);
    const addressCity = optionalString(formData.addressCity);
    const addressZip = optionalString(formData.addressZip);
    const addressCountry = optionalString(formData.addressCountry);
    const addressReferences = optionalString(formData.addressReferences);
    const senderName = optionalString(formData.senderName);
    const senderPhone = optionalString(formData.senderPhone);
    const senderAddress = optionalString(formData.senderAddress);

    const payload: CreatePackageInput = {
      trackingCode,
      zoneId: formData.zoneId,
      recipientName,
      recipientPhone,
      recipientAddress,
      ...(addressStreet !== undefined && { addressStreet }),
      ...(addressNumber !== undefined && { addressNumber }),
      ...(addressFloor !== undefined && { addressFloor }),
      ...(addressCity !== undefined && { addressCity }),
      ...(addressZip !== undefined && { addressZip }),
      ...(addressCountry !== undefined && { addressCountry }),
      ...(addressReferences !== undefined && { addressReferences }),
      ...(senderName !== undefined && { senderName }),
      ...(senderPhone !== undefined && { senderPhone }),
      ...(senderAddress !== undefined && { senderAddress }),
      ...(weightResult.value !== undefined && { weight: weightResult.value }),
      ...(volumeResult.value !== undefined && { volume: volumeResult.value }),
      ...(coordsResult.lat !== undefined &&
        coordsResult.lng !== undefined && {
          lat: coordsResult.lat,
          lng: coordsResult.lng,
        }),
      ...(startResult.value !== undefined && {
        deliveryWindowStart: startResult.value,
      }),
      ...(endResult.value !== undefined && {
        deliveryWindowEnd: endResult.value,
      }),
    };

    setLoading(true);
    try {
      await packageService.createPackage(token, payload);
      toast.success(`Paquete ${trackingCode} creado exitosamente`);
      handleResetForm(true);
      setSuccess(`¡Paquete ${trackingCode} registrado exitosamente!`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Error al crear el paquete.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const hasSavedGeography = Boolean(
    formData.addressCity.trim() ||
      formData.addressState.trim() ||
      formData.addressCountry.trim()
  );

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Link
            to="/packages"
            className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors mb-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Volver a Paquetes</span>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15 border border-brand-500/30 text-brand-400">
              <Package className="h-4 w-4" />
            </span>
            <span>Nuevo Paquete</span>
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Registra un envío con geografía configurable, ventana horaria y ubicación precisa en mapa.
          </p>
        </div>
      </div>

      {/* Feedback Alerts */}
      {error && (
        <div
          role="alert"
          className="p-3.5 bg-red-500/10 border border-red-500/25 text-red-200 rounded-xl flex items-start gap-2.5 text-xs sm:text-sm"
        >
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="p-3.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm"
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{success}</span>
          </span>
          <Link
            to="/packages"
            className="inline-flex min-h-[36px] items-center text-xs font-semibold text-emerald-300 hover:text-emerald-200 underline underline-offset-2"
          >
            Ir al listado de paquetes
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Structured Form */}
          <div className="lg:col-span-7 space-y-5">
            {/* Section 1: Identification & Route */}
            <section className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Box className="h-4 w-4 text-brand-400" />
                  <span>Identificación y Zona</span>
                </h2>
                <span className="text-[11px] text-slate-400">Campos obligatorios *</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor={`${fieldPrefix}-trackingCode`}
                    className="block text-xs font-medium text-slate-300"
                  >
                    Código de Seguimiento *
                  </label>
                  <div className="flex gap-2">
                    <input
                      id={`${fieldPrefix}-trackingCode`}
                      type="text"
                      required
                      minLength={5}
                      placeholder="Ej. TRK-948201"
                      className="flex-1 min-w-0 min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors font-mono tabular-nums"
                      value={formData.trackingCode}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          trackingCode: e.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      onClick={generateTracking}
                      className="inline-flex min-h-[44px] sm:min-h-[40px] items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700/80 text-slate-200 rounded-lg hover:bg-slate-700 text-xs font-medium transition-colors shrink-0"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-brand-400" />
                      <span>Generar</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor={`${fieldPrefix}-zoneId`}
                    className="block text-xs font-medium text-slate-300"
                  >
                    Zona de Destino *
                  </label>
                  {zonesLoading ? (
                    <Skeleton className="h-[44px] sm:h-[40px] w-full rounded-lg" />
                  ) : zonesError ? (
                    <div className="flex min-h-[44px] sm:min-h-[40px] items-center justify-between gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                      <span className="truncate">{zonesError}</span>
                      <button
                        type="button"
                        onClick={() => void fetchZones()}
                        className="inline-flex min-h-[36px] items-center gap-1 px-2 font-medium text-red-100 hover:text-white shrink-0"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Reintentar</span>
                      </button>
                    </div>
                  ) : zones.length === 0 ? (
                    <div
                      role="status"
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 min-h-[44px] sm:min-h-[40px]"
                    >
                      <span>No hay zonas creadas todavía.</span>
                      <Link
                        to="/zones"
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 font-semibold text-amber-100 hover:bg-amber-500/25 transition-colors shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Crear zona</span>
                      </Link>
                    </div>
                  ) : (
                    <select
                      id={`${fieldPrefix}-zoneId`}
                      required
                      className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                      value={formData.zoneId}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, zoneId: e.target.value }))
                      }
                    >
                      <option value="">Seleccione una zona</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </section>

            {/* Section 2: Recipient & Configurable Geography Address */}
            <section className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <User className="h-4 w-4 text-emerald-400" />
                  <span>Destinatario y Dirección de Entrega</span>
                </h2>
                {hasSavedGeography && (
                  <button
                    type="button"
                    onClick={handleResetGeography}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                    title="Limpiar país, provincia y ciudad guardados"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Limpiar geografía</span>
                  </button>
                )}
              </div>

              {/* Recipient Contact */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor={`${fieldPrefix}-recipientName`}
                    className="block text-xs font-medium text-slate-300"
                  >
                    Nombre Completo / Razón Social *
                  </label>
                  <input
                    id={`${fieldPrefix}-recipientName`}
                    type="text"
                    required
                    minLength={2}
                    placeholder="Ej. María González / Acme Logística"
                    className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                    value={formData.recipientName}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        recipientName: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor={`${fieldPrefix}-recipientPhone`}
                    className="block text-xs font-medium text-slate-300"
                  >
                    Teléfono *
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    <input
                      id={`${fieldPrefix}-recipientPhone`}
                      type="text"
                      required
                      minLength={3}
                      placeholder="Ej. +XX XXX XXX XXXX"
                      className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-400 tabular-nums focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                      value={formData.recipientPhone}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          recipientPhone: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Configurable Geography */}
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
                    <Globe className="h-3.5 w-3.5 text-brand-400" />
                    <span>Geografía Operativa (se recuerda automáticamente)</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label
                      htmlFor={`${fieldPrefix}-addressCountry`}
                      className="block text-xs text-slate-300"
                    >
                      País
                    </label>
                    <input
                      id={`${fieldPrefix}-addressCountry`}
                      type="text"
                      placeholder="Ej. México, España, Chile"
                      className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 transition-colors"
                      value={formData.addressCountry}
                      onChange={(e) =>
                        handleStructuredAddressChange('addressCountry', e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor={`${fieldPrefix}-addressState`}
                      className="block text-xs text-slate-300"
                    >
                      Provincia / Estado
                    </label>
                    <input
                      id={`${fieldPrefix}-addressState`}
                      type="text"
                      placeholder="Ej. Estado, Provincia o Región"
                      className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 transition-colors"
                      value={formData.addressState}
                      onChange={(e) =>
                        handleStructuredAddressChange('addressState', e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor={`${fieldPrefix}-addressCity`}
                      className="block text-xs text-slate-300"
                    >
                      Ciudad / Localidad
                    </label>
                    <input
                      id={`${fieldPrefix}-addressCity`}
                      type="text"
                      placeholder="Ej. Ciudad o Localidad"
                      className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 transition-colors"
                      value={formData.addressCity}
                      onChange={(e) =>
                        handleStructuredAddressChange('addressCity', e.target.value)
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Street, Number, Floor, Zip */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-5 space-y-1">
                  <label
                    htmlFor={`${fieldPrefix}-addressStreet`}
                    className="block text-xs font-medium text-slate-300"
                  >
                    Calle / Avenida
                  </label>
                  <input
                    id={`${fieldPrefix}-addressStreet`}
                    type="text"
                    placeholder="Ej. Av. Principal"
                    className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 transition-colors"
                    value={formData.addressStreet}
                    onChange={(e) =>
                      handleStructuredAddressChange('addressStreet', e.target.value)
                    }
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label
                    htmlFor={`${fieldPrefix}-addressNumber`}
                    className="block text-xs font-medium text-slate-300"
                  >
                    Altura / N°
                  </label>
                  <input
                    id={`${fieldPrefix}-addressNumber`}
                    type="text"
                    placeholder="Ej. 450"
                    className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 tabular-nums focus:outline-none focus:border-brand-500 transition-colors"
                    value={formData.addressNumber}
                    onChange={(e) =>
                      handleStructuredAddressChange('addressNumber', e.target.value)
                    }
                  />
                </div>

                <div className="sm:col-span-3 space-y-1">
                  <label
                    htmlFor={`${fieldPrefix}-addressFloor`}
                    className="block text-xs font-medium text-slate-300"
                  >
                    Piso / Depto
                  </label>
                  <input
                    id={`${fieldPrefix}-addressFloor`}
                    type="text"
                    placeholder="Ej. 3B, Oficina 2"
                    className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 transition-colors"
                    value={formData.addressFloor}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        addressFloor: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label
                    htmlFor={`${fieldPrefix}-addressZip`}
                    className="block text-xs font-medium text-slate-300"
                  >
                    Cód. Postal
                  </label>
                  <input
                    id={`${fieldPrefix}-addressZip`}
                    type="text"
                    placeholder="Ej. 28013"
                    className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 tabular-nums focus:outline-none focus:border-brand-500 transition-colors"
                    value={formData.addressZip}
                    onChange={(e) =>
                      handleStructuredAddressChange('addressZip', e.target.value)
                    }
                  />
                </div>
              </div>

              {/* Full Delivery Address (auto-composed & editable) */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor={`${fieldPrefix}-recipientAddress`}
                    className="block text-xs font-medium text-slate-300"
                  >
                    Dirección Completa de Entrega *
                  </label>
                  {addressManuallyEdited && composedAddress && (
                    <button
                      type="button"
                      onClick={handleSyncAddressFromFields}
                      className="inline-flex min-h-[36px] items-center rounded-lg px-2 py-1 text-xs font-medium text-brand-400 hover:bg-slate-800 hover:text-brand-300 transition-colors"
                    >
                      Sincronizar desde campos
                    </button>
                  )}
                </div>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    id={`${fieldPrefix}-recipientAddress`}
                    type="text"
                    required
                    minLength={5}
                    placeholder="Se completa automáticamente desde los campos superiores o puedes escribirla aquí"
                    className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                    value={formData.recipientAddress}
                    onChange={(e) => handleManualAddressChange(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor={`${fieldPrefix}-addressReferences`}
                  className="block text-xs font-medium text-slate-300"
                >
                  Referencias de Entrega
                </label>
                <input
                  id={`${fieldPrefix}-addressReferences`}
                  type="text"
                  placeholder="Ej. Portón negro, recepción en planta baja, horario de carga"
                  className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 transition-colors"
                  value={formData.addressReferences}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      addressReferences: e.target.value,
                    }))
                  }
                />
              </div>
            </section>

            {/* Section 3: Dimensions & Delivery Window */}
            <section className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
              <div className="border-b border-slate-800/80 pb-3">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Scale className="h-4 w-4 text-sky-400" />
                  <span>Dimensiones y Ventana Horaria (Opcional)</span>
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor={`${fieldPrefix}-weight`}
                    className="block text-xs font-medium text-slate-300"
                  >
                    Peso (kg)
                  </label>
                  <input
                    id={`${fieldPrefix}-weight`}
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Ej. 2.5"
                    className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 tabular-nums focus:outline-none focus:border-brand-500 transition-colors"
                    value={formData.weight}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, weight: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor={`${fieldPrefix}-volume`}
                    className="block text-xs font-medium text-slate-300"
                  >
                    Volumen (m³)
                  </label>
                  <input
                    id={`${fieldPrefix}-volume`}
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Ej. 0.04"
                    className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 tabular-nums focus:outline-none focus:border-brand-500 transition-colors"
                    value={formData.volume}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, volume: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor={`${fieldPrefix}-deliveryWindowStart`}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-300"
                  >
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    <span>Ventana Inicio</span>
                  </label>
                  <input
                    id={`${fieldPrefix}-deliveryWindowStart`}
                    type="datetime-local"
                    className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white tabular-nums focus:outline-none focus:border-brand-500 transition-colors"
                    value={formData.deliveryWindowStart}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        deliveryWindowStart: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor={`${fieldPrefix}-deliveryWindowEnd`}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-300"
                  >
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    <span>Ventana Fin</span>
                  </label>
                  <input
                    id={`${fieldPrefix}-deliveryWindowEnd`}
                    type="datetime-local"
                    className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white tabular-nums focus:outline-none focus:border-brand-500 transition-colors"
                    value={formData.deliveryWindowEnd}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        deliveryWindowEnd: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              {deliveryWindowRangeError && (
                <p
                  role="alert"
                  className="text-xs text-red-400 flex items-center gap-1.5 pt-1"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{deliveryWindowRangeError}</span>
                </p>
              )}
            </section>

            {/* Section 4: Sender Details (Optional) */}
            <section className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
              <div className="border-b border-slate-800/80 pb-3">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-amber-400" />
                  <span>Datos del Remitente (Opcional)</span>
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor={`${fieldPrefix}-senderName`}
                    className="block text-xs font-medium text-slate-300"
                  >
                    Nombre / Empresa
                  </label>
                  <input
                    id={`${fieldPrefix}-senderName`}
                    type="text"
                    placeholder="Ej. Centro de Distribución Norte"
                    className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 transition-colors"
                    value={formData.senderName}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        senderName: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor={`${fieldPrefix}-senderPhone`}
                    className="block text-xs font-medium text-slate-300"
                  >
                    Teléfono de Origen
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    <input
                      id={`${fieldPrefix}-senderPhone`}
                      type="text"
                      placeholder="Ej. +XX XXX XXX XXXX"
                      className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-400 tabular-nums focus:outline-none focus:border-brand-500 transition-colors"
                      value={formData.senderPhone}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          senderPhone: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor={`${fieldPrefix}-senderAddress`}
                  className="block text-xs font-medium text-slate-300"
                >
                  Dirección de Retiro / Origen
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    id={`${fieldPrefix}-senderAddress`}
                    type="text"
                    placeholder="Calle, Altura, Ciudad, País"
                    className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 transition-colors"
                    value={formData.senderAddress}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        senderAddress: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Map Preview, Coordinates & Primary CTA */}
          <div className="lg:col-span-5 lg:sticky lg:top-4 space-y-4">
            <section className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 sm:p-5 shadow-sm space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-brand-400" />
                    <span>Vista Previa y Pin en Mapa</span>
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Geocodificación automática con debounce y ajuste manual.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleManualGeocodeClick}
                  disabled={
                    geocodeStatus === 'searching' ||
                    effectiveGeocodeQuery.trim().length < 3
                  }
                  className="inline-flex min-h-[44px] sm:min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {geocodeStatus === 'searching' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-400" />
                  ) : (
                    <Search className="h-3.5 w-3.5 text-brand-400" />
                  )}
                  <span>
                    {geocodeStatus === 'searching'
                      ? 'Buscando...'
                      : 'Buscar en mapa'}
                  </span>
                </button>
              </div>

              <PackageLocationPickerMap
                lat={parsedMapCoords.lat}
                lng={parsedMapCoords.lng}
                onLocationChange={handleMapLocationChange}
                selectedZone={selectedZone}
                recipientAddress={formData.recipientAddress.trim()}
                geocodeStatus={geocodeStatus}
              />

              {geocodeDisplayName && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200 leading-relaxed">
                  <span className="font-semibold text-emerald-300">
                    Resultado geocodificado:{' '}
                  </span>
                  <span>{geocodeDisplayName}</span>
                </div>
              )}

              {geocodeMessage && !geocodeDisplayName && (
                <div className="rounded-lg border border-slate-800/80 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-300 leading-relaxed">
                  {geocodeMessage}
                </div>
              )}

              {/* Precision Lat/Lng Inputs */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-300">
                    Coordenadas del Pin
                  </span>
                  {(formData.latInput.trim() || formData.lngInput.trim()) && (
                    <button
                      type="button"
                      onClick={handleClearPin}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Quitar pin</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label
                      htmlFor={`${fieldPrefix}-latInput`}
                      className="block text-xs font-medium text-slate-300"
                    >
                      Latitud (-90 a 90)
                    </label>
                    <input
                      id={`${fieldPrefix}-latInput`}
                      type="number"
                      step="any"
                      min="-90"
                      max="90"
                      placeholder="Ej. 40.416775"
                      className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm font-mono tabular-nums text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 transition-colors"
                      value={formData.latInput}
                      onChange={(e) =>
                        handleManualCoordinateInput('latInput', e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor={`${fieldPrefix}-lngInput`}
                      className="block text-xs font-medium text-slate-300"
                    >
                      Longitud (-180 a 180)
                    </label>
                    <input
                      id={`${fieldPrefix}-lngInput`}
                      type="number"
                      step="any"
                      min="-180"
                      max="180"
                      placeholder="Ej. -3.703790"
                      className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm font-mono tabular-nums text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 transition-colors"
                      value={formData.lngInput}
                      onChange={(e) =>
                        handleManualCoordinateInput('lngInput', e.target.value)
                      }
                    />
                  </div>
                </div>
              </div>

              {coordsInlineError && (
                <p
                  role="alert"
                  className="text-xs text-red-400 flex items-center gap-1.5"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{coordsInlineError}</span>
                </p>
              )}
            </section>

            {/* Form Actions Card */}
            <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 sm:p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Estado de coordenadas</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {parsedMapCoords.lat !== null && parsedMapCoords.lng !== null
                    ? `${parsedMapCoords.lat.toFixed(5)}, ${parsedMapCoords.lng.toFixed(5)}`
                    : 'Sin definir (opcional)'}
                </span>
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleResetForm(true)}
                  disabled={loading}
                  className="min-h-[44px] px-4 py-2.5 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors text-sm font-medium disabled:opacity-50"
                >
                  Limpiar
                </button>
                <button
                  type="submit"
                  disabled={loading || Boolean(deliveryWindowRangeError)}
                  className="min-h-[44px] flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-brand-700 hover:bg-brand-600 text-white font-semibold rounded-lg shadow-lg shadow-brand-950/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Procesando...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      <span>Crear Paquete</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
