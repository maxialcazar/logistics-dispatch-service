import { randomUUID } from "crypto";
import { prisma } from "../prisma";
// Force recompile after prisma generate
import { PackageStatus, Prisma } from "@prisma/client";
import { emitToRoom } from "../websocket";
import { geocodeAddress } from "../utils/geocoder";
import { saveBase64Image, deleteUploadedFile } from "../utils/fileUpload";
import { pointInPolygon } from "../utils/geofencing";
import { serializeCsv } from "../utils/csv";
import { ZoneService } from "./zone.service";
import { parseDateBoundary } from "../schemas/package.schema";
import { redis } from "../redis";

export interface CreatePackageInput {
  trackingCode: string;
  recipientName: string;
  recipientAddress: string;
  recipientPhone: string;
  recipientEmail?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressFloor?: string | null;
  addressCity?: string | null;
  addressZip?: string | null;
  addressCountry?: string | null;
  addressReferences?: string | null;
  senderName?: string | null;
  senderAddress?: string | null;
  senderPhone?: string | null;
  weight?: number | null;
  volume?: number | null;
  zoneId?: string | null;
  userId: string;
  lat?: number | null;
  lng?: number | null;
  estimatedDeliveryAt?: Date | null;
  deliveryWindowStart?: Date | null;
  deliveryWindowEnd?: Date | null;
}

export type BulkCreatePackageItemInput = Omit<CreatePackageInput, "userId">;

export interface PackageFilterInput {
  search?: string;
  status?: PackageStatus | string;
  zoneId?: string;
  driverId?: string;
  trackingCode?: string;
  dateFrom?: Date | string;
  dateTo?: Date | string;
  isArchived?: boolean;
}

export class PackageBulkError extends Error {
  readonly code: "zone_not_found" | "duplicate_tracking_codes";
  readonly details: string[];

  constructor(
    code: "zone_not_found" | "duplicate_tracking_codes",
    message: string,
    details: string[] = []
  ) {
    super(message);
    this.name = "PackageBulkError";
    this.code = code;
    this.details = details;
  }
}

export interface UpdatePackageInput {
  recipientName?: string;
  recipientAddress?: string;
  recipientPhone?: string;
  recipientEmail?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressFloor?: string | null;
  addressCity?: string | null;
  addressZip?: string | null;
  addressReferences?: string | null;
  senderName?: string | null;
  senderAddress?: string | null;
  senderPhone?: string | null;
  weight?: number | null;
  volume?: number | null;
  zoneId?: string | null;
  lat?: number | null;
  lng?: number | null;
  estimatedDeliveryAt?: Date | null;
  deliveryWindowStart?: Date | null;
  deliveryWindowEnd?: Date | null;
}

export interface DashboardStatsFilters {
  dateFrom?: Date | string;
  dateTo?: Date | string;
}

const MAX_DENSE_WEEKLY_DAYS = 366;
const STATS_CACHE_TTL_SECONDS = 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_EXPORT_PACKAGES = 10000;
const GEOCODE_BATCH_CONCURRENCY = 5;

const PACKAGE_EXPORT_HEADERS = [
  "id",
  "trackingCode",
  "status",
  "recipientName",
  "recipientAddress",
  "recipientPhone",
  "recipientEmail",
  "addressStreet",
  "addressNumber",
  "addressFloor",
  "addressCity",
  "addressZip",
  "addressReferences",
  "senderName",
  "senderAddress",
  "senderPhone",
  "weight",
  "volume",
  "lat",
  "lng",
  "zoneId",
  "zoneName",
  "driverId",
  "driverName",
  "estimatedDeliveryAt",
  "deliveryWindowStart",
  "deliveryWindowEnd",
  "isArchived",
  "createdAt",
  "updatedAt",
] as const;

