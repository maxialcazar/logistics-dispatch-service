import { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileJson,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Modal } from './Modal';
import { ApiError } from '../services/apiClient';
import {
  packageService,
  type BulkImportResult,
  type BulkPackageRow,
} from '../services/packageService';
import type { Zone } from '../services/zoneService';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  zones: Zone[];
  onImported: () => void | Promise<void>;
}

type ImportFormat = 'csv' | 'json';

const MAX_BULK_ROWS = 500;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DECIMAL_REGEX = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

const CSV_HEADER_ALIASES: Record<string, keyof BulkPackageRow> = {
  trackingcode: 'trackingCode',
  tracking_code: 'trackingCode',
  recipientname: 'recipientName',
  recipient_name: 'recipientName',
  recipientaddress: 'recipientAddress',
  recipient_address: 'recipientAddress',
  recipientphone: 'recipientPhone',
  recipient_phone: 'recipientPhone',
  recipientemail: 'recipientEmail',
  recipient_email: 'recipientEmail',
  addressstreet: 'addressStreet',
  address_street: 'addressStreet',
  addressnumber: 'addressNumber',
  address_number: 'addressNumber',
  addressfloor: 'addressFloor',
  address_floor: 'addressFloor',
  addresscity: 'addressCity',
  address_city: 'addressCity',
  addresszip: 'addressZip',
  address_zip: 'addressZip',
  addresscountry: 'addressCountry',
  address_country: 'addressCountry',
  addressreferences: 'addressReferences',
  address_references: 'addressReferences',
  sendername: 'senderName',
  sender_name: 'senderName',
  senderaddress: 'senderAddress',
  sender_address: 'senderAddress',
  senderphone: 'senderPhone',
  sender_phone: 'senderPhone',
  weight: 'weight',
  volume: 'volume',
  zoneid: 'zoneId',
  zone_id: 'zoneId',
  lat: 'lat',
  lng: 'lng',
  estimateddeliveryat: 'estimatedDeliveryAt',
  estimated_delivery_at: 'estimatedDeliveryAt',
  deliverywindowstart: 'deliveryWindowStart',
  delivery_window_start: 'deliveryWindowStart',
  deliverywindowend: 'deliveryWindowEnd',
  delivery_window_end: 'deliveryWindowEnd',
};

const REQUIRED_FIELDS: Array<keyof Pick<
  BulkPackageRow,
  'trackingCode' | 'recipientName' | 'recipientAddress' | 'recipientPhone'
>> = ['trackingCode', 'recipientName', 'recipientAddress', 'recipientPhone'];

const SAMPLE_CSV = [
  'trackingCode,recipientName,recipientAddress,recipientPhone,addressCity,addressFloor,addressZip,weight,volume',
  'TRK-BULK-001,Lucía Fernández,"Av. Colón 1450, Centro",+5493515551122,Córdoba,3B,5000,2.5,0.04',
  'TRK-BULK-002,Martín Gómez,"Bv. Chacabuco 780",+5493515553344,Córdoba,,5000,1.2,0.02',
].join('\n');

const SAMPLE_JSON = JSON.stringify(
  [
    {
      trackingCode: 'TRK-BULK-001',
      recipientName: 'Lucía Fernández',
      recipientAddress: 'Av. Colón 1450, Centro',
      recipientPhone: '+5493515551122',
      addressCity: 'Córdoba',
      addressFloor: '3B',
      addressZip: '5000',
      weight: 2.5,
      volume: 0.04,
    },
    {
      trackingCode: 'TRK-BULK-002',
      recipientName: 'Martín Gómez',
      recipientAddress: 'Bv. Chacabuco 780',
      recipientPhone: '+5493515553344',
      addressCity: 'Córdoba',
      addressZip: '5000',
      weight: 1.2,
      volume: 0.02,
    },
  ],
  null,
  2
);

interface ParsedPreview {
  rows: BulkPackageRow[];
  errors: string[];
  hasInput: boolean;
}

