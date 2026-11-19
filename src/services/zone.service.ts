import { randomUUID } from "crypto";
import { PackageStatus, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { redis } from "../redis";
import { emitToRoom } from "../websocket";
import { detectZone as geoDetectZone } from "../utils/geofencing";

type Coord = [number, number];

export class ZoneService {
  static async getAllZones(companyId: string, filters: { name?: string; page?: number; limit?: number } = {}) {
    const cacheKey = `zones:${companyId}:${JSON.stringify(filters)}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    const { name, page = 1, limit = 10 } = filters;
    const skip = (page - 1) * limit;

    const where: any = { companyId };
    if (name) {
      where.name = { contains: name, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      prisma.zone.findMany({ 
        where,
        include: { driver: true },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.zone.count({ where })
    ]);

    const result = {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    await redis.set(cacheKey, JSON.stringify(result), 3600); // 1 hour cache
    return result;
  }

  static async createZone(
    companyId: string,
    name: string,
    description?: string,
    polygon?: Coord[]
  ) {
    const zone = await prisma.zone.create({ 
      data: { 
        name, 
        description, 
        companyId,
        ...(polygon ? { polygon } : {}),
      } 
    });
    
    await redis.delPrefix(`zones:${companyId}:`); 
    return zone;
  }

  static async resolveActorUserIdTx(
    tx: Prisma.TransactionClient,
    companyId: string,
    userId?: string
  ): Promise<string | undefined> {
    if (userId) {
      const actor = await tx.user.findFirst({
        where: { id: userId, companyId },
        select: { id: true },
      });
      if (actor) return actor.id;
    }

    const fallback = await tx.user.findFirst({
      where: { companyId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return fallback?.id;
  }

  static async transitionPackagesInZonesTx(
    tx: Prisma.TransactionClient,
    params: {
      companyId: string;
      zoneIds: string[];
      fromStatus: PackageStatus;
      toStatus: PackageStatus;
      actorUserId?: string;
      notes: string;
    }
  ): Promise<{ id: string; trackingCode: string; zoneId: string | null }[]> {
    const { companyId, zoneIds, fromStatus, toStatus, actorUserId, notes } = params;
    const uniqueZoneIds = [...new Set(zoneIds)].sort();
    if (uniqueZoneIds.length === 0) return [];

    const lockedPackages = await tx.$queryRaw<
      { id: string; trackingCode: string; zoneId: string | null }[]
    >`
      SELECT "id", "trackingCode", "zoneId"
      FROM "Package"
      WHERE "companyId" = ${companyId}
        AND "zoneId" IN (${Prisma.join(uniqueZoneIds)})
        AND "status" = ${fromStatus}::"PackageStatus"
      ORDER BY "id" ASC
      FOR UPDATE
    `;

    if (lockedPackages.length === 0) return [];

    await tx.package.updateMany({
      where: {
        id: { in: lockedPackages.map((p) => p.id) },
        companyId,
        status: fromStatus,
      },
      data: {
        status: toStatus,
        updatedAt: new Date(),
      },
    });

    if (actorUserId) {
      await tx.packageHistory.createMany({
        data: lockedPackages.map((p) => ({
          packageId: p.id,
          status: toStatus,
          userId: actorUserId,
          notes,
        })),
      });
    }

    return lockedPackages;
  }

  static emitPackageTransitionEvents(
    companyId: string,
    packages: { id: string; trackingCode: string; zoneId: string | null }[],
    status: PackageStatus,
    title: string,
    description: string
  ) {
    if (packages.length === 0) return;

    for (const pkg of packages) {
      emitToRoom(`company-${companyId}`, "package-status-updated", {
        packageId: pkg.id,
        status,
        zoneId: pkg.zoneId,
      });
    }

    emitToRoom(`company-${companyId}`, "business-event", {
      id: `evt-${Date.now()}-${randomUUID()}`,
      type: "SYSTEM",
      title,
      description,
      timestamp: Date.now(),
    });
  }

  static async updateZone(
    zoneId: string, 
    companyId: string, 
    data: { 
      isActive?: boolean; 
      description?: string; 
      driverId?: string | null; 
      name?: string;
      polygon?: Coord[] | null;
    },
    userId?: string
  ) {
    if (!companyId) throw new Error("company_id_required");

    try {
      const { zone, transitionedPackages, newPackageStatus } = await prisma.$transaction(async (tx) => {
        const lockedRows = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Zone" WHERE id = ${zoneId} AND "companyId" = ${companyId} FOR UPDATE
        `;
        if (lockedRows.length === 0) throw new Error('Zone not found');

        const currentZone = await tx.zone.findFirst({ where: { id: zoneId, companyId } });
        if (!currentZone) throw new Error('Zone not found');

        if (data.driverId !== undefined && data.driverId !== null) {
          const driver = await tx.driver.findFirst({
            where: { id: data.driverId, companyId },
          });
          if (!driver) throw new Error('Driver not found');
        }

        const willHaveDriver = data.driverId !== undefined ? data.driverId : currentZone.driverId;

        // Check logic: Can only activate if driver is assigned
        if (data.isActive === true && !willHaveDriver) {
          throw new Error('Cannot activate zone without an assigned driver');
        }

        // A zone without a driver must remain inactive
        const effectiveIsActive = !willHaveDriver
          ? false
          : data.isActive !== undefined
            ? data.isActive
            : currentZone.isActive;

        const updated = await tx.zone.update({
          where: { id: zoneId, companyId },
          data: {
            description: data.description,
            isActive: effectiveIsActive,
            driverId: data.driverId,
            name: data.name,
            ...(data.polygon !== undefined
              ? { polygon: data.polygon === null ? Prisma.DbNull : (data.polygon as any) }
              : {}),
          },
          include: { driver: true },
        });

        const actorUserId = await ZoneService.resolveActorUserIdTx(tx, companyId, userId);

        let packages: { id: string; trackingCode: string; zoneId: string | null }[] = [];
        let targetStatus: PackageStatus = "pending";

        const shouldRevertAssigned =
          data.isActive === false ||
          (currentZone.isActive && !updated.isActive) ||
          !updated.driverId ||
          (currentZone.driverId !== null && currentZone.driverId !== updated.driverId && !updated.isActive);

        if (updated.isActive && updated.driverId) {
          targetStatus = "assigned";
          packages = await ZoneService.transitionPackagesInZonesTx(tx, {
            companyId,
            zoneIds: [zoneId],
            fromStatus: "pending",
            toStatus: "assigned",
            actorUserId,
            notes: `Assigned automatically via active zone ${updated.name}`,
          });
        } else if (shouldRevertAssigned) {
          targetStatus = "pending";
          packages = await ZoneService.transitionPackagesInZonesTx(tx, {
            companyId,
            zoneIds: [zoneId],
            fromStatus: "assigned",
            toStatus: "pending",
            actorUserId,
            notes: `Reverted to pending: zone ${updated.name} deactivated or unassigned`,
          });
        }

        return {
          zone: updated,
          transitionedPackages: packages,
          newPackageStatus: targetStatus,
        };
      });

      const keysToInvalidate = [
        `zones:${companyId}`,
        `drivers:${companyId}`,
      ];
      await Promise.all(keysToInvalidate.map((k) => redis.delPrefix(`${k}:`)));

      ZoneService.emitPackageTransitionEvents(
        companyId,
        transitionedPackages,
        newPackageStatus,
        newPackageStatus === "assigned" ? "Zona Activada" : "Zona Desactivada",
        newPackageStatus === "assigned"
          ? `${transitionedPackages.length} paquete(s) asignado(s) automáticamente en la zona ${zone.name}`
          : `${transitionedPackages.length} paquete(s) revertido(s) a pendiente en la zona ${zone.name}`
      );

      return zone;
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new Error('Zone not found');
        }
        if (error.code === 'P2003') {
          throw new Error('Driver not found');
        }
      }
      console.error("Error in ZoneService.updateZone:", error);
      throw error;
    }
  }

  static async setAllZonesStatus(companyId: string, isActive: boolean, userId?: string) {
    if (!companyId) throw new Error("company_id_required");

    const toStatus: PackageStatus = isActive ? "assigned" : "pending";
    const fromStatus: PackageStatus = isActive ? "pending" : "assigned";

    const { count, transitionedPackages } = await prisma.$transaction(async (tx) => {
      const lockedZones = isActive
        ? await tx.$queryRaw<{ id: string }[]>`
            SELECT "id"
            FROM "Zone"
            WHERE "companyId" = ${companyId} AND "driverId" IS NOT NULL
            ORDER BY "id" ASC
            FOR UPDATE
          `
        : await tx.$queryRaw<{ id: string }[]>`
            SELECT "id"
            FROM "Zone"
            WHERE "companyId" = ${companyId}
            ORDER BY "id" ASC
            FOR UPDATE
          `;

      const targetZoneIds = lockedZones.map((z) => z.id);
      if (targetZoneIds.length === 0) {
        return { count: 0, transitionedPackages: [] as { id: string; trackingCode: string; zoneId: string | null }[] };
      }

      const result = await tx.zone.updateMany({
        where: {
          id: { in: targetZoneIds },
          companyId,
        },
        data: { isActive },
      });

      const actorUserId = await ZoneService.resolveActorUserIdTx(tx, companyId, userId);

      const packages = await ZoneService.transitionPackagesInZonesTx(tx, {
        companyId,
        zoneIds: targetZoneIds,
        fromStatus,
        toStatus,
        actorUserId,
        notes: isActive
          ? "Assigned automatically via bulk zone activation"
          : "Reverted to pending via bulk zone deactivation",
      });

      return { count: result.count, transitionedPackages: packages };
    });

    await Promise.all([
      redis.delPrefix(`zones:${companyId}:`),
      redis.delPrefix(`drivers:${companyId}:`),
    ]);

    ZoneService.emitPackageTransitionEvents(
      companyId,
      transitionedPackages,
      toStatus,
      isActive ? "Activación Masiva de Zonas" : "Desactivación Masiva de Zonas",
      isActive
        ? `${transitionedPackages.length} paquete(s) asignado(s) automáticamente`
        : `${transitionedPackages.length} paquete(s) revertido(s) a pendiente`
    );

    return { count };
  }

  /**
   * Auto-detect which zone contains the given coordinates.
   * Evaluates all zones with a defined polygon for the company.
   * Returns the matching zone or null if none match.
   */
  static async detectZone(
    companyId: string,
    lat: number,
    lng: number
  ): Promise<{ id: string; name: string } | null> {
    return geoDetectZone(companyId, lat, lng);
  }
}
