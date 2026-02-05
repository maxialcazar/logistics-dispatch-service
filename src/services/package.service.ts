import { prisma } from "../prisma";
import { PackageStatus } from "@prisma/client";

export class PackageService {
  static async getAllPackages(filters: {
    status?: PackageStatus;
    zoneId?: string;
    trackingCode?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, zoneId, trackingCode, page = 1, limit = 10 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
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

  static async createPackage(trackingCode: string, zoneId: string) {
    const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
    if (!zone) {
      throw new Error("zone_not_found");
    }

    return prisma.package.create({
      data: { trackingCode, zoneId, status: "pending" },
      include: { 
        zone: {
          include: { driver: true }
        }
      },
    });
  }

  static async getPackagesByDriver(driverId: string) {
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
    });
    if (!driver) throw new Error("driver_not_found");

    return prisma.package.findMany({
      where: { 
        zone: { driverId }
      },
      include: { zone: true },
    });
  }

  static async updateStatus(packageId: string, status: PackageStatus, userRole: string, userDriverId: string | null) {
    const pkg = await prisma.package.findUnique({ 
      where: { id: packageId },
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

    return prisma.package.update({
      where: { id: packageId },
      data: { status },
    });
  }

  static async assignToDriver(packageId: string, driverId: string) {
    const pkg = await prisma.package.findUnique({ 
      where: { id: packageId },
      include: { zone: true } 
    });
    if (!pkg) throw new Error("package_not_found");

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { zones: true },
    });
    if (!driver) throw new Error("driver_not_found");

    if (pkg.zone.driverId !== driverId) {
      throw new Error("driver_not_in_zone");
    }

    return prisma.package.update({
      where: { id: packageId },
      data: { status: "assigned" },
      include: { 
        zone: {
          include: { driver: true }
        }
      },
    });
  }

  static async getMyPackages(driverId: string) {
    return prisma.package.findMany({
      where: { 
        zone: {
          driverId: driverId
        }
      },
      include: { zone: true },
    });
  }
}