function parseRfc4180Csv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentCell);
      currentCell = '';
    } else if (ch === '\r' && next === '\n') {
      currentRow.push(currentCell);
      if (currentRow.some((cell) => cell.trim() !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      currentRow.push(currentCell);
      if (currentRow.some((cell) => cell.trim() !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  if (inQuotes) {
    throw new Error('Comillas sin cerrar en el contenido CSV.');
  }

  currentRow.push(currentCell);
  if (currentRow.some((cell) => cell.trim() !== '')) {
    rows.push(currentRow);
  }

  return rows;
}

function validateAndNormalizeRows(
  rawRows: Array<Record<string, unknown>>,
  sourceLabel: 'CSV' | 'JSON'
): ParsedPreview {
  const errors: string[] = [];

  if (rawRows.length === 0) {
    return {
      rows: [],
      errors: [`El archivo o texto ${sourceLabel} debe contener al menos 1 fila.`],
      hasInput: true,
    };
  }

  if (rawRows.length > MAX_BULK_ROWS) {
    return {
      rows: [],
      errors: [
        `Máximo ${MAX_BULK_ROWS} paquetes por lote (se detectaron ${rawRows.length}).`,
      ],
      hasInput: true,
    };
  }

  const normalizedRows: BulkPackageRow[] = [];
  const seenCodes = new Map<string, number>();

  rawRows.forEach((raw, idx) => {
    const rowNum = idx + 1;
    const prefix = `${sourceLabel} fila ${rowNum}`;

    const readStr = (key: keyof BulkPackageRow): string | undefined => {
      const v = raw[key];
      if (typeof v !== 'string') return undefined;
      const trimmed = v.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    };

    const readNum = (key: 'weight' | 'volume' | 'lat' | 'lng'): number | undefined | 'invalid' => {
      const v = raw[key];
      if (v === undefined || v === null || v === '') return undefined;
      if (typeof v === 'number') {
        return Number.isFinite(v) ? v : 'invalid';
      }
      if (typeof v === 'string') {
        const trimmed = v.trim();
        if (!trimmed) return undefined;
        if (!DECIMAL_REGEX.test(trimmed)) return 'invalid';
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : 'invalid';
      }
      return 'invalid';
    };

    const trackingCode = readStr('trackingCode') ?? '';
    const recipientName = readStr('recipientName') ?? '';
    const recipientAddress = readStr('recipientAddress') ?? '';
    const recipientPhone = readStr('recipientPhone') ?? '';

    if (trackingCode.length < 5) {
      errors.push(`${prefix}: trackingCode debe tener al menos 5 caracteres.`);
    }
    if (recipientName.length < 2) {
      errors.push(`${prefix}: recipientName debe tener al menos 2 caracteres.`);
    }
    if (recipientAddress.length < 5) {
      errors.push(`${prefix}: recipientAddress debe tener al menos 5 caracteres.`);
    }
    if (recipientPhone.length < 3) {
      errors.push(`${prefix}: recipientPhone debe tener al menos 3 caracteres.`);
    }

    if (trackingCode) {
      const firstIdx = seenCodes.get(trackingCode);
      if (firstIdx !== undefined) {
        errors.push(
          `${prefix}: trackingCode duplicado '${trackingCode}' (primera aparición en fila ${firstIdx}).`
        );
      } else {
        seenCodes.set(trackingCode, rowNum);
      }
    }

    const recipientEmail = readStr('recipientEmail');
    if (recipientEmail && !EMAIL_REGEX.test(recipientEmail)) {
      errors.push(`${prefix}: recipientEmail inválido ('${recipientEmail}').`);
    }

    const zoneId = readStr('zoneId');
    if (zoneId && !UUID_REGEX.test(zoneId)) {
      errors.push(`${prefix}: zoneId debe ser un UUID válido.`);
    }

    const weight = readNum('weight');
    if (weight === 'invalid' || (typeof weight === 'number' && weight < 0)) {
      errors.push(`${prefix}: weight debe ser un número mayor o igual a 0.`);
    }

    const volume = readNum('volume');
    if (volume === 'invalid' || (typeof volume === 'number' && volume < 0)) {
      errors.push(`${prefix}: volume debe ser un número mayor o igual a 0.`);
    }

    const lat = readNum('lat');
    if (lat === 'invalid' || (typeof lat === 'number' && (lat < -90 || lat > 90))) {
      errors.push(`${prefix}: lat debe estar entre -90 y 90.`);
    }

    const lng = readNum('lng');
    if (lng === 'invalid' || (typeof lng === 'number' && (lng < -180 || lng > 180))) {
      errors.push(`${prefix}: lng debe estar entre -180 y 180.`);
    }

    const deliveryWindowStart = readStr('deliveryWindowStart');
    const deliveryWindowEnd = readStr('deliveryWindowEnd');
    const estimatedDeliveryAt = readStr('estimatedDeliveryAt');

    const isValidIso = (val: string) => !Number.isNaN(new Date(val).getTime());
    if (deliveryWindowStart && !isValidIso(deliveryWindowStart)) {
      errors.push(`${prefix}: deliveryWindowStart no es una fecha/hora válida.`);
    }
    if (deliveryWindowEnd && !isValidIso(deliveryWindowEnd)) {
      errors.push(`${prefix}: deliveryWindowEnd no es una fecha/hora válida.`);
    }
    if (estimatedDeliveryAt && !isValidIso(estimatedDeliveryAt)) {
      errors.push(`${prefix}: estimatedDeliveryAt no es una fecha/hora válida.`);
    }
    if (
      deliveryWindowStart &&
      deliveryWindowEnd &&
      isValidIso(deliveryWindowStart) &&
      isValidIso(deliveryWindowEnd) &&
      new Date(deliveryWindowStart) > new Date(deliveryWindowEnd)
    ) {
      errors.push(`${prefix}: deliveryWindowStart debe ser anterior o igual a deliveryWindowEnd.`);
    }

    normalizedRows.push({
      trackingCode,
      recipientName,
      recipientAddress,
      recipientPhone,
      ...(recipientEmail && { recipientEmail }),
      ...(readStr('addressStreet') && { addressStreet: readStr('addressStreet') }),
      ...(readStr('addressNumber') && { addressNumber: readStr('addressNumber') }),
      ...(readStr('addressFloor') && { addressFloor: readStr('addressFloor') }),
      ...(readStr('addressCity') && { addressCity: readStr('addressCity') }),
      ...(readStr('addressZip') && { addressZip: readStr('addressZip') }),
      ...(readStr('addressCountry') && { addressCountry: readStr('addressCountry') }),
      ...(readStr('addressReferences') && { addressReferences: readStr('addressReferences') }),
      ...(readStr('senderName') && { senderName: readStr('senderName') }),
      ...(readStr('senderAddress') && { senderAddress: readStr('senderAddress') }),
      ...(readStr('senderPhone') && { senderPhone: readStr('senderPhone') }),
      ...(typeof weight === 'number' && { weight }),
      ...(typeof volume === 'number' && { volume }),
      ...(zoneId && { zoneId }),
      ...(typeof lat === 'number' && { lat }),
      ...(typeof lng === 'number' && { lng }),
      ...(estimatedDeliveryAt && { estimatedDeliveryAt }),
      ...(deliveryWindowStart && { deliveryWindowStart }),
      ...(deliveryWindowEnd && { deliveryWindowEnd }),
    });
  });

  return { rows: normalizedRows, errors, hasInput: true };
}

function parseBulkPreview(rawInput: string, format: ImportFormat): ParsedPreview {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { rows: [], errors: [], hasInput: false };
  }

  if (format === 'csv') {
    try {
      const matrix = parseRfc4180Csv(trimmed);
      if (matrix.length === 0) {
        return { rows: [], errors: ['El CSV está vacío.'], hasInput: true };
      }

      const headers = matrix[0].map((header) => {
        const key = header.trim().toLowerCase();
        return CSV_HEADER_ALIASES[key] ?? header.trim();
      });

      const missingHeaders = REQUIRED_FIELDS.filter((req) => !headers.includes(req));
      if (missingHeaders.length > 0) {
        return {
          rows: [],
          errors: [`Faltan columnas requeridas en el CSV: ${missingHeaders.join(', ')}`],
          hasInput: true,
        };
      }

      const dataRows = matrix.slice(1).map((cells) => {
        const obj: Record<string, unknown> = {};
        headers.forEach((header, idx) => {
          if (header) {
            obj[header] = cells[idx] ?? '';
          }
        });
        return obj;
      });

      return validateAndNormalizeRows(dataRows, 'CSV');
    } catch (err) {
      return {
        rows: [],
        errors: [err instanceof Error ? err.message : 'Formato CSV inválido.'],
        hasInput: true,
      };
    }
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    let rawArray: unknown[] | null = null;

    if (Array.isArray(parsed)) {
      rawArray = parsed;
    } else if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as Record<string, unknown>).packages)
    ) {
      rawArray = (parsed as Record<string, unknown>).packages as unknown[];
    }

    if (!rawArray) {
      return {
        rows: [],
        errors: ['El JSON debe ser un arreglo [...] o un objeto { "packages": [...] }.'],
        hasInput: true,
      };
    }

    const invalidObjectIndices: string[] = [];
    const recordRows: Array<Record<string, unknown>> = [];

    rawArray.forEach((item, idx) => {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        recordRows.push(item as Record<string, unknown>);
      } else {
        invalidObjectIndices.push(`JSON fila ${idx + 1}: debe ser un objeto válido.`);
      }
    });

    if (invalidObjectIndices.length > 0) {
      return { rows: [], errors: invalidObjectIndices, hasInput: true };
    }

    return validateAndNormalizeRows(recordRows, 'JSON');
  } catch {
    return {
      rows: [],
      errors: ['JSON malformado. Verifica comillas, llaves y comas.'],
      hasInput: true,
    };
  }
}

