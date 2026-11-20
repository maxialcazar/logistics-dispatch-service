import { z } from "zod";
import { PackageStatus } from "@prisma/client";
import { CsvParseError, parseCsv } from "../utils/csv";

const validPackageStatuses = new Set<string>(Object.values(PackageStatus));
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const isoDateSchema = z.iso.date();
const isoDateTimeSchema = z.iso.datetime({ offset: true, local: true });

/**
 * Parses a YYYY-MM-DD or ISO 8601 datetime filter into a Date boundary.
 * Date-only strings expand to UTC start/end of day so dateTo is inclusive.
 */
export function parseDateBoundary(value: string, boundary: "start" | "end"): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (DATE_ONLY_REGEX.test(trimmed)) {
    if (!isoDateSchema.safeParse(trimmed).success) {
      return null;
    }
    const [yearStr, monthStr, dayStr] = trimmed.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);

    const parsed =
      boundary === "start"
        ? new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
        : new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return null;
    }
    return parsed;
  }

  if (!isoDateTimeSchema.safeParse(trimmed).success) {
    return null;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const optionalUuidQuerySchema = z
  .string()
  .trim()
  .refine((val) => val === "" || z.string().uuid().safeParse(val).success, {
    message: "Invalid UUID format",
  })
  .optional();

const optionalDateFilterSchema = z
  .string()
  .trim()
  .refine((val) => val === "" || parseDateBoundary(val, "start") !== null, {
    message: "Invalid date format. Expected YYYY-MM-DD or ISO 8601 datetime",
  })
  .optional();

function hasValidDateRange(query: { dateFrom?: string; dateTo?: string }): boolean {
  const from = query.dateFrom?.trim();
  const to = query.dateTo?.trim();
  if (!from || !to) return true;
  const fromDate = parseDateBoundary(from, "start");
  const toDate = parseDateBoundary(to, "end");
  if (!fromDate || !toDate) return true;
  return fromDate <= toDate;
}

const packageFilterQueryFields = {
  search: z.string().trim().max(200).optional(),
  trackingCode: z.string().trim().max(100).optional(),
  status: z
    .string()
    .trim()
    .refine(
      (val) => {
        if (val === "") return true;
        const parts = val.split(",").map((s) => s.trim());
        return parts.length > 0 && parts.every((s) => validPackageStatuses.has(s));
      },
      {
        message:
          "Invalid status value. Allowed: pending, assigned, in_transit, delivered, cancelled",
      }
    )
    .optional(),
  zoneId: optionalUuidQuerySchema,
  driverId: optionalUuidQuerySchema,
  dateFrom: optionalDateFilterSchema,
  dateTo: optionalDateFilterSchema,
  isArchived: z
    .string()
    .trim()
    .refine((val) => val === "" || val === "true" || val === "false", {
      message: "isArchived must be 'true' or 'false'",
    })
    .optional(),
};

export const getPackagesSchema = z.object({
  query: z
    .object({
      ...packageFilterQueryFields,
      page: z.unknown().optional(),
      limit: z.unknown().optional(),
    })
    .refine(hasValidDateRange, {
      message: "dateFrom must be earlier than or equal to dateTo",
      path: ["dateFrom"],
    }),
});

export const exportPackagesSchema = z.object({
  query: z
    .object(packageFilterQueryFields)
    .refine(hasValidDateRange, {
      message: "dateFrom must be earlier than or equal to dateTo",
      path: ["dateFrom"],
    }),
});

export const getDashboardStatsSchema = z.object({
  query: z
    .object({
      dateFrom: optionalDateFilterSchema,
      dateTo: optionalDateFilterSchema,
    })
    .refine(hasValidDateRange, {
      message: "dateFrom must be earlier than or equal to dateTo",
      path: ["dateFrom"],
    }),
});

const optionalNoteSchema = z.string().trim().max(1000).nullable().optional();

function hasValidDeliveryWindow(body: {
  deliveryWindowStart?: string | null;
  deliveryWindowEnd?: string | null;
}): boolean {
  if (!body.deliveryWindowStart || !body.deliveryWindowEnd) return true;
  return new Date(body.deliveryWindowStart) <= new Date(body.deliveryWindowEnd);
}

export const createPackageSchema = z.object({
  body: z
    .object({
      trackingCode: z.string().min(5),

      // Recipient Info
      recipientName: z.string().min(2),
      recipientAddress: z.string().min(5),
      recipientPhone: z.string().min(3),
      recipientEmail: z.string().email().optional(),

      // Delivery Details
      addressReferences: z.string().optional(),
      addressStreet: z.string().optional(),
      addressNumber: z.string().optional(),
      addressFloor: z.string().trim().nullable().optional(),
      addressCity: z.string().trim().nullable().optional(),
      addressZip: z.string().trim().nullable().optional(),
      addressCountry: z.string().optional(),

      // Sender Info (Optional)
      senderName: z.string().optional().or(z.literal("")),
      senderAddress: z.string().optional().or(z.literal("")),
      senderPhone: z.string().optional().or(z.literal("")),

      // Logistics
      weight: z.number().optional().nullable(),
      volume: z.number().optional().nullable(),
      zoneId: z.string().uuid().optional(),

      // Coordinates & Windows
      lat: z.number().nullable().optional(),
      lng: z.number().nullable().optional(),
      estimatedDeliveryAt: isoDateTimeSchema.nullable().optional(),
      deliveryWindowStart: isoDateTimeSchema.nullable().optional(),
      deliveryWindowEnd: isoDateTimeSchema.nullable().optional(),
    })
    .refine(hasValidDeliveryWindow, {
      message: "deliveryWindowStart must be earlier than or equal to deliveryWindowEnd",
      path: ["deliveryWindowStart"],
    }),
});

export const updatePackageStatusSchema = z.object({
  params: z.object({
    packageId: z.string().uuid(),
  }),
  body: z.object({
    status: z.enum(["pending", "assigned", "in_transit", "delivered", "cancelled"]),
    lat: z.number().optional(),
    lng: z.number().optional(),
    estimatedDeliveryAt: isoDateTimeSchema.optional(),
    // Proof of Delivery (POD) - only relevant when status is 'delivered'
    signature: z.string().optional(), // Base64 data URI of the recipient's signature
    photo: z.string().optional(),     // Base64 data URI of the delivery photo evidence
    notes: optionalNoteSchema,
    reason: optionalNoteSchema,
    deliveryNotes: optionalNoteSchema,
  }),
});

export const assignPackageSchema = z.object({
  params: z.object({
    packageId: z.string().uuid(),
  }),
  body: z.object({
    driverId: z.string().uuid(),
  }),
});

export const getPackagesByDriverSchema = z.object({
  params: z.object({
    driverId: z.string().uuid(),
  }),
});

export const getPackageByIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const updatePackageSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z
    .object({
      recipientName: z.string().trim().min(2).optional(),
      recipientAddress: z.string().trim().min(5).optional(),
      recipientPhone: z.string().trim().min(3).optional(),
      recipientEmail: z.string().trim().email().nullable().optional(),
      addressStreet: z.string().trim().nullable().optional(),
      addressNumber: z.string().trim().nullable().optional(),
      addressFloor: z.string().trim().nullable().optional(),
      addressCity: z.string().trim().nullable().optional(),
      addressZip: z.string().trim().nullable().optional(),
      addressReferences: z.string().trim().nullable().optional(),
      senderName: z.string().trim().nullable().optional(),
      senderAddress: z.string().trim().nullable().optional(),
      senderPhone: z.string().trim().nullable().optional(),
      weight: z.number().nonnegative().nullable().optional(),
      volume: z.number().nonnegative().nullable().optional(),
      zoneId: z.string().uuid().nullable().optional(),
      lat: z.number().min(-90).max(90).nullable().optional(),
      lng: z.number().min(-180).max(180).nullable().optional(),
      estimatedDeliveryAt: isoDateTimeSchema.nullable().optional(),
      deliveryWindowStart: isoDateTimeSchema.nullable().optional(),
      deliveryWindowEnd: isoDateTimeSchema.nullable().optional(),
    })
    .refine((body) => Object.values(body).some((val) => val !== undefined), {
      message: "At least one editable field must be provided",
    })
    .refine(hasValidDeliveryWindow, {
      message: "deliveryWindowStart must be earlier than or equal to deliveryWindowEnd",
      path: ["deliveryWindowStart"],
    }),
});

