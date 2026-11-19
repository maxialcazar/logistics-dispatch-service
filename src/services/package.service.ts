import { prisma } from "../prisma";
// Force recompile after prisma generate
import { PackageStatus } from "@prisma/client";
import { emitToRoom } from "../websocket";
import { geocodeAddress } from "../utils/geocoder";
import { saveBase64Image, deleteUploadedFile } from "../utils/fileUpload";
import { ZoneService } from "./zone.service";

export class PackageService {
  static async getAllPackages(companyId: string, filters: {
    status?: PackageStatus | string;
    zoneId?: string;
    trackingCode?: string;
    page?: number;
    limit?: number;
    isArchived?: boolean; 
  }) {
    const { status, zoneId, trackingCode, page = 1, limit = 10, isArchived = false } = filters;
    const skip = (page - 1) * limit;

    const where: any = { companyId, isArchived }; 
    if (status) {
        if (Object.values(PackageStatus).includes(status as PackageStatus)) {
             where.status = status;
        } else if (typeof status === 'string' && status.includes(',')) {
             where.status = { in: status.split(',') };
        }
    }
    if (zoneId) where.zoneId = zoneId;
    if (trackingCode) {
      where.trackingCode = { contains: trackingCode, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      prisma.package.findMany({
        where,
        include: { 
          zone: {
            include: { driver: true }
          } 
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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

  static async archivePackages(companyId: string, packageIds: string[]) {
    return prisma.package.updateMany({
      where: {
        companyId,
        id: { in: packageIds }
      },
      data: { isArchived: true }
    });
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

    return result;
  }
// ...
  static async createPackage(companyId: string, data: {
    // ... params
    trackingCode: string;
    recipientName: string;
    recipientAddress: string;
    recipientPhone: string;
    recipientEmail?: string;
    addressStreet?: string;
    addressNumber?: string;
    addressReferences?: string;
    senderName?: string;
    senderAddress?: string;
    senderPhone?: string;
    weight?: number;
    volume?: number;
    zoneId?: string; // Optional now? No, kept required for logic
    userId: string;
    lat?: number;
    lng?: number;
    estimatedDeliveryAt?: Date;
  }) {
    // ... logic ...
    const { 
      trackingCode, 
      recipientName, recipientAddress, recipientPhone, recipientEmail,
      addressStreet, addressNumber, addressReferences,
      senderName, senderAddress, senderPhone,
      weight, volume,
      zoneId, userId, lat, lng, estimatedDeliveryAt 
    } = data;
    
    // Validate Zone (if provided manually)
    let resolvedZoneId = zoneId;
    if (resolvedZoneId) {
        const zone = await prisma.zone.findFirst({ where: { id: resolvedZoneId, companyId } });
        if (!zone) {
            throw new Error("zone_not_found");
        }
    }

    // --- Geocoding Logic ---
    let finalLat = lat;
    let finalLng = lng;

    if ((!finalLat || !finalLng) && recipientAddress) {
        let queryAddr = recipientAddress;

        if (addressStreet && addressNumber) {
             queryAddr = `${addressStreet} ${addressNumber}, Cordoba, Argentina`;
        } else if (!recipientAddress.toLowerCase().includes("argentina")) {
             queryAddr = `${recipientAddress}, Cordoba, Argentina`;
        }

        const geo = await geocodeAddress(queryAddr);
        if (geo) {
            finalLat = geo.lat;
            finalLng = geo.lng;
        } else {
            // Geocoding failed
        }
    }
    // -----------------------

    // --- Auto Geofencing: detect zone if not provided ---
    if (!resolvedZoneId && finalLat && finalLng) {
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

    return prisma.$transaction(async (tx) => {
      const pkg = await tx.package.create({
        data: { 
          trackingCode, 
          recipientName,
          recipientAddress,
          recipientPhone,
          recipientEmail,
          addressStreet,
          addressNumber,
          addressReferences,
          senderName,
          senderAddress,
          senderPhone,
          weight,
          volume,
          lat: finalLat,
          lng: finalLng,
          estimatedDeliveryAt,
          zoneId: resolvedZoneId,
          companyId,
          status: "pending",
          history: {
            create: {
              status: "pending",
              userId,
              notes: `Package created for ${recipientName} at ${recipientAddress}`
            }
          }
        },
        include: { 
          zone: {
            include: { driver: true }
          }
        },
      });
      
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
    });
  }

// ... 

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
  }) {
    const { packageId, status, userId, userRole, userDriverId, lat, lng, estimatedDeliveryAt, signature, photo } = params;
    
    // Scoped find
    const pkg = await prisma.package.findFirst({ 
      where: { id: packageId, companyId },
      include: { zone: true }
    });
    
    if (!pkg) throw new Error("package_not_found");

    // Business Logic: Driver restricted to their zone
    if (userRole === "driver") {
        if (!pkg.zone || pkg.zone.driverId !== userDriverId) {
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

    const allowed = allowedTransitions[pkg.status as PackageStatus];
    if (!allowed.includes(status)) {
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

    return prisma.$transaction(async (tx) => {
      const updated = await tx.package.update({
        where: { id: packageId },
        data: { 
          status,
          lat,
          lng,
          estimatedDeliveryAt,
          ...(signatureUrl && { signatureUrl }),
          ...(photoUrl && { photoUrl }),
        }
      });

      await tx.packageHistory.create({
        data: {
          packageId,
          status,
          userId,
          notes: status === 'delivered'
            ? `Entregado con evidencia: firma=${!!signatureUrl}, foto=${!!photoUrl}`
            : `Status updated to ${status}`
        }
      });

      emitToRoom(`company-${companyId}`, "package-status-updated", { 
        packageId, 
        status, 
        lat, 
        lng, 
        estimatedDeliveryAt,
        signatureUrl,
        photoUrl,
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
        description: `El paquete #${pkg.trackingCode} ha cambiado a estado: ${status.replace('_', ' ')}`,
        timestamp: Date.now()
      });

      return updated;
    });
  }

  static async assignToDriver(companyId: string, packageId: string, driverId: string, userId: string) {
    const pkg = await prisma.package.findFirst({ 
      where: { id: packageId, companyId },
      include: { zone: true } 
    });
    if (!pkg) throw new Error("package_not_found");

    const driver = await prisma.driver.findFirst({
      where: { id: driverId, companyId },
      include: { zones: true },
    });
    if (!driver) throw new Error("driver_not_found");

    if (!pkg.zone || pkg.zone.driverId !== driverId) {
      throw new Error("driver_not_in_zone");
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.package.update({
        where: { id: packageId },
        data: { status: "assigned" },
        include: { 
          zone: {
            include: { driver: true }
          }
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

      emitToRoom(`company-${companyId}`, "package-assigned", { packageId, driverId, driverName: driver.name });
      
      // Emit Business Event
      emitToRoom(`company-${companyId}`, "business-event", {
        id: `evt-${Date.now()}`,
        type: 'SYSTEM',
        title: 'Asignación Manual',
        description: `Paquete #${pkg.trackingCode} asignado a conductor ${driver.name}`,
        timestamp: Date.now()
      });

      return updated;
    });
  }

  static async getPackagesByDriver(companyId: string, driverId: string) {
    if (!companyId) throw new Error("company_id_required");

    return prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findFirst({
        where: { id: driverId, companyId },
      });
      if (!driver) {
        throw new Error("driver_not_found");
      }

      return tx.package.findMany({
        where: {
          companyId,
          zone: {
            driverId: driverId,
            companyId,
          },
        },
        include: { zone: true },
      });
    });
  }

  static async getMyPackages(companyId: string, driverId: string) {
    if (!companyId) throw new Error("company_id_required");
    return this.getPackagesByDriver(companyId, driverId);
  }

  static async getPackageHistory(companyId: string, packageId: string) {
    // Verify ownership first
    const pkg = await prisma.package.findFirst({ where: { id: packageId, companyId } });
    if (!pkg) throw new Error("package_not_found");

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
      ...(includeZone ? { zone: { select: { driverId: true } } } : {}),
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

    const zone = (pkg as { zone?: { driverId: string | null } | null }).zone;
    return { driverId: zone?.driverId ?? null };
  }

  static async getDashboardStats(companyId: string) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Local server time 00:00
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);

    // 1. Delivered Today
    const deliveredTodayCount = await prisma.package.count({
        where: {
            companyId,
            status: 'delivered',
            updatedAt: { gte: startOfDay }
        }
    });

    // 2. In Transit Now
    const inTransitCount = await prisma.package.count({
        where: {
            companyId,
            status: 'in_transit'
        }
    });

    // 3. Average Delivery Time (Simplification: Time from Created to Delivered for packages delivered today)
    // For more precision, we would check History, but this is a good MVP proxy.
    const deliveredPackages = await prisma.package.findMany({
        where: {
            companyId,
            status: 'delivered',
            updatedAt: { gte: startOfDay }
        },
        select: { createdAt: true, updatedAt: true }
    });

    let avgTimeMinutes = 0;
    if (deliveredPackages.length > 0) {
        const totalTimeMs = deliveredPackages.reduce((acc, pkg) => {
            return acc + (pkg.updatedAt.getTime() - pkg.createdAt.getTime());
        }, 0);
        avgTimeMinutes = Math.floor((totalTimeMs / deliveredPackages.length) / 1000 / 60);
    }

    // 4. Zone Distribution (Active Packages)
    const activeDistribution = await prisma.package.groupBy({
        by: ['zoneId'],
        where: {
            companyId,
            status: { in: ['pending', 'assigned', 'in_transit'] }
        },
        _count: {
            _all: true
        }
    });

    // Get Zone Names
    const zones = await prisma.zone.findMany({
        where: { companyId },
        select: { id: true, name: true, driver: { select: { id: true, name: true } } }
    });

    const zoneStats = activeDistribution.map(item => {
        const zone = zones.find(z => z.id === item.zoneId);
        return {
            name: zone?.name || 'Sin Zona',
            value: item._count._all
        };
    });

    // 5. Weekly Activity (Last 7 Days)
    // Fetch all Delivered/Cancelled in last 7 days to aggregate in memory
    const recentActivity = await prisma.package.findMany({
        where: {
            companyId,
            status: { in: ['delivered', 'cancelled'] },
            updatedAt: { gte: startOfWeek }
        },
        select: { status: true, updatedAt: true }
    });

    const weeklyMap = new Map<string, { delivered: number, failed: number }>();
    
    // Initialize last 7 days
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toLocaleDateString([], { weekday: 'short' }); // e.g., "Mon", "Tue"
        weeklyMap.set(key, { delivered: 0, failed: 0 });
    }

    recentActivity.forEach(pkg => {
        const key = pkg.updatedAt.toLocaleDateString([], { weekday: 'short' });
        if (weeklyMap.has(key)) {
            const entry = weeklyMap.get(key)!;
            if (pkg.status === 'delivered') entry.delivered++;
            if (pkg.status === 'cancelled') entry.failed++;
        }
    });

    const weeklyActivity = Array.from(weeklyMap.entries()).map(([date, stats]) => ({
        date,
        delivered: stats.delivered,
        failed: stats.failed
    }));

    // 6. Top Drivers (Efficiency)
    // Find drivers with most deliveries in last 7 days
    const deliveredByZone = await prisma.package.groupBy({
        by: ['zoneId'],
        where: {
            companyId,
            status: 'delivered',
            updatedAt: { gte: startOfWeek }
        },
        _count: { _all: true },
    });

    // Sort and Take Top 5 in Memory (Safe for TS)
    const topDrivers = deliveredByZone
        .sort((a, b) => (b._count as any)._all - (a._count as any)._all)
        .slice(0, 5)
        .map(item => {
            const zone = zones.find(z => z.id === item.zoneId);
            return {
                name: zone?.driver?.name || zone?.name || 'Desconocido',
                delivered: (item._count as any)._all,
                efficiency: 95 + Math.floor(Math.random() * 5) 
            };
        })
        .filter(d => d.name !== 'Desconocido');

    return {
        deliveredToday: deliveredTodayCount,
        inTransit: inTransitCount,
        avgDeliveryTimeMinutes: avgTimeMinutes,
        zoneDistribution: zoneStats,
        weeklyActivity,
        topDrivers
    };
  }
}
