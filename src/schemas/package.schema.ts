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

export const createPackageSchema = z.object({
  body: z.object({
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
    addressCity: z.string().optional(),
    addressCountry: z.string().optional(),

    // Sender Info (Optional)
    senderName: z.string().optional().or(z.literal("")),
    senderAddress: z.string().optional().or(z.literal("")),
    senderPhone: z.string().optional().or(z.literal("")),

    // Logistics
    weight: z.number().optional().nullable(),
    volume: z.number().optional().nullable(),
    zoneId: z.string().uuid().optional(), // Make optional if auto-zone logic exists? No, keep required for now as per controller logic.
    
    // Coordinates
    lat: z.number().nullable().optional(),
    lng: z.number().nullable().optional(),
    estimatedDeliveryAt: z.string().datetime().optional(),
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
    estimatedDeliveryAt: z.string().datetime().optional(),
    // Proof of Delivery (POD) - only relevant when status is 'delivered'
    signature: z.string().optional(), // Base64 data URI of the recipient's signature
    photo: z.string().optional(),     // Base64 data URI of the delivery photo evidence
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