function extractApiErrorMessages(err: unknown): { banner: string; details: string[] } {
  if (!(err instanceof ApiError)) {
    return {
      banner: err instanceof Error ? err.message : 'Error al importar paquetes.',
      details: [],
    };
  }

  const details: string[] = [];
  const data = err.data;

  const pushEntry = (entry: unknown) => {
    if (typeof entry === 'string' && entry.trim()) {
      details.push(entry.trim());
      return;
    }
    if (typeof entry === 'object' && entry !== null) {
      const rec = entry as Record<string, unknown>;
      const msg =
        typeof rec.message === 'string'
          ? rec.message
          : typeof rec.error === 'string'
            ? rec.error
            : null;
      const pathArr = Array.isArray(rec.path)
        ? rec.path.filter((p) => typeof p === 'string' || typeof p === 'number')
        : typeof rec.path === 'string'
          ? [rec.path]
          : [];
      const rowIdx = typeof rec.row === 'number' ? `Fila ${rec.row}: ` : '';
      if (msg) {
        const pathLabel =
          pathArr.length > 0 && !msg.startsWith('CSV row') && !msg.startsWith('Row ')
            ? `[${pathArr.join('.')}] `
            : '';
        details.push(`${rowIdx}${pathLabel}${msg}`);
      }
    }
  };

  if (typeof data === 'object' && data !== null) {
    const rec = data as Record<string, unknown>;
    const candidateArrays = [rec.details, rec.errors, rec.issues, rec.conflicts];
    candidateArrays.forEach((arr) => {
      if (Array.isArray(arr)) {
        arr.forEach(pushEntry);
      }
    });

    if (Array.isArray(rec.duplicates) && rec.duplicates.length > 0) {
      details.push(
        `Códigos de tracking ya existentes: ${rec.duplicates.map(String).join(', ')}`
      );
    }
    if (Array.isArray(rec.trackingCodes) && rec.trackingCodes.length > 0) {
      details.push(`Códigos en conflicto: ${rec.trackingCodes.map(String).join(', ')}`);
    }
  }

  return {
    banner: err.message || 'No se pudo completar la importación masiva.',
    details: Array.from(new Set(details)),
  };
}

