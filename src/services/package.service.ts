import { prisma } from "../prisma";
import { PackageStatus } from "@prisma/client";
import { emitToAll } from "../websocket";

export class PackageService {
  static async getAllPackages(companyId: string, filters: {
    status?: PackageStatus;
    zoneId?: string;
    trackingCode?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, zoneId, trackingCode, page = 1, limit = 10 } = filters;
    const skip = (page - 1) * limit;

    const where: any = { companyId }; // FORCE COMPANY ID
    if (status) where.status = status;
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

  static async createPackage(companyId: string, data: {
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
    const { 
      trackingCode, 
      recipientName, recipientAddress, recipientPhone, recipientEmail,
      addressStreet, addressNumber, addressReferences,
      senderName, senderAddress, senderPhone,
      weight, volume,
      zoneId, userId, lat, lng, estimatedDeliveryAt 
    } = data;
    
    // Validate Zone belongs to Company (if provided)
    if (zoneId) {
        const zone = await prisma.zone.findFirst({ where: { id: zoneId, companyId } });
        if (!zone) {
            throw new Error("zone_not_found");
        }
    }

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
          lat,
          lng,
          estimatedDeliveryAt,
          zoneId,
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
      
      emitToAll("package-created", pkg);
      return pkg;
    });
  }

  static async getPackagesByDriver(companyId: string, driverId: string) {
    // Ensure driver belongs to company
    const driver = await prisma.driver.findFirst({
      where: { id: driverId, companyId },
    });
    if (!driver) throw new Error("driver_not_found");

    return prisma.package.findMany({
      where: { 
        companyId,
        zone: { driverId }
      },
      include: { zone: true },
    });
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
  }) {
    const { packageId, status, userId, userRole, userDriverId, lat, lng, estimatedDeliveryAt } = params;
    
    // Scoped find
    const pkg = await prisma.package.findFirst({ 
      where: { id: packageId, companyId },
      include: { zone: true }
    });
    
    if (!pkg) throw new Error("package_not_found");

    // Business Logic: Driver restricted to their zone
    if (userRole === "driver" && pkg.zone.driverId !== userDriverId) {
      throw new Error("not_authorized_for_zone");
    }

    const allowedTransitions: Record<PackageStatus, PackageStatus[]> = {
      pending: ["assigned", "cancelled"],
      assigned: ["in_transit", "cancelled"],
      in_transit: ["delivered"],
      delivered: [],
      cancelled: [],
    };

    const allowed = allowedTransitions[pkg.status as PackageStatus];
    if (!allowed.includes(status)) {
      throw new Error(`invalid_transition:${pkg.status}:${status}`);
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.package.update({
        where: { id: packageId },
        data: { 
          status,
          lat,
          lng,
          estimatedDeliveryAt
        }
      });

      await tx.packageHistory.create({
        data: {
          packageId,
          status,
          userId,
          notes: `Status updated to ${status}`
        }
      });

      emitToAll("package-status-updated", { 
        packageId, 
        status, 
        lat, 
        lng, 
        estimatedDeliveryAt 
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

    if (pkg.zone.driverId !== driverId) {
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

      emitToAll("package-assigned", { packageId, driverId, driverName: driver.name });
      return updated;
    });
  }

  static async getMyPackages(companyId: string, driverId: string) {
    return prisma.package.findMany({
      where: { 
        companyId,
        zone: {
          driverId: driverId
        }
      },
      include: { zone: true },
    });
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

  // Public Tracking 
  // Note: Since trackingCode is scoped by company, this might return the first match found.
  // Ideally, public tracking should include company slug in URL.
  static async getPublicTracking(trackingCode: string) {
    const pkg = await prisma.package.findFirst({
      where: { trackingCode },
      select: {
        trackingCode: true,
        status: true,
        address: true,
        lat: true,
        lng: true,
        estimatedDeliveryAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!pkg) return null;

    const parts = pkg.address.split(" ");
    if (parts.length > 2) {
      pkg.address = `${parts.slice(0, -1).join(" ")} ***`;
    }

    return pkg;
  }

  static async getAssignedDriverId(trackingCode: string) {
    const pkg = await prisma.package.findFirst({
      where: { trackingCode },
      include: {
        zone: true 
      }
    });

    if (!pkg) return null;
    return pkg.zone.driverId; 
  }
}