export class PackageService {
  private static async invalidatePackageCache(companyId: string): Promise<void> {
    await redis.delPrefix(`packages:${companyId}:`);
  }
  private static normalizeNullableText(val: string | null | undefined): string | null | undefined {
    if (val === undefined) return undefined;
    if (val === null) return null;
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private static assertValidOptionalDate(val: Date | null | undefined): void {
    if (val instanceof Date && Number.isNaN(val.getTime())) {
      throw new Error("invalid_date_filter");
    }
  }

  private static validateDeliveryWindow(
    start: Date | null | undefined,
    end: Date | null | undefined
  ): void {
    if (start && end && start > end) {
      throw new Error("invalid_delivery_window");
    }
  }

  private static buildGeocodeQuery(input: {
    recipientAddress?: string | null;
    addressStreet?: string | null;
    addressNumber?: string | null;
    addressCity?: string | null;
    addressCountry?: string | null;
  }): string | null {
    const trimmedRecipient = input.recipientAddress?.trim();
    if (!trimmedRecipient) return null;

    const street = input.addressStreet?.trim();
    const number = input.addressNumber?.trim();
    const hasStreetAndNumber = Boolean(street && number);
    const baseStreet = hasStreetAndNumber ? `${street} ${number}` : trimmedRecipient;

    const normalizeText = (value: string) =>
      value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    const normalizedRecipient = normalizeText(trimmedRecipient);

    const recipientParts = trimmedRecipient
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const localityTerms = [input.addressCity?.trim(), input.addressCountry?.trim()].filter(
      (term): term is string => Boolean(term)
    );
    const missingLocalityTerms = hasStreetAndNumber
      ? localityTerms
      : localityTerms.filter((term) => !normalizedRecipient.includes(normalizeText(term)));
    const explicitLocalityFromField = missingLocalityTerms.join(", ");
    const explicitLocalityFromAddress =
      recipientParts.length >= 2 ? recipientParts.slice(1).join(", ") : "";
    const hasInlineCountryOrCity =
      /\b(argentina|cordoba|buenos aires|caba|rosario|mendoza|chile|uruguay|brasil|brazil|mexico|colombia|peru|espana|spain|usa)\b/i.test(
        normalizedRecipient
      );

    if (explicitLocalityFromField) {
      return `${baseStreet}, ${explicitLocalityFromField}`;
    }
    if (localityTerms.length > 0) {
      return trimmedRecipient;
    }
    if (explicitLocalityFromAddress) {
      return hasStreetAndNumber
        ? `${baseStreet}, ${explicitLocalityFromAddress}`
        : trimmedRecipient;
    }
    if (hasInlineCountryOrCity) {
      return trimmedRecipient;
    }
    return `${baseStreet}, Cordoba, Argentina`;
  }

  private static resolveStatusHistoryNote(params: {
    status: PackageStatus;
    signatureUrl?: string;
    photoUrl?: string;
    notes?: string | null;
    reason?: string | null;
    deliveryNotes?: string | null;
  }): { customNote: string | null; historyNotes: string } {
    const normalizedNotes = PackageService.normalizeNullableText(params.notes);
    const normalizedDeliveryNotes = PackageService.normalizeNullableText(params.deliveryNotes);
    const normalizedReason = PackageService.normalizeNullableText(params.reason);

    const noteBody =
      normalizedNotes && normalizedDeliveryNotes && normalizedNotes !== normalizedDeliveryNotes
        ? `${normalizedNotes}; ${normalizedDeliveryNotes}`
        : (normalizedNotes ?? normalizedDeliveryNotes ?? null);

    let customNote: string | null = null;
    if (normalizedReason && noteBody) {
      customNote =
        normalizedReason === noteBody ? normalizedReason : `${normalizedReason}: ${noteBody}`;
    } else {
      customNote = normalizedReason ?? noteBody ?? null;
    }

    if (customNote) {
      const historyNotes =
        params.status === "delivered" && (params.signatureUrl || params.photoUrl)
          ? `${customNote} (evidencia: firma=${!!params.signatureUrl}, foto=${!!params.photoUrl})`
          : customNote;
      return { customNote, historyNotes };
    }

    const defaultNotes =
      params.status === "delivered"
        ? `Entregado con evidencia: firma=${!!params.signatureUrl}, foto=${!!params.photoUrl}`
        : `Status updated to ${params.status}`;
    return { customNote: null, historyNotes: defaultNotes };
  }

  private static resolveDateFilter(
    value: Date | string | undefined,
    boundary: "start" | "end"
  ): Date | undefined {
    if (value === undefined) return undefined;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        throw new Error("invalid_date_filter");
      }
      return value;
    }
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = parseDateBoundary(trimmed, boundary);
    if (!parsed) {
      throw new Error("invalid_date_filter");
    }
    return parsed;
  }

  private static buildPackageWhere(
    companyId: string,
    filters: PackageFilterInput
  ): Prisma.PackageWhereInput {
    const {
      search,
      status,
      zoneId,
      driverId,
      trackingCode,
      dateFrom,
      dateTo,
      isArchived = false,
    } = filters;

    const where: Prisma.PackageWhereInput = { companyId, isArchived };
    const andConditions: Prisma.PackageWhereInput[] = [];

    const normalizedStatus = typeof status === "string" ? status.trim() : undefined;
    if (normalizedStatus) {
      if (Object.values(PackageStatus).includes(normalizedStatus as PackageStatus)) {
        where.status = normalizedStatus as PackageStatus;
      } else if (normalizedStatus.includes(",")) {
        const statuses = Array.from(
          new Set(
            normalizedStatus
              .split(",")
              .map((s) => s.trim())
              .filter((s): s is PackageStatus =>
                Object.values(PackageStatus).includes(s as PackageStatus)
              )
          )
        );
        if (statuses.length === 1) {
          where.status = statuses[0];
        } else if (statuses.length > 1) {
          where.status = { in: statuses };
        }
      }
    }

    const normalizedZoneId = zoneId?.trim();
    if (normalizedZoneId) {
      where.zoneId = normalizedZoneId;
    }

    const normalizedTrackingCode = trackingCode?.trim();
    if (normalizedTrackingCode) {
      where.trackingCode = { contains: normalizedTrackingCode, mode: "insensitive" };
    }

    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      andConditions.push({
        OR: [
          { trackingCode: { contains: normalizedSearch, mode: "insensitive" } },
          { recipientName: { contains: normalizedSearch, mode: "insensitive" } },
          { recipientAddress: { contains: normalizedSearch, mode: "insensitive" } },
          { recipientPhone: { contains: normalizedSearch, mode: "insensitive" } },
        ],
      });
    }

    const normalizedDriverId = driverId?.trim();
    if (normalizedDriverId) {
      andConditions.push({
        OR: [
          { driverId: normalizedDriverId },
          {
            driverId: null,
            zone: {
              driverId: normalizedDriverId,
              companyId,
            },
          },
        ],
      });
    }

    const parsedDateFrom = PackageService.resolveDateFilter(dateFrom, "start");
    const parsedDateTo = PackageService.resolveDateFilter(dateTo, "end");

    if (parsedDateFrom && parsedDateTo && parsedDateFrom > parsedDateTo) {
      throw new Error("invalid_date_range");
    }

    if (parsedDateFrom || parsedDateTo) {
      where.createdAt = {
        ...(parsedDateFrom ? { gte: parsedDateFrom } : {}),
        ...(parsedDateTo ? { lte: parsedDateTo } : {}),
      };
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    return where;
  }

  static async getAllPackages(
    companyId: string,
    filters: PackageFilterInput & { page?: number; limit?: number }
  ) {
    const { page = 1, limit = 10 } = filters;
    const skip = (page - 1) * limit;
    const where = PackageService.buildPackageWhere(companyId, filters);

    const [items, total] = await Promise.all([
      prisma.package.findMany({
        where,
        include: { 
          zone: {
            include: { driver: true }
          },
          driver: true,
        },
        skip,
        take: limit,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      prisma.package.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async exportPackagesCsv(
    companyId: string,
    filters: PackageFilterInput
  ): Promise<string> {
    const where = PackageService.buildPackageWhere(companyId, filters);

    const packages = await prisma.package.findMany({
      where,
      include: {
        zone: {
          include: { driver: true },
        },
        driver: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MAX_EXPORT_PACKAGES,
    });

    const rows = packages.map((pkg) => {
      const effectiveDriver = pkg.driver ?? pkg.zone?.driver ?? null;
      return {
        id: pkg.id,
        trackingCode: pkg.trackingCode,
        status: pkg.status,
        recipientName: pkg.recipientName,
        recipientAddress: pkg.recipientAddress,
        recipientPhone: pkg.recipientPhone,
        recipientEmail: pkg.recipientEmail ?? "",
        addressStreet: pkg.addressStreet ?? "",
        addressNumber: pkg.addressNumber ?? "",
        addressFloor: pkg.addressFloor ?? "",
        addressCity: pkg.addressCity ?? "",
        addressZip: pkg.addressZip ?? "",
        addressReferences: pkg.addressReferences ?? "",
        senderName: pkg.senderName ?? "",
        senderAddress: pkg.senderAddress ?? "",
        senderPhone: pkg.senderPhone ?? "",
        weight: pkg.weight ?? "",
        volume: pkg.volume ?? "",
        lat: pkg.lat ?? "",
        lng: pkg.lng ?? "",
        zoneId: pkg.zoneId ?? "",
        zoneName: pkg.zone?.name ?? "",
        driverId: pkg.driverId ?? pkg.zone?.driverId ?? "",
        driverName: effectiveDriver?.name ?? "",
        estimatedDeliveryAt: pkg.estimatedDeliveryAt ?? "",
        deliveryWindowStart: pkg.deliveryWindowStart ?? "",
        deliveryWindowEnd: pkg.deliveryWindowEnd ?? "",
        isArchived: pkg.isArchived,
        createdAt: pkg.createdAt,
        updatedAt: pkg.updatedAt,
      };
    });

    return serializeCsv(PACKAGE_EXPORT_HEADERS, rows);
  }

  static async archivePackages(companyId: string, packageIds: string[]) {
    const result = await prisma.package.updateMany({
      where: {
        companyId,
        id: { in: packageIds }
      },
      data: { isArchived: true }
    });
    await PackageService.invalidatePackageCache(companyId);
    return result;
  }

  static async unarchivePackages(companyId: string, packageIds: string[]) {
    const uniqueIds = Array.from(new Set(packageIds));
    const result = await prisma.package.updateMany({
      where: {
        companyId,
        id: { in: uniqueIds },
        isArchived: true,
      },
      data: { isArchived: false },
    });

    await PackageService.invalidatePackageCache(companyId);

    if (result.count > 0) {
      emitToRoom(`company-${companyId}`, "packages-unarchived", {
        packageIds: uniqueIds,
        count: result.count,
      });
    }

    return result;
  }

  static async deletePackages(companyId: string, packageIds: string[]) {
    const packagesToDelete = await prisma.package.findMany({
      where: {
        companyId,
        id: { in: packageIds }
      },
      select: {
        signatureUrl: true,
        photoUrl: true,
      }
    });

    const result = await prisma.$transaction(async (tx) => {
      await tx.packageHistory.deleteMany({
        where: {
          package: {
            companyId,
            id: { in: packageIds }
          }
        }
      });

      return tx.package.deleteMany({
        where: {
          companyId,
          id: { in: packageIds }
        }
      });
    });

    const filesToRemove = packagesToDelete.flatMap((pkg) =>
      [pkg.signatureUrl, pkg.photoUrl].filter((url): url is string => Boolean(url))
    );
    if (filesToRemove.length > 0) {
      await Promise.allSettled(filesToRemove.map((url) => deleteUploadedFile(url)));
    }

    await PackageService.invalidatePackageCache(companyId);

    return result;
  }
// ...
  private static async resolveGeocodeCoordinates(
    input: {
      lat?: number | null;
      lng?: number | null;
      recipientAddress?: string | null;
      addressStreet?: string | null;
      addressNumber?: string | null;
      addressCity?: string | null;
      addressCountry?: string | null;
    },
    memo?: Map<string, Promise<{ lat: number; lng: number } | null>>
  ): Promise<{ lat: number | null | undefined; lng: number | null | undefined }> {
    if (input.lat != null && input.lng != null) {
      return { lat: input.lat, lng: input.lng };
    }

    const queryAddr = PackageService.buildGeocodeQuery(input);
    if (!queryAddr) {
      return { lat: input.lat, lng: input.lng };
    }

    let geoPromise: Promise<{ lat: number; lng: number } | null>;
    if (memo) {
      let cached = memo.get(queryAddr);
      if (!cached) {
        cached = geocodeAddress(queryAddr);
        memo.set(queryAddr, cached);
      }
      geoPromise = cached;
    } else {
      geoPromise = geocodeAddress(queryAddr);
    }

    const geo = await geoPromise;
    if (geo) {
      return { lat: geo.lat, lng: geo.lng };
    }
    return { lat: input.lat, lng: input.lng };
  }

  private static buildInitialHistoryNote(
    recipientName: string,
    recipientAddress: string,
    status: PackageStatus,
    isBulk = false
  ): string {
    const base = `Package created for ${recipientName} at ${recipientAddress}`;
    if (status === "assigned") {
      return isBulk
        ? `${base} (bulk import, auto-assigned to active zone)`
        : `${base} (auto-assigned to active zone)`;
    }
    return isBulk ? `${base} (bulk import)` : base;
  }

  static async createPackage(companyId: string, data: CreatePackageInput) {
    const {
      trackingCode,
      recipientName,
      recipientAddress,
      recipientPhone,
      recipientEmail,
      addressStreet,
      addressNumber,
      addressFloor,
      addressCity,
      addressZip,
      addressCountry,
      addressReferences,
      senderName,
      senderAddress,
      senderPhone,
      weight,
      volume,
      zoneId,
      userId,
      lat,
      lng,
      estimatedDeliveryAt,
      deliveryWindowStart,
      deliveryWindowEnd,
    } = data;

    PackageService.assertValidOptionalDate(estimatedDeliveryAt);
    PackageService.assertValidOptionalDate(deliveryWindowStart);
    PackageService.assertValidOptionalDate(deliveryWindowEnd);
    PackageService.validateDeliveryWindow(deliveryWindowStart, deliveryWindowEnd);

    // Validate Zone (if provided manually)
    let resolvedZoneId = zoneId ?? undefined;
    if (resolvedZoneId) {
        const zone = await prisma.zone.findFirst({ where: { id: resolvedZoneId, companyId } });
        if (!zone) {
            throw new Error("zone_not_found");
        }
    }

    // --- Geocoding Logic ---
    const { lat: finalLat, lng: finalLng } = await PackageService.resolveGeocodeCoordinates({
      lat,
      lng,
      recipientAddress,
      addressStreet,
      addressNumber,
      addressCity,
      addressCountry,
    });
    // -----------------------

    // --- Auto Geofencing: detect zone if not provided ---
    if (!resolvedZoneId && finalLat != null && finalLng != null) {
        try {
            const detected = await ZoneService.detectZone(companyId, finalLat, finalLng);
            if (detected) {
                resolvedZoneId = detected.id;
            }
        } catch (geoErr) {
            // Non-fatal: proceed without zone if geofencing fails
            console.warn('⚠️ Geofencing detection failed (non-fatal):', geoErr);
        }
    }
    // ----------------------------------------------------

    const normalizedAddressFloor = PackageService.normalizeNullableText(addressFloor);
    const normalizedAddressCity = PackageService.normalizeNullableText(addressCity);
    const normalizedAddressZip = PackageService.normalizeNullableText(addressZip);

    const pkg = await prisma.$transaction(async (tx) => {
      let initialStatus: PackageStatus = "pending";
      let initialDriverId: string | null = null;
      let targetZoneId = resolvedZoneId;

      if (targetZoneId) {
        const zoneRows = await tx.$queryRaw<{ isActive: boolean; driverId: string | null }[]>`
          SELECT "isActive", "driverId"
          FROM "Zone"
          WHERE "id" = ${targetZoneId} AND "companyId" = ${companyId}
          FOR SHARE
        `;
        if (zoneRows.length === 0) {
          if (zoneId) {
            throw new Error("zone_not_found");
          }
          targetZoneId = undefined;
        } else if (zoneRows[0].isActive && zoneRows[0].driverId) {
          initialStatus = "assigned";
          initialDriverId = zoneRows[0].driverId;
        }
      }

      return tx.package.create({
        data: { 
          trackingCode, 
          recipientName,
          recipientAddress,
          recipientPhone,
          recipientEmail,
          addressStreet,
          addressNumber,
          addressFloor: normalizedAddressFloor,
          addressCity: normalizedAddressCity,
          addressZip: normalizedAddressZip,
          addressReferences,
          senderName,
          senderAddress,
          senderPhone,
          weight,
          volume,
          lat: finalLat,
          lng: finalLng,
          estimatedDeliveryAt,
          deliveryWindowStart,
          deliveryWindowEnd,
          zoneId: targetZoneId,
          driverId: initialDriverId,
          companyId,
          status: initialStatus,
          history: {
            create: {
              status: initialStatus,
              userId,
              notes: PackageService.buildInitialHistoryNote(
                recipientName,
                recipientAddress,
                initialStatus
              ),
            }
          }
        },
        include: { 
          zone: {
            include: { driver: true }
          },
          driver: true,
        },
      });
    });

    await PackageService.invalidatePackageCache(companyId);

    emitToRoom(`company-${companyId}`, "package-created", pkg);

    // Emit Business Event
    emitToRoom(`company-${companyId}`, "business-event", {
      id: `evt-${Date.now()}`,
      type: 'SYSTEM',
      title: 'Nuevo Paquete',
      description: `Se ha creado el paquete #${trackingCode} para ${recipientName}`,
      timestamp: Date.now()
    });

    return pkg;
  }

  static async createPackagesBulk(
    companyId: string,
    userId: string,
    items: BulkCreatePackageItemInput[]
  ) {
    for (const item of items) {
      PackageService.assertValidOptionalDate(item.estimatedDeliveryAt);
      PackageService.assertValidOptionalDate(item.deliveryWindowStart);
      PackageService.assertValidOptionalDate(item.deliveryWindowEnd);
      PackageService.validateDeliveryWindow(item.deliveryWindowStart, item.deliveryWindowEnd);
    }

    const explicitZoneIds = Array.from(
      new Set(items.map((item) => item.zoneId).filter((id): id is string => Boolean(id)))
    );
    if (explicitZoneIds.length > 0) {
      const validZones = await prisma.zone.findMany({
        where: { companyId, id: { in: explicitZoneIds } },
        select: { id: true },
      });
      const validZoneSet = new Set(validZones.map((z) => z.id));
      const missingZoneIds = explicitZoneIds.filter((id) => !validZoneSet.has(id));
      if (missingZoneIds.length > 0) {
        throw new PackageBulkError("zone_not_found", "zone not found", missingZoneIds);
      }
    }

    const geocodeMemo = new Map<string, Promise<{ lat: number; lng: number } | null>>();
    const resolvedItems: Array<
      BulkCreatePackageItemInput & { finalLat?: number | null; finalLng?: number | null }
    > = new Array(items.length);

    for (let offset = 0; offset < items.length; offset += GEOCODE_BATCH_CONCURRENCY) {
      const chunk = items.slice(offset, offset + GEOCODE_BATCH_CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async (item) => {
          const coords = await PackageService.resolveGeocodeCoordinates(item, geocodeMemo);
          return { ...item, finalLat: coords.lat, finalLng: coords.lng };
        })
      );
      chunkResults.forEach((entry, idx) => {
        resolvedItems[offset + idx] = entry;
      });
    }

    let createdPackages;
    try {
      createdPackages = await prisma.$transaction(async (tx) => {
        const lockedZones = await tx.$queryRaw<
          { id: string; isActive: boolean; driverId: string | null }[]
        >`
          SELECT "id", "isActive", "driverId"
          FROM "Zone"
          WHERE "companyId" = ${companyId}
          FOR SHARE
        `;
        const zoneStateById = new Map(lockedZones.map((z) => [z.id, z]));

        const needsAutoDetect = resolvedItems.some(
          (item) => !item.zoneId && item.finalLat != null && item.finalLng != null
        );
        const activePolygonZones = needsAutoDetect
          ? await tx.zone.findMany({
              where: {
                companyId,
                isActive: true,
                polygon: { not: Prisma.DbNull },
              },
              select: { id: true, polygon: true },
            })
          : [];

        const trackingCodes = resolvedItems.map((item) => item.trackingCode);
        const existingPackages = await tx.package.findMany({
          where: {
            companyId,
            trackingCode: { in: trackingCodes },
          },
          select: { trackingCode: true },
        });
        if (existingPackages.length > 0) {
          throw new PackageBulkError(
            "duplicate_tracking_codes",
            "Duplicate tracking codes already exist",
            existingPackages.map((p) => p.trackingCode)
          );
        }

        const createdIds: string[] = [];
        const packageRows: Prisma.PackageCreateManyInput[] = [];
        const historyRows: Prisma.PackageHistoryCreateManyInput[] = [];

        for (const item of resolvedItems) {
          let targetZoneId: string | null = null;

          if (item.zoneId) {
            const explicitZone = zoneStateById.get(item.zoneId);
            if (!explicitZone) {
              throw new PackageBulkError("zone_not_found", "zone not found", [item.zoneId]);
            }
            targetZoneId = explicitZone.id;
          } else if (item.finalLat != null && item.finalLng != null) {
            for (const zone of activePolygonZones) {
              const poly = zone.polygon as [number, number][] | null;
              if (Array.isArray(poly) && poly.length >= 3 && pointInPolygon(item.finalLat, item.finalLng, poly)) {
                targetZoneId = zone.id;
                break;
              }
            }
          }

          let initialStatus: PackageStatus = "pending";
          let initialDriverId: string | null = null;
          if (targetZoneId) {
            const zoneState = zoneStateById.get(targetZoneId);
            if (!zoneState) {
              targetZoneId = null;
            } else if (zoneState.isActive && zoneState.driverId) {
              initialStatus = "assigned";
              initialDriverId = zoneState.driverId;
            }
          }

          const packageId = randomUUID();
          createdIds.push(packageId);

          packageRows.push({
            id: packageId,
            trackingCode: item.trackingCode,
            recipientName: item.recipientName,
            recipientAddress: item.recipientAddress,
            recipientPhone: item.recipientPhone,
            recipientEmail: PackageService.normalizeNullableText(item.recipientEmail) ?? null,
            addressStreet: PackageService.normalizeNullableText(item.addressStreet) ?? null,
            addressNumber: PackageService.normalizeNullableText(item.addressNumber) ?? null,
            addressFloor: PackageService.normalizeNullableText(item.addressFloor) ?? null,
            addressCity: PackageService.normalizeNullableText(item.addressCity) ?? null,
            addressZip: PackageService.normalizeNullableText(item.addressZip) ?? null,
            addressReferences: PackageService.normalizeNullableText(item.addressReferences) ?? null,
            senderName: PackageService.normalizeNullableText(item.senderName) ?? null,
            senderAddress: PackageService.normalizeNullableText(item.senderAddress) ?? null,
            senderPhone: PackageService.normalizeNullableText(item.senderPhone) ?? null,
            weight: item.weight ?? null,
            volume: item.volume ?? null,
            lat: item.finalLat ?? null,
            lng: item.finalLng ?? null,
            estimatedDeliveryAt: item.estimatedDeliveryAt ?? null,
            deliveryWindowStart: item.deliveryWindowStart ?? null,
            deliveryWindowEnd: item.deliveryWindowEnd ?? null,
            zoneId: targetZoneId,
            driverId: initialDriverId,
            companyId,
            status: initialStatus,
          });

          historyRows.push({
            id: randomUUID(),
            packageId,
            status: initialStatus,
            userId,
            notes: PackageService.buildInitialHistoryNote(
              item.recipientName,
              item.recipientAddress,
              initialStatus,
              true
            ),
          });
        }

        await tx.package.createMany({ data: packageRows });
        await tx.packageHistory.createMany({ data: historyRows });

        const fetched = await tx.package.findMany({
          where: { companyId, id: { in: createdIds } },
          include: {
            zone: {
              include: { driver: true },
            },
            driver: true,
          },
        });

        const byId = new Map(fetched.map((pkg) => [pkg.id, pkg]));
        return createdIds
          .map((id) => byId.get(id))
          .filter((pkg): pkg is NonNullable<typeof pkg> => Boolean(pkg));
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new PackageBulkError(
          "duplicate_tracking_codes",
          "Duplicate tracking codes already exist",
          []
        );
      }
      throw error;
    }

    await PackageService.invalidatePackageCache(companyId);

    for (const pkg of createdPackages) {
      emitToRoom(`company-${companyId}`, "package-created", pkg);
    }

    emitToRoom(`company-${companyId}`, "packages-bulk-created", {
      count: createdPackages.length,
      packageIds: createdPackages.map((pkg) => pkg.id),
    });

    emitToRoom(`company-${companyId}`, "business-event", {
      id: `evt-${Date.now()}-${randomUUID()}`,
      type: "SYSTEM",
      title: "Carga Masiva de Paquetes",
      description: `Se importaron ${createdPackages.length} paquetes`,
      timestamp: Date.now(),
    });

    const assignedCount = createdPackages.filter((pkg) => pkg.status === "assigned").length;
    const pendingCount = createdPackages.length - assignedCount;

    return {
      count: createdPackages.length,
      assignedCount,
      pendingCount,
      items: createdPackages,
    };
  }

// ... 

  private static isDriverAuthorizedForPackage(
    pkg: { driverId: string | null; zone?: { driverId: string | null } | null },
    userDriverId: string | null
  ): boolean {
    if (!userDriverId) return false;
    if (pkg.driverId !== null) {
      return pkg.driverId === userDriverId;
    }
    return pkg.zone?.driverId === userDriverId;
  }

  private static async lockPackageWithZoneTx(
    tx: Prisma.TransactionClient,
    companyId: string,
    packageId: string
  ) {
    const initialPkg = await tx.package.findFirst({
      where: { id: packageId, companyId },
      select: { id: true, zoneId: true },
    });
    if (!initialPkg) throw new Error("package_not_found");

    let lockedZone: { id: string; driverId: string | null; isActive: boolean } | null = null;
    if (initialPkg.zoneId) {
      const zoneRows = await tx.$queryRaw<
        { id: string; driverId: string | null; isActive: boolean }[]
      >`
        SELECT "id", "driverId", "isActive"
        FROM "Zone"
        WHERE "id" = ${initialPkg.zoneId} AND "companyId" = ${companyId}
        FOR SHARE
      `;
      lockedZone = zoneRows[0] ?? null;
    }

    const pkgRows = await tx.$queryRaw<
      { id: string; trackingCode: string; status: PackageStatus; zoneId: string | null; driverId: string | null }[]
    >`
      SELECT "id", "trackingCode", "status", "zoneId", "driverId"
      FROM "Package"
      WHERE "id" = ${packageId} AND "companyId" = ${companyId}
      FOR UPDATE
    `;
    if (pkgRows.length === 0) throw new Error("package_not_found");
    const lockedPkg = pkgRows[0];

    if (lockedPkg.zoneId !== initialPkg.zoneId) {
      lockedZone = lockedPkg.zoneId
        ? await tx.zone.findFirst({
            where: { id: lockedPkg.zoneId, companyId },
            select: { id: true, driverId: true, isActive: true },
          })
        : null;
    }

    return { lockedPkg, lockedZone };
  }

  static async updateStatus(companyId: string, params: {
    packageId: string;
    status: PackageStatus;
    userId: string;
    userRole: string;
    userDriverId: string | null;
    lat?: number;
    lng?: number;
    estimatedDeliveryAt?: Date;
    signature?: string; // Base64 data URI of recipient's signature
    photo?: string;     // Base64 data URI of delivery photo evidence
    notes?: string | null;
    reason?: string | null;
    deliveryNotes?: string | null;
  }) {
    const {
      packageId,
      status,
      userId,
      userRole,
      userDriverId,
      lat,
      lng,
      estimatedDeliveryAt,
      signature,
      photo,
      notes,
      reason,
      deliveryNotes,
    } = params;
    
    // Initial check before processing Proof of Delivery uploads
    const pkg = await prisma.package.findFirst({ 
      where: { id: packageId, companyId },
      include: { zone: true }
    });
    
    if (!pkg) throw new Error("package_not_found");

    if (userRole === "driver") {
        if (!PackageService.isDriverAuthorizedForPackage(pkg, userDriverId)) {
             throw new Error("not_authorized_for_zone");
        }
    }

    const allowedTransitions: Record<PackageStatus, PackageStatus[]> = {
      pending: ["assigned", "in_transit", "cancelled"], // Expanded for flexibility
      assigned: ["in_transit", "cancelled"],
      in_transit: ["delivered"],
      delivered: [],
      cancelled: [],
    };

    const initialAllowed = allowedTransitions[pkg.status as PackageStatus];
    if (!initialAllowed.includes(status)) {
      throw new Error(`invalid_transition:${pkg.status}:${status}`);
    }

    // --- Proof of Delivery (POD) ---
    // Process base64 images BEFORE the transaction to avoid holding the DB connection.
    let signatureUrl: string | undefined;
    let photoUrl: string | undefined;

    if (status === 'delivered') {
      if (signature) {
        try {
          signatureUrl = await saveBase64Image(signature, 'signature', packageId);
        } catch (e) {
          console.error('Failed to save signature image:', e);
          // Non-fatal: proceed without signature if saving fails
        }
      }
      if (photo) {
        try {
          photoUrl = await saveBase64Image(photo, 'photo', packageId);
        } catch (e) {
          console.error('Failed to save photo evidence:', e);
          // Non-fatal: proceed without photo if saving fails
        }
      }
    }
    // --------------------------------

    const { customNote, historyNotes } = PackageService.resolveStatusHistoryNote({
      status,
      signatureUrl,
      photoUrl,
      notes,
      reason,
      deliveryNotes,
    });

    let txResult: { updated: any; trackingCode: string };
    try {
      txResult = await prisma.$transaction(async (tx) => {
        const { lockedPkg, lockedZone } = await PackageService.lockPackageWithZoneTx(tx, companyId, packageId);

        if (userRole === "driver") {
          if (!PackageService.isDriverAuthorizedForPackage({ driverId: lockedPkg.driverId, zone: lockedZone }, userDriverId)) {
            throw new Error("not_authorized_for_zone");
          }
        }

        const allowed = allowedTransitions[lockedPkg.status as PackageStatus];
        if (!allowed.includes(status)) {
          throw new Error(`invalid_transition:${lockedPkg.status}:${status}`);
        }

        let resolvedDriverIdUpdate: string | undefined;
        if (
          lockedPkg.driverId === null &&
          (status === "assigned" || status === "in_transit" || status === "delivered")
        ) {
          const candidateDriverId = userRole === "driver" ? userDriverId : (lockedZone?.driverId ?? null);
          if (candidateDriverId) {
            resolvedDriverIdUpdate = candidateDriverId;
          }
        }

        const updated = await tx.package.update({
          where: { id: packageId },
          data: { 
            status,
            lat,
            lng,
            estimatedDeliveryAt,
            ...(resolvedDriverIdUpdate ? { driverId: resolvedDriverIdUpdate } : {}),
            ...(signatureUrl && { signatureUrl }),
            ...(photoUrl && { photoUrl }),
          }
        });

        await tx.packageHistory.create({
          data: {
            packageId,
            status,
            userId,
            notes: historyNotes,
          }
        });

        return { updated, trackingCode: lockedPkg.trackingCode };
      });
    } catch (error) {
      const uploadedFiles = [signatureUrl, photoUrl].filter((url): url is string => Boolean(url));
      if (uploadedFiles.length > 0) {
        await Promise.allSettled(uploadedFiles.map((url) => deleteUploadedFile(url)));
      }
      throw error;
    }

    const { updated, trackingCode } = txResult;

    await PackageService.invalidatePackageCache(companyId);

    emitToRoom(`company-${companyId}`, "package-status-updated", { 
      packageId, 
      status, 
      lat, 
      lng, 
      estimatedDeliveryAt,
      signatureUrl,
      photoUrl,
      ...(customNote ? { notes: historyNotes } : {}),
    });

    // Emit Business Event
    let eventType = 'SYSTEM';
    let title = 'Estado Actualizado';
    
    if (status === 'delivered') {
        eventType = 'DELIVERY';
        title = 'Paquete Entregado';
    } else if (status === 'cancelled') {
        eventType = 'ISSUE';
        title = 'Entrega Fallida/Cancelada';
    } else if (status === 'in_transit') {
        eventType = 'LOCATION';
        title = 'En Camino';
    }

    emitToRoom(`company-${companyId}`, "business-event", {
      id: `evt-${Date.now()}`,
      type: eventType,
      title: title,
      description: customNote
        ? `El paquete #${trackingCode} ha cambiado a estado: ${status.replace('_', ' ')} (${customNote})`
        : `El paquete #${trackingCode} ha cambiado a estado: ${status.replace('_', ' ')}`,
      timestamp: Date.now()
    });

    return updated;
  }

  static async assignToDriver(companyId: string, packageId: string, driverId: string, userId: string) {
    const { updated, driverName, trackingCode } = await prisma.$transaction(async (tx) => {
      const { lockedPkg, lockedZone } = await PackageService.lockPackageWithZoneTx(tx, companyId, packageId);

      if (lockedPkg.status !== "pending" && lockedPkg.status !== "assigned") {
        throw new Error(`invalid_transition:${lockedPkg.status}:assigned`);
      }

      const driver = await tx.driver.findFirst({
        where: { id: driverId, companyId },
      });
      if (!driver) throw new Error("driver_not_found");

      if (!lockedZone || lockedZone.driverId !== driverId) {
        throw new Error("driver_not_in_zone");
      }

      const saved = await tx.package.update({
        where: { id: packageId },
        data: { status: "assigned", driverId },
        include: { 
          zone: {
            include: { driver: true }
          },
          driver: true,
        },
      });

      await tx.packageHistory.create({
        data: {
          packageId,
          status: "assigned",
          userId,
          notes: `Assigned to driver ${driver.name}`
        }
      });

      return { updated: saved, driverName: driver.name, trackingCode: lockedPkg.trackingCode };
    });

    await PackageService.invalidatePackageCache(companyId);

    emitToRoom(`company-${companyId}`, "package-assigned", { packageId, driverId, driverName });
    
    // Emit Business Event
    emitToRoom(`company-${companyId}`, "business-event", {
      id: `evt-${Date.now()}`,
      type: 'SYSTEM',
      title: 'Asignación Manual',
      description: `Paquete #${trackingCode} asignado a conductor ${driverName}`,
      timestamp: Date.now()
    });

    return updated;
  }

  static async getPackagesByDriver(companyId: string, driverId: string) {
    if (!companyId) throw new Error("company_id_required");

    const driver = await prisma.driver.findFirst({
      where: { id: driverId, companyId },
    });
    if (!driver) {
      throw new Error("driver_not_found");
    }

    return prisma.package.findMany({
      where: {
        companyId,
        isArchived: false,
        OR: [
          { driverId },
          {
            driverId: null,
            zone: {
              driverId,
              companyId,
            },
          },
        ],
      },
      include: { zone: true, driver: true },
    });
  }

  static async getMyPackages(companyId: string, driverId: string) {
    if (!companyId) throw new Error("company_id_required");
    return this.getPackagesByDriver(companyId, driverId);
  }

  static async getPackageById(
    companyId: string,
    packageId: string,
    options?: { userRole?: string; userDriverId?: string | null }
  ) {
    const pkg = await prisma.package.findFirst({
      where: { id: packageId, companyId },
      include: {
        zone: {
          include: { driver: true },
        },
        driver: true,
        history: {
          include: {
            user: {
              select: { id: true, username: true, role: true },
            },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });

    if (!pkg) throw new Error("package_not_found");

    if (options?.userRole === "driver") {
      if (!PackageService.isDriverAuthorizedForPackage(pkg, options.userDriverId ?? null)) {
        throw new Error("not_authorized_for_zone");
      }
    }

    return pkg;
  }

  static async updatePackage(
    companyId: string,
    packageId: string,
    userId: string,
    data: UpdatePackageInput
  ) {
    const normalizeRequiredText = (val: string | undefined): string | undefined => {
      if (val === undefined) return undefined;
      return val.trim();
    };

    PackageService.assertValidOptionalDate(data.estimatedDeliveryAt);
    PackageService.assertValidOptionalDate(data.deliveryWindowStart);
    PackageService.assertValidOptionalDate(data.deliveryWindowEnd);

    let resolvedLatUpdate: number | null | undefined = data.lat;
    let resolvedLngUpdate: number | null | undefined = data.lng;

    const hasNonEmptyAddressUpdate = Boolean(
      data.recipientAddress?.trim() ||
        data.addressStreet?.trim() ||
        data.addressNumber?.trim() ||
        data.addressCity?.trim()
    );

    if (hasNonEmptyAddressUpdate && (data.lat == null || data.lng == null)) {
      const existingPkg = await prisma.package.findFirst({
        where: { id: packageId, companyId },
        select: {
          status: true,
          zoneId: true,
          recipientAddress: true,
          addressStreet: true,
          addressNumber: true,
          addressCity: true,
          lat: true,
          lng: true,
          deliveryWindowStart: true,
          deliveryWindowEnd: true,
        },
      });
      if (!existingPkg) {
        throw new Error("package_not_found");
      }
      if (existingPkg.status === "delivered" || existingPkg.status === "cancelled") {
        throw new Error(`cannot_update_terminal_package:${existingPkg.status}`);
      }
      if (
        existingPkg.status === "in_transit" &&
        data.zoneId !== undefined &&
        data.zoneId !== existingPkg.zoneId
      ) {
        throw new Error("cannot_reassign_zone_in_transit");
      }
      PackageService.validateDeliveryWindow(
        data.deliveryWindowStart !== undefined
          ? data.deliveryWindowStart
          : existingPkg.deliveryWindowStart,
        data.deliveryWindowEnd !== undefined ? data.deliveryWindowEnd : existingPkg.deliveryWindowEnd
      );

      const effectiveLat = data.lat !== undefined ? data.lat : existingPkg.lat;
      const effectiveLng = data.lng !== undefined ? data.lng : existingPkg.lng;

      if (effectiveLat == null || effectiveLng == null) {
        const queryAddr = PackageService.buildGeocodeQuery({
          recipientAddress:
            data.recipientAddress !== undefined
              ? normalizeRequiredText(data.recipientAddress)
              : existingPkg.recipientAddress,
          addressStreet:
            data.addressStreet !== undefined
              ? PackageService.normalizeNullableText(data.addressStreet)
              : existingPkg.addressStreet,
          addressNumber:
            data.addressNumber !== undefined
              ? PackageService.normalizeNullableText(data.addressNumber)
              : existingPkg.addressNumber,
          addressCity:
            data.addressCity !== undefined
              ? PackageService.normalizeNullableText(data.addressCity)
              : existingPkg.addressCity,
        });
        if (queryAddr) {
          const geo = await geocodeAddress(queryAddr);
          if (geo) {
            if (resolvedLatUpdate == null) resolvedLatUpdate = geo.lat;
            if (resolvedLngUpdate == null) resolvedLngUpdate = geo.lng;
          }
        }
      }
    }

    const txResult = await prisma.$transaction(async (tx) => {
      const initialPkg = await tx.package.findFirst({
        where: { id: packageId, companyId },
        select: { id: true, status: true, zoneId: true },
      });
      if (!initialPkg) {
        throw new Error("package_not_found");
      }
      if (initialPkg.status === "delivered" || initialPkg.status === "cancelled") {
        throw new Error(`cannot_update_terminal_package:${initialPkg.status}`);
      }
      if (
        initialPkg.status === "in_transit" &&
        data.zoneId !== undefined &&
        data.zoneId !== initialPkg.zoneId
      ) {
        throw new Error("cannot_reassign_zone_in_transit");
      }

      let targetZone: { id: string; name: string; isActive: boolean; driverId: string | null } | null = null;
      let targetDriverName: string | null = null;

      if (typeof data.zoneId === "string") {
        const zoneRows = await tx.$queryRaw<
          { id: string; name: string; isActive: boolean; driverId: string | null }[]
        >`
          SELECT "id", "name", "isActive", "driverId"
          FROM "Zone"
          WHERE "id" = ${data.zoneId} AND "companyId" = ${companyId}
          FOR SHARE
        `;
        if (zoneRows.length === 0) {
          throw new Error("zone_not_found");
        }
        targetZone = zoneRows[0];
        if (targetZone.driverId) {
          const driver = await tx.driver.findFirst({
            where: { id: targetZone.driverId, companyId },
            select: { name: true },
          });
          targetDriverName = driver?.name ?? null;
        }
      }

      const pkgRows = await tx.$queryRaw<
        {
          id: string;
          trackingCode: string;
          status: PackageStatus;
          zoneId: string | null;
          driverId: string | null;
          deliveryWindowStart: Date | null;
          deliveryWindowEnd: Date | null;
        }[]
      >`
        SELECT "id", "trackingCode", "status", "zoneId", "driverId", "deliveryWindowStart", "deliveryWindowEnd"
        FROM "Package"
        WHERE "id" = ${packageId} AND "companyId" = ${companyId}
        FOR UPDATE
      `;
      if (pkgRows.length === 0) {
        throw new Error("package_not_found");
      }
      const lockedPkg = pkgRows[0];

      if (lockedPkg.status === "delivered" || lockedPkg.status === "cancelled") {
        throw new Error(`cannot_update_terminal_package:${lockedPkg.status}`);
      }
      if (
        lockedPkg.status === "in_transit" &&
        data.zoneId !== undefined &&
        data.zoneId !== lockedPkg.zoneId
      ) {
        throw new Error("cannot_reassign_zone_in_transit");
      }

      const effectiveWindowStart =
        data.deliveryWindowStart !== undefined
          ? data.deliveryWindowStart
          : lockedPkg.deliveryWindowStart;
      const effectiveWindowEnd =
        data.deliveryWindowEnd !== undefined
          ? data.deliveryWindowEnd
          : lockedPkg.deliveryWindowEnd;

      PackageService.validateDeliveryWindow(effectiveWindowStart, effectiveWindowEnd);

      const zoneChanged = data.zoneId !== undefined && data.zoneId !== lockedPkg.zoneId;
      let nextStatus: PackageStatus = lockedPkg.status;
      let nextZoneId: string | null | undefined = undefined;
      let nextDriverId: string | null | undefined = undefined;
      let zoneNote: string | null = null;

      if (zoneChanged) {
        if (data.zoneId === null) {
          nextZoneId = null;
          nextDriverId = null;
          nextStatus = "pending";
          zoneNote = "Zone unassigned (status set to pending)";
        } else if (targetZone) {
          nextZoneId = targetZone.id;
          if (targetZone.isActive && targetZone.driverId) {
            nextDriverId = targetZone.driverId;
            nextStatus = "assigned";
            zoneNote = `Reassigned to zone ${targetZone.name} (assigned to driver ${targetDriverName ?? targetZone.driverId})`;
          } else {
            nextDriverId = null;
            nextStatus = "pending";
            zoneNote = `Reassigned to zone ${targetZone.name} (status set to pending)`;
          }
        }
      }

      const recipientName = normalizeRequiredText(data.recipientName);
      const recipientAddress = normalizeRequiredText(data.recipientAddress);
      const recipientPhone = normalizeRequiredText(data.recipientPhone);
      const recipientEmail = PackageService.normalizeNullableText(data.recipientEmail);
      const addressStreet = PackageService.normalizeNullableText(data.addressStreet);
      const addressNumber = PackageService.normalizeNullableText(data.addressNumber);
      const addressFloor = PackageService.normalizeNullableText(data.addressFloor);
      const addressCity = PackageService.normalizeNullableText(data.addressCity);
      const addressZip = PackageService.normalizeNullableText(data.addressZip);
      const addressReferences = PackageService.normalizeNullableText(data.addressReferences);
      const senderName = PackageService.normalizeNullableText(data.senderName);
      const senderAddress = PackageService.normalizeNullableText(data.senderAddress);
      const senderPhone = PackageService.normalizeNullableText(data.senderPhone);

      const updateData: Prisma.PackageUncheckedUpdateInput = {
        ...(recipientName !== undefined ? { recipientName } : {}),
        ...(recipientAddress !== undefined ? { recipientAddress } : {}),
        ...(recipientPhone !== undefined ? { recipientPhone } : {}),
        ...(recipientEmail !== undefined ? { recipientEmail } : {}),
        ...(addressStreet !== undefined ? { addressStreet } : {}),
        ...(addressNumber !== undefined ? { addressNumber } : {}),
        ...(addressFloor !== undefined ? { addressFloor } : {}),
        ...(addressCity !== undefined ? { addressCity } : {}),
        ...(addressZip !== undefined ? { addressZip } : {}),
        ...(addressReferences !== undefined ? { addressReferences } : {}),
        ...(senderName !== undefined ? { senderName } : {}),
        ...(senderAddress !== undefined ? { senderAddress } : {}),
        ...(senderPhone !== undefined ? { senderPhone } : {}),
        ...(data.weight !== undefined ? { weight: data.weight } : {}),
        ...(data.volume !== undefined ? { volume: data.volume } : {}),
        ...(resolvedLatUpdate !== undefined ? { lat: resolvedLatUpdate } : {}),
        ...(resolvedLngUpdate !== undefined ? { lng: resolvedLngUpdate } : {}),
        ...(data.estimatedDeliveryAt !== undefined
          ? { estimatedDeliveryAt: data.estimatedDeliveryAt }
          : {}),
        ...(data.deliveryWindowStart !== undefined
          ? { deliveryWindowStart: data.deliveryWindowStart }
          : {}),
        ...(data.deliveryWindowEnd !== undefined
          ? { deliveryWindowEnd: data.deliveryWindowEnd }
          : {}),
        ...(zoneChanged
          ? {
              zoneId: nextZoneId,
              driverId: nextDriverId,
              status: nextStatus,
            }
          : {}),
      };

      const changedFields: string[] = [];
      const trackableFields: [keyof UpdatePackageInput, unknown][] = [
        ["recipientName", recipientName],
        ["recipientAddress", recipientAddress],
        ["recipientPhone", recipientPhone],
        ["recipientEmail", recipientEmail],
        ["addressStreet", addressStreet],
        ["addressNumber", addressNumber],
        ["addressFloor", addressFloor],
        ["addressCity", addressCity],
        ["addressZip", addressZip],
        ["addressReferences", addressReferences],
        ["senderName", senderName],
        ["senderAddress", senderAddress],
        ["senderPhone", senderPhone],
        ["weight", data.weight],
        ["volume", data.volume],
        ["lat", resolvedLatUpdate],
        ["lng", resolvedLngUpdate],
        ["estimatedDeliveryAt", data.estimatedDeliveryAt],
        ["deliveryWindowStart", data.deliveryWindowStart],
        ["deliveryWindowEnd", data.deliveryWindowEnd],
      ];
      for (const [field, val] of trackableFields) {
        if (val !== undefined) {
          changedFields.push(field);
        }
      }

      const notesParts: string[] = [];
      if (zoneNote) notesParts.push(zoneNote);
      if (changedFields.length > 0) {
        notesParts.push(`Updated fields: ${changedFields.join(", ")}`);
      }
      const notes = notesParts.length > 0 ? notesParts.join("; ") : "Package updated";

      await tx.packageHistory.create({
        data: {
          packageId,
          status: nextStatus,
          userId,
          notes,
        },
      });

      const updated = await tx.package.update({
        where: { id: packageId },
        data: updateData,
        include: {
          zone: {
            include: { driver: true },
          },
          driver: true,
          history: {
            include: {
              user: {
                select: { id: true, username: true, role: true },
              },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          },
        },
      });

      return {
        updated,
        previousStatus: lockedPkg.status,
        previousDriverId: lockedPkg.driverId,
        zoneChanged,
      };
    });

    await PackageService.invalidatePackageCache(companyId);

    const { updated, previousStatus, previousDriverId, zoneChanged } = txResult;

    emitToRoom(`company-${companyId}`, "package-updated", updated);

    if (updated.status !== previousStatus) {
      emitToRoom(`company-${companyId}`, "package-status-updated", {
        packageId: updated.id,
        status: updated.status,
        zoneId: updated.zoneId,
        lat: updated.lat,
        lng: updated.lng,
        estimatedDeliveryAt: updated.estimatedDeliveryAt,
      });
    }

    if (zoneChanged && updated.driverId && updated.driverId !== previousDriverId) {
      emitToRoom(`company-${companyId}`, "package-assigned", {
        packageId: updated.id,
        driverId: updated.driverId,
        driverName: updated.driver?.name,
      });
    }

    emitToRoom(`company-${companyId}`, "business-event", {
      id: `evt-${Date.now()}-${randomUUID()}`,
      type: "SYSTEM",
      title: zoneChanged ? "Zona de Paquete Reasignada" : "Paquete Actualizado",
      description: zoneChanged
        ? `Paquete #${updated.trackingCode} reasignado${updated.zone ? ` a zona ${updated.zone.name}` : " (sin zona)"}`
        : `Se actualizaron los datos del paquete #${updated.trackingCode}`,
      timestamp: Date.now(),
    });

    return updated;
  }

  static async getPackageHistory(
    companyId: string,
    packageId: string,
    options?: { userRole?: string; userDriverId?: string | null }
  ) {
    // Verify ownership first
    const pkg = await prisma.package.findFirst({
      where: { id: packageId, companyId },
      include: { zone: true },
    });
    if (!pkg) throw new Error("package_not_found");

    if (options?.userRole === "driver") {
      if (!PackageService.isDriverAuthorizedForPackage(pkg, options.userDriverId ?? null)) {
        throw new Error("not_authorized_for_zone");
      }
    }

    return prisma.packageHistory.findMany({
      where: { packageId },
      include: { 
        user: {
          select: { username: true, role: true }
        }
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private static async findPublicPackage<T extends boolean = false>(
    trackingCode: string,
    companySlug?: string,
    includeZone?: T
  ) {
    const normalizedSlug = companySlug?.trim();
    const selectFields = {
      trackingCode: true,
      status: true,
      recipientAddress: true,
      lat: true,
      lng: true,
      estimatedDeliveryAt: true,
      createdAt: true,
      updatedAt: true,
      ...(includeZone ? { driverId: true, zone: { select: { driverId: true } } } : {}),
    };

    if (normalizedSlug) {
      return prisma.package.findFirst({
        where: {
          trackingCode,
          company: { slug: normalizedSlug },
        },
        select: selectFields,
      });
    }

    // Without companySlug, only return if globally unambiguous across tenants
    const matches = await prisma.package.findMany({
      where: { trackingCode },
      take: 2,
      select: selectFields,
    });

    return matches.length === 1 ? matches[0] : null;
  }

  // Public Tracking
  static async getPublicTracking(trackingCode: string, companySlug?: string) {
    const pkg = await this.findPublicPackage(trackingCode, companySlug, false);
    if (!pkg) return null;

    let displayAddress = pkg.recipientAddress;
    const parts = displayAddress.split(" ");
    if (parts.length > 2) {
      displayAddress = `${parts.slice(0, -1).join(" ")} ***`;
    }

    const approxLat = pkg.lat !== null && pkg.lat !== undefined ? Math.round(pkg.lat * 100) / 100 : null;
    const approxLng = pkg.lng !== null && pkg.lng !== undefined ? Math.round(pkg.lng * 100) / 100 : null;

    return {
      ...pkg,
      recipientAddress: displayAddress,
      lat: approxLat,
      lng: approxLng,
    };
  }

  static async getAssignedDriverId(
    trackingCode: string,
    companySlug?: string
  ): Promise<{ driverId: string | null } | null> {
    const pkg = await this.findPublicPackage(trackingCode, companySlug, true);
    if (!pkg) return null;

    const typedPkg = pkg as { driverId?: string | null; zone?: { driverId: string | null } | null };
    return { driverId: typedPkg.driverId ?? typedPkg.zone?.driverId ?? null };
  }

  private static startOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0)
    );
  }

  private static endOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)
    );
  }

  private static addUtcDays(date: Date, days: number): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days, 0, 0, 0, 0)
    );
  }

  private static formatUtcDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private static resolveStatsWindows(now: Date, parsedDateFrom?: Date, parsedDateTo?: Date) {
    const todayStart = PackageService.startOfUtcDay(now);
    const todayEnd = PackageService.endOfUtcDay(now);
    const todayKey = PackageService.formatUtcDateKey(now);
    const hasDateFilter = Boolean(parsedDateFrom || parsedDateTo);

    if (!hasDateFilter) {
      const sevenDayStart = PackageService.addUtcDays(todayStart, -6);
      return {
        todayKey,
        hasDateFilter: false,
        deliveredRange: { gte: todayStart, lte: todayEnd } satisfies Prisma.DateTimeFilter,
        activeUpdatedAtFilter: undefined as Prisma.DateTimeFilter | undefined,
        activityUpdatedAtFilter: { gte: sevenDayStart, lte: todayEnd } satisfies Prisma.DateTimeFilter,
        bucketStartDay: sevenDayStart,
        bucketEndDay: todayStart,
      };
    }

    const explicitRange: Prisma.DateTimeFilter = {
      ...(parsedDateFrom ? { gte: parsedDateFrom } : {}),
      ...(parsedDateTo ? { lte: parsedDateTo } : {}),
    };

    let bucketStartDay: Date;
    let bucketEndDay: Date;

    if (parsedDateFrom && parsedDateTo) {
      bucketStartDay = PackageService.startOfUtcDay(parsedDateFrom);
      bucketEndDay = PackageService.startOfUtcDay(parsedDateTo);
    } else if (parsedDateFrom) {
      bucketStartDay = PackageService.startOfUtcDay(parsedDateFrom);
      bucketEndDay = todayStart >= bucketStartDay ? todayStart : bucketStartDay;
    } else {
      bucketEndDay = PackageService.startOfUtcDay(parsedDateTo!);
      bucketStartDay = PackageService.addUtcDays(bucketEndDay, -6);
    }

    return {
      todayKey,
      hasDateFilter: true,
      deliveredRange: explicitRange,
      activeUpdatedAtFilter: explicitRange,
      activityUpdatedAtFilter: explicitRange,
      bucketStartDay,
      bucketEndDay,
    };
  }

  private static buildWeeklyActivity(
    resolvedPackages: Array<{ status: PackageStatus; updatedAt: Date }>,
    bucketStartDay: Date,
    bucketEndDay: Date
  ) {
    const totalDays =
      Math.floor((bucketEndDay.getTime() - bucketStartDay.getTime()) / MS_PER_DAY) + 1;
    const weeklyMap = new Map<string, { delivered: number; failed: number }>();

    if (totalDays <= MAX_DENSE_WEEKLY_DAYS) {
      for (let offset = 0; offset < totalDays; offset++) {
        const day = PackageService.addUtcDays(bucketStartDay, offset);
        weeklyMap.set(PackageService.formatUtcDateKey(day), { delivered: 0, failed: 0 });
      }
    }

    const bucketStartMs = bucketStartDay.getTime();
    const bucketEndMs = bucketEndDay.getTime();

    for (const pkg of resolvedPackages) {
      const dayKey = PackageService.formatUtcDateKey(pkg.updatedAt);
      let entry = weeklyMap.get(dayKey);
      if (!entry && totalDays > MAX_DENSE_WEEKLY_DAYS) {
        const dayMs = PackageService.startOfUtcDay(pkg.updatedAt).getTime();
        if (dayMs >= bucketStartMs && dayMs <= bucketEndMs) {
          entry = { delivered: 0, failed: 0 };
          weeklyMap.set(dayKey, entry);
        }
      }
      if (!entry) continue;
      if (pkg.status === "delivered") entry.delivered += 1;
      if (pkg.status === "cancelled") entry.failed += 1;
    }

    const entries =
      totalDays > MAX_DENSE_WEEKLY_DAYS
        ? Array.from(weeklyMap.entries()).sort(([a], [b]) => a.localeCompare(b))
        : Array.from(weeklyMap.entries());

    return entries.map(([date, stats]) => ({
      date,
      delivered: stats.delivered,
      failed: stats.failed,
    }));
  }

  private static buildTopDrivers(
    resolvedPackages: Array<{
      status: PackageStatus;
      updatedAt: Date;
      deliveryWindowEnd: Date | null;
      driver: { id: string; name: string } | null;
      zone: { driver: { id: string; name: string } | null } | null;
    }>
  ) {
    const driverStatsMap = new Map<
      string,
      {
        driverId: string;
        name: string;
        delivered: number;
        cancelled: number;
        onTimeDelivered: number;
      }
    >();

    for (const pkg of resolvedPackages) {
      const effectiveDriver = pkg.driver ?? pkg.zone?.driver ?? null;
      if (!effectiveDriver) continue;

      let entry = driverStatsMap.get(effectiveDriver.id);
      if (!entry) {
        entry = {
          driverId: effectiveDriver.id,
          name: effectiveDriver.name,
          delivered: 0,
          cancelled: 0,
          onTimeDelivered: 0,
        };
        driverStatsMap.set(effectiveDriver.id, entry);
      }

      if (pkg.status === "delivered") {
        entry.delivered += 1;
        const isOnTime =
          pkg.deliveryWindowEnd == null || pkg.updatedAt <= pkg.deliveryWindowEnd;
        if (isOnTime) {
          entry.onTimeDelivered += 1;
        }
      } else if (pkg.status === "cancelled") {
        entry.cancelled += 1;
      }
    }

    return Array.from(driverStatsMap.values())
      .filter((d) => d.delivered > 0)
      .map((d) => {
        const resolvedTotal = d.delivered + d.cancelled;
        const efficiency =
          resolvedTotal > 0 ? Math.round((d.onTimeDelivered / resolvedTotal) * 100) : 0;
        return {
          driverId: d.driverId,
          name: d.name,
          delivered: d.delivered,
          efficiency,
        };
      })
      .sort((a, b) => {
        if (b.delivered !== a.delivered) return b.delivered - a.delivered;
        if (b.efficiency !== a.efficiency) return b.efficiency - a.efficiency;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 5);
  }

  /**
   * Computes tenant-scoped dashboard KPIs, zone distribution, daily activity,
   * and consolidated top drivers with optional dateFrom/dateTo filtering.
   */
  static async getDashboardStats(companyId: string, filters: DashboardStatsFilters = {}) {
    const parsedDateFrom = PackageService.resolveDateFilter(filters.dateFrom, "start");
    const parsedDateTo = PackageService.resolveDateFilter(filters.dateTo, "end");

    if (parsedDateFrom && parsedDateTo && parsedDateFrom > parsedDateTo) {
      throw new Error("invalid_date_range");
    }

    const now = new Date();
    const {
      todayKey,
      deliveredRange,
      activeUpdatedAtFilter,
      activityUpdatedAtFilter,
      bucketStartDay,
      bucketEndDay,
    } = PackageService.resolveStatsWindows(now, parsedDateFrom, parsedDateTo);

    const fromCachePart = parsedDateFrom ? parsedDateFrom.toISOString() : "default";
    const toCachePart = parsedDateTo ? parsedDateTo.toISOString() : "default";
    const dayScope = !parsedDateFrom || !parsedDateTo ? `:${todayKey}` : "";
    const cacheKey = `packages:${companyId}:stats:${fromCachePart}:${toCachePart}${dayScope}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Fall back to database on cache read/parse failure
    }

    const activeWhere: Prisma.PackageWhereInput = {
      companyId,
      isArchived: false,
      ...(activeUpdatedAtFilter ? { updatedAt: activeUpdatedAtFilter } : {}),
    };

    const [deliveredPackages, inTransitCount, activeDistribution, zones, resolvedPackages] =
      await Promise.all([
        prisma.package.findMany({
          where: {
            companyId,
            status: "delivered",
            updatedAt: deliveredRange,
          },
          select: { createdAt: true, updatedAt: true },
        }),
        prisma.package.count({
          where: {
            ...activeWhere,
            status: "in_transit",
          },
        }),
        prisma.package.groupBy({
          by: ["zoneId"],
          where: {
            ...activeWhere,
            status: { in: ["pending", "assigned", "in_transit"] },
          },
          _count: { _all: true },
        }),
        prisma.zone.findMany({
          where: { companyId },
          select: { id: true, name: true },
        }),
        prisma.package.findMany({
          where: {
            companyId,
            status: { in: ["delivered", "cancelled"] },
            updatedAt: activityUpdatedAtFilter,
          },
          select: {
            status: true,
            updatedAt: true,
            deliveryWindowEnd: true,
            driver: { select: { id: true, name: true } },
            zone: {
              select: {
                driver: { select: { id: true, name: true } },
              },
            },
          },
        }),
      ]);

    const deliveredTodayCount = deliveredPackages.length;
    let avgTimeMinutes = 0;
    if (deliveredPackages.length > 0) {
      const totalTimeMs = deliveredPackages.reduce((acc, pkg) => {
        return acc + Math.max(0, pkg.updatedAt.getTime() - pkg.createdAt.getTime());
      }, 0);
      avgTimeMinutes = Math.floor(totalTimeMs / deliveredPackages.length / 1000 / 60);
    }

    const zoneNameMap = new Map(zones.map((z) => [z.id, z.name]));
    const zoneDistribution = activeDistribution
      .map((item) => ({
        name: (item.zoneId ? zoneNameMap.get(item.zoneId) : undefined) || "Sin Zona",
        value: item._count._all,
      }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

    let effectiveBucketEndDay = bucketEndDay;
    if (parsedDateFrom && !parsedDateTo && resolvedPackages.length > 0) {
      for (const pkg of resolvedPackages) {
        const pkgDay = PackageService.startOfUtcDay(pkg.updatedAt);
        if (pkgDay > effectiveBucketEndDay) {
          effectiveBucketEndDay = pkgDay;
        }
      }
    }

    const weeklyActivity = PackageService.buildWeeklyActivity(
      resolvedPackages,
      bucketStartDay,
      effectiveBucketEndDay
    );
    const topDrivers = PackageService.buildTopDrivers(resolvedPackages);

    const result = {
      deliveredToday: deliveredTodayCount,
      inTransit: inTransitCount,
      avgDeliveryTimeMinutes: avgTimeMinutes,
      zoneDistribution,
      weeklyActivity,
      topDrivers,
    };

    try {
      await redis.set(cacheKey, JSON.stringify(result), STATS_CACHE_TTL_SECONDS);
    } catch {
      // Cache write failure is non-fatal
    }

    return result;
  }
}