export function BulkImportModal({
  isOpen,
  onClose,
  token,
  zones,
  onImported,
}: BulkImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState<ImportFormat>('csv');
  const [rawInput, setRawInput] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [defaultZoneId, setDefaultZoneId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [serverBanner, setServerBanner] = useState('');
  const [serverErrors, setServerErrors] = useState<string[]>([]);

  const preview = useMemo(() => parseBulkPreview(rawInput, format), [rawInput, format]);

  const resetFeedback = () => {
    setResult(null);
    setServerBanner('');
    setServerErrors([]);
  };

  const handleFormatSwitch = (nextFormat: ImportFormat) => {
    if (nextFormat === format) return;
    setFormat(nextFormat);
    resetFeedback();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      setServerBanner('El archivo supera el límite máximo permitido de 5 MB.');
      setServerErrors([]);
      return;
    }

    const lowerName = file.name.toLowerCase();
    const detectedFormat: ImportFormat =
      lowerName.endsWith('.json') || file.type.includes('json') ? 'json' : 'csv';

    try {
      const content = await file.text();
      setFormat(detectedFormat);
      setRawInput(content);
      setFileName(file.name);
      resetFeedback();
    } catch {
      setServerBanner('No se pudo leer el archivo seleccionado.');
      setServerErrors([]);
    }
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'plantilla-paquetes-bulk.csv';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const handleLoadSample = () => {
    setRawInput(format === 'csv' ? SAMPLE_CSV : SAMPLE_JSON);
    setFileName(null);
    resetFeedback();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || submitting || result) return;

    resetFeedback();

    if (!preview.hasInput) {
      setServerBanner('Carga un archivo .csv/.json o pega el contenido antes de importar.');
      return;
    }

    if (preview.errors.length > 0) {
      setServerBanner('Corrige los errores detectados antes de enviar el lote.');
      return;
    }

    setSubmitting(true);
    try {
      const payload =
        format === 'csv' && !defaultZoneId
          ? { csv: rawInput }
          : {
              packages: preview.rows.map((row) => ({
                ...row,
                ...(defaultZoneId && !row.zoneId ? { zoneId: defaultZoneId } : {}),
              })),
            };

      const response = await packageService.bulkCreatePackages(token, payload);
      setResult(response);
      toast.success(
        `${response.count} ${response.count === 1 ? 'paquete importado' : 'paquetes importados'}`
      );
      await onImported();
    } catch (err) {
      const parsed = extractApiErrorMessages(err);
      setServerBanner(parsed.banner);
      setServerErrors(parsed.details);
      toast.error(parsed.banner);
    } finally {
      setSubmitting(false);
    }
  };

  const handleModalClose = () => {
    if (submitting) return;
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleModalClose}
      size="xl"
      title="Importación Masiva de Paquetes"
      subtitle="Carga hasta 500 envíos mediante archivo o pegado directo en formato CSV o JSON."
      icon={<Upload className="h-4 w-4" />}
      closeOnBackdropClick={!submitting}
      closeOnEscape={!submitting}
      footer={
        <>
          <button
            type="button"
            onClick={handleModalClose}
            disabled={submitting}
            className="min-h-[40px] px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/80 rounded-lg transition-colors disabled:opacity-50"
          >
            {result ? 'Cerrar' : 'Cancelar'}
          </button>
          <button
            type="submit"
            form="bulk-import-form"
            disabled={
              submitting ||
              Boolean(result) ||
              !preview.hasInput ||
              preview.errors.length > 0 ||
              preview.rows.length === 0
            }
            className="min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 rounded-lg shadow-lg shadow-brand-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Importando...</span>
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                <span className="tabular-nums">
                  Importar {preview.rows.length > 0 ? `(${preview.rows.length})` : ''}
                </span>
              </>
            )}
          </button>
        </>
      }
    >
      <form id="bulk-import-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Format Toggle + Upload Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-slate-800/80 bg-slate-950 p-1 self-start">
            <button
              type="button"
              onClick={() => handleFormatSwitch('csv')}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                format === 'csv'
                  ? 'bg-brand-500/15 text-brand-300 border border-brand-500/30'
                  : 'text-slate-400 hover:text-white border border-transparent'
              )}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              CSV
            </button>
            <button
              type="button"
              onClick={() => handleFormatSwitch('json')}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                format === 'json'
                  ? 'bg-brand-500/15 text-brand-300 border border-brand-500/30'
                  : 'text-slate-400 hover:text-white border border-transparent'
              )}
            >
              <FileJson className="h-3.5 w-3.5" />
              JSON
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700/80 bg-slate-800/80 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors"
            >
              <Upload className="h-3.5 w-3.5 text-brand-400" />
              Subir archivo .csv/.json
            </button>
            <button
              type="button"
              onClick={handleLoadSample}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800/80 bg-slate-950 hover:bg-slate-800 text-xs font-medium text-slate-300 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              Cargar ejemplo
            </button>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800/80 bg-slate-950 hover:bg-slate-800 text-xs font-medium text-slate-300 transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-slate-400" />
              Plantilla CSV
            </button>
          </div>
        </div>

        {/* Default Zone Override + Column Spec */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-slate-800/80 bg-slate-950/60 p-3">
          <div className="space-y-1">
            <label
              htmlFor="bulk-default-zone"
              className="block text-xs font-medium text-slate-300"
            >
              Zona por defecto (opcional)
            </label>
            <select
              id="bulk-default-zone"
              value={defaultZoneId}
              onChange={(e) => {
                setDefaultZoneId(e.target.value);
                resetFeedback();
              }}
              className="w-full rounded-lg border border-slate-800/80 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:border-brand-500 focus:outline-none"
            >
              <option value="">Usar zoneId de cada fila o autodetección</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name} {zone.isActive ? '(Activa)' : '(Inactiva)'}
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs text-slate-400 flex flex-col justify-center">
            <span className="font-medium text-slate-300">Campos requeridos:</span>
            <code className="mt-1 font-mono text-[11px] text-brand-300 break-all">
              trackingCode, recipientName, recipientAddress, recipientPhone
            </code>
          </div>
        </div>

        {/* File indicator & Raw Editor */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-400">
              {fileName ? (
                <>
                  Archivo: <span className="font-mono text-slate-200">{fileName}</span>
                </>
              ) : (
                `Pega contenido ${format.toUpperCase()} directamente:`
              )}
            </span>
            {rawInput && (
              <button
                type="button"
                onClick={() => {
                  setRawInput('');
                  setFileName(null);
                  resetFeedback();
                }}
                className="inline-flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Limpiar
              </button>
            )}
          </div>

          <textarea
            value={rawInput}
            onChange={(e) => {
              setRawInput(e.target.value);
              resetFeedback();
            }}
            rows={8}
            spellCheck={false}
            placeholder={
              format === 'csv'
                ? 'trackingCode,recipientName,recipientAddress,recipientPhone\nTRK-0001,Juan Pérez,Av. Principal 123,+5493511234567'
                : '[\n  {\n    "trackingCode": "TRK-0001",\n    "recipientName": "Juan Pérez",\n    "recipientAddress": "Av. Principal 123",\n    "recipientPhone": "+5493511234567"\n  }\n]'
            }
            className="w-full rounded-xl border border-slate-800/80 bg-slate-950 p-3 font-mono text-xs text-slate-100 placeholder-slate-500 focus:border-brand-500 focus:outline-none custom-scrollbar"
          />
        </div>

        {/* Client Pre-flight Status */}
        {preview.hasInput && (
          <div
            className={clsx(
              'rounded-xl border p-3 text-xs',
              preview.errors.length > 0
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
            )}
          >
            {preview.errors.length > 0 ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                  <span className="tabular-nums">
                    Se encontraron {preview.errors.length}{' '}
                    {preview.errors.length === 1 ? 'error de validación' : 'errores de validación'}
                  </span>
                </div>
                <ul className="max-h-32 overflow-y-auto custom-scrollbar space-y-1 pl-6 list-disc text-amber-200/90">
                  {preview.errors.map((errMsg, idx) => (
                    <li key={idx}>{errMsg}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span className="tabular-nums">
                    {preview.rows.length}{' '}
                    {preview.rows.length === 1 ? 'fila lista' : 'filas listas'} para importar
                  </span>
                </span>
                <span className="font-mono text-[11px] text-emerald-300/90 tabular-nums">
                  Límite: {preview.rows.length}/{MAX_BULK_ROWS}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Server Error Banner & Row Details */}
        {serverBanner && (
          <div
            role="alert"
            className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-200 space-y-2"
          >
            <div className="flex items-start gap-2 font-semibold">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <span>{serverBanner}</span>
            </div>
            {serverErrors.length > 0 && (
              <ul className="max-h-36 overflow-y-auto custom-scrollbar space-y-1 pl-6 list-disc text-red-200/90">
                {serverErrors.map((detail, idx) => (
                  <li key={idx}>{detail}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Success Summary */}
        {result && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <span>Importación completada exitosamente</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/70 p-2.5">
                <p className="text-lg font-bold text-white tabular-nums">{result.count}</p>
                <p className="text-[11px] text-slate-400">Creados</p>
              </div>
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/70 p-2.5">
                <p className="text-lg font-bold text-brand-300 tabular-nums">
                  {result.assignedCount}
                </p>
                <p className="text-[11px] text-slate-400">Asignados</p>
              </div>
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/70 p-2.5">
                <p className="text-lg font-bold text-amber-300 tabular-nums">
                  {result.pendingCount}
                </p>
                <p className="text-[11px] text-slate-400">Pendientes</p>
              </div>
            </div>

            {result.items.length > 0 && (
              <div className="max-h-28 overflow-y-auto custom-scrollbar rounded-lg border border-slate-800/80 bg-slate-950/60 p-2 flex flex-wrap gap-1.5">
                {result.items.map((item) => (
                  <span
                    key={item.id}
                    className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-slate-200 tabular-nums"
                  >
                    {item.trackingCode}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
