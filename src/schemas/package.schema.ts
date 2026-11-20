import { z } from "zod";
import { PackageStatus } from "@prisma/client";

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

export const getPackagesSchema = z.object({
  query: z
    .object({
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
      page: z.unknown().optional(),
      limit: z.unknown().optional(),
    })
    .refine(
      (query) => {
        const from = query.dateFrom?.trim();
        const to = query.dateTo?.trim();
        if (!from || !to) return true;
        const fromDate = parseDateBoundary(from, "start");
        const toDate = parseDateBoundary(to, "end");
        if (!fromDate || !toDate) return true;
        return fromDate <= toDate;
      },
      {
        message: "dateFrom must be earlier than or equal to dateTo",
        path: ["dateFrom"],
      }
    ),
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