export const unarchivePackagesSchema = z.object({
  body: z.object({
    packageIds: z.array(z.string().uuid()).min(1, "At least one packageId is required"),
  }),
});

export const MAX_BULK_PACKAGES = 500;

const DECIMAL_NUMBER_REGEX = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

const BULK_CSV_HEADER_ALIASES: Record<string, string> = {
  trackingcode: "trackingCode",
  tracking_code: "trackingCode",
  recipientname: "recipientName",
  recipient_name: "recipientName",
  recipientaddress: "recipientAddress",
  recipient_address: "recipientAddress",
  recipientphone: "recipientPhone",
  recipient_phone: "recipientPhone",
  recipientemail: "recipientEmail",
  recipient_email: "recipientEmail",
  addressstreet: "addressStreet",
  address_street: "addressStreet",
  addressnumber: "addressNumber",
  address_number: "addressNumber",
  addressfloor: "addressFloor",
  address_floor: "addressFloor",
  addresscity: "addressCity",
  address_city: "addressCity",
  addresszip: "addressZip",
  address_zip: "addressZip",
  addresscountry: "addressCountry",
  address_country: "addressCountry",
  addressreferences: "addressReferences",
  address_references: "addressReferences",
  sendername: "senderName",
  sender_name: "senderName",
  senderaddress: "senderAddress",
  sender_address: "senderAddress",
  senderphone: "senderPhone",
  sender_phone: "senderPhone",
  weight: "weight",
  volume: "volume",
  zoneid: "zoneId",
  zone_id: "zoneId",
  lat: "lat",
  lng: "lng",
  estimateddeliveryat: "estimatedDeliveryAt",
  estimated_delivery_at: "estimatedDeliveryAt",
  deliverywindowstart: "deliveryWindowStart",
  delivery_window_start: "deliveryWindowStart",
  deliverywindowend: "deliveryWindowEnd",
  delivery_window_end: "deliveryWindowEnd",
};

const REQUIRED_CSV_HEADERS = [
  "trackingCode",
  "recipientName",
  "recipientAddress",
  "recipientPhone",
] as const;

const CSV_NUMERIC_FIELDS = new Set(["weight", "volume", "lat", "lng"]);
const CSV_REQUIRED_STRING_FIELDS = new Set<string>(REQUIRED_CSV_HEADERS);

function normalizeBulkCsvHeader(header: string): string {
  const key = header.trim().toLowerCase();
  return BULK_CSV_HEADER_ALIASES[key] ?? header.trim();
}

function normalizeBulkCsvRow(row: Record<string, string>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(row)) {
    const trimmed = rawValue.trim();
    if (CSV_REQUIRED_STRING_FIELDS.has(key)) {
      normalized[key] = trimmed;
      continue;
    }
    if (trimmed === "") {
      normalized[key] = undefined;
      continue;
    }
    if (CSV_NUMERIC_FIELDS.has(key)) {
      normalized[key] = DECIMAL_NUMBER_REGEX.test(trimmed) ? Number(trimmed) : trimmed;
      continue;
    }
    normalized[key] = trimmed;
  }
  return normalized;
}

export const bulkPackageRowSchema = z
  .object({
    trackingCode: z.string().trim().min(5),
    recipientName: z.string().trim().min(2),
    recipientAddress: z.string().trim().min(5),
    recipientPhone: z.string().trim().min(3),
    recipientEmail: z.string().trim().email().nullable().optional(),
    addressReferences: z.string().trim().nullable().optional(),
    addressStreet: z.string().trim().nullable().optional(),
    addressNumber: z.string().trim().nullable().optional(),
    addressFloor: z.string().trim().nullable().optional(),
    addressCity: z.string().trim().nullable().optional(),
    addressZip: z.string().trim().nullable().optional(),
    addressCountry: z.string().trim().nullable().optional(),
    senderName: z.string().trim().nullable().optional().or(z.literal("")),
    senderAddress: z.string().trim().nullable().optional().or(z.literal("")),
    senderPhone: z.string().trim().nullable().optional().or(z.literal("")),
    weight: z.number().nonnegative().nullable().optional(),
    volume: z.number().nonnegative().nullable().optional(),
    zoneId: z.string().trim().uuid().nullable().optional(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    estimatedDeliveryAt: isoDateTimeSchema.nullable().optional(),
    deliveryWindowStart: isoDateTimeSchema.nullable().optional(),
    deliveryWindowEnd: isoDateTimeSchema.nullable().optional(),
  })
  .refine(hasValidDeliveryWindow, {
    message: "deliveryWindowStart must be earlier than or equal to deliveryWindowEnd",
    path: ["deliveryWindowStart"],
  });

export type BulkPackageRowInput = z.infer<typeof bulkPackageRowSchema>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Extracts, normalizes, and validates bulk package rows from:
 * - raw CSV string (`Content-Type: text/csv`)
 * - `{ csv: string }`
 * - `{ packages: [...] }`
 * - top-level JSON array `[...]`
 */
export function parseBulkPackagesBody(
  body: unknown,
  ctx?: z.RefinementCtx
): BulkPackageRowInput[] {
  const reportIssue = (path: PropertyKey[], message: string) => {
    if (ctx) {
      ctx.addIssue({ code: "custom", path, message });
      return;
    }
    throw new Error(message);
  };

  let rawRows: unknown[] | null = null;
  let pathPrefix: PropertyKey[] = [];
  let isCsvSource = false;

  const extractFromCsv = (csvText: string, prefix: PropertyKey[]) => {
    isCsvSource = true;
    pathPrefix = prefix;
    try {
      const parsed = parseCsv(csvText, {
        maxRows: MAX_BULK_PACKAGES + 1,
        normalizeHeader: normalizeBulkCsvHeader,
      });
      if (parsed.headers.length === 0) {
        reportIssue(prefix, "CSV payload cannot be empty");
        return;
      }
      const missingHeaders = REQUIRED_CSV_HEADERS.filter((h) => !parsed.headers.includes(h));
      if (missingHeaders.length > 0) {
        reportIssue(prefix, `Missing required CSV column(s): ${missingHeaders.join(", ")}`);
        return;
      }
      rawRows = parsed.rows.map(normalizeBulkCsvRow);
    } catch (err) {
      const msg = err instanceof CsvParseError ? err.message : "Invalid CSV format";
      reportIssue(prefix, msg);
    }
  };

  if (typeof body === "string") {
    extractFromCsv(body, ["rows"]);
  } else if (Array.isArray(body)) {
    rawRows = body;
    pathPrefix = [];
  } else if (isPlainRecord(body)) {
    const hasPackages = body.packages !== undefined;
    const hasCsv = body.csv !== undefined;

    if (hasPackages && hasCsv) {
      reportIssue([], "Provide either 'packages' or 'csv', not both");
    } else if (hasPackages) {
      if (!Array.isArray(body.packages)) {
        reportIssue(["packages"], "'packages' must be an array");
      } else {
        rawRows = body.packages;
        pathPrefix = ["packages"];
      }
    } else if (hasCsv) {
      if (typeof body.csv !== "string") {
        reportIssue(["csv"], "'csv' must be a string");
      } else {
        extractFromCsv(body.csv, ["csv"]);
      }
    } else {
      reportIssue(
        [],
        "Request body must be a non-empty array, { packages: [...] }, { csv: '...' }, or text/csv"
      );
    }
  } else {
    reportIssue(
      [],
      "Request body must be a non-empty array, { packages: [...] }, { csv: '...' }, or text/csv"
    );
  }

  if (!rawRows) {
    return [];
  }

  if (rawRows.length === 0) {
    reportIssue(pathPrefix, "At least 1 package is required");
    return [];
  }

  if (rawRows.length > MAX_BULK_PACKAGES) {
    reportIssue(
      pathPrefix,
      `Maximum ${MAX_BULK_PACKAGES} packages allowed per bulk request (received ${rawRows.length})`
    );
    return [];
  }

  const parsedRows: BulkPackageRowInput[] = [];
  const seenTrackingCodes = new Map<string, number>();

  rawRows.forEach((row, index) => {
    const result = bulkPackageRowSchema.safeParse(row);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const prefixLabel = isCsvSource ? `CSV row ${index + 1}` : `Row ${index + 1}`;
        reportIssue(
          [...pathPrefix, index, ...issue.path],
          `${prefixLabel}: ${issue.message}`
        );
      }
      return;
    }

    const firstRowIdx = seenTrackingCodes.get(result.data.trackingCode);
    if (firstRowIdx !== undefined) {
      reportIssue(
        [...pathPrefix, index, "trackingCode"],
        `Duplicate trackingCode '${result.data.trackingCode}' in bulk payload (first seen at row ${firstRowIdx + 1})`
      );
      return;
    }

    seenTrackingCodes.set(result.data.trackingCode, index);
    parsedRows.push(result.data);
  });

  return parsedRows;
}

export const bulkCreatePackagesSchema = z.object({
  body: z.unknown().superRefine((body, ctx) => {
    parseBulkPackagesBody(body, ctx);
  }),
});
