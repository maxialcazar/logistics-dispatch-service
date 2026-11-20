import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import bcrypt from "bcrypt";
import { redis } from "../redis";
import { emitToRoom } from "../websocket";
import logger from "../utils/logger";
import { ZoneService } from "./zone.service";

const LOCATION_BUFFER_KEY = "drivers:locations:buffer";
const LOCATION_SYNC_KEY = "drivers:locations:buffer:sync";
const LOCATION_SYNC_LOCK_KEY = "drivers:locations:sync:lock";
const SYNC_BATCH_SIZE = 10;
const NON_TRANSIENT_PRISMA_CODES = new Set([
  "P2000",
  "P2002",
  "P2003",
  "P2005",
  "P2006",
  "P2007",
  "P2011",
  "P2012",
  "P2023",
  "P2025",
]);

interface BufferedLocation {
  lat: number;
  lng: number;
  ts?: number;
  companyId?: string;
}

function isValidCoordinatePayload(parsed: unknown): parsed is BufferedLocation {
  if (!parsed || typeof parsed !== "object") return false;
  const candidate = parsed as Record<string, unknown>;
  return (
    typeof candidate.lat === "number" &&
    Number.isFinite(candidate.lat) &&
    candidate.lat >= -90 &&
    candidate.lat <= 90 &&
    typeof candidate.lng === "number" &&
    Number.isFinite(candidate.lng) &&
    candidate.lng >= -180 &&
    candidate.lng <= 180
  );
}

export class DriverService {
  private static activeSyncPromise: Promise<void> | null = null;

  static async waitForActiveSync(): Promise<void> {
    if (this.activeSyncPromise) {
      await this.activeSyncPromise.catch(() => {});
    }
  }

  private static async overlayLiveLocations<T extends { id: string; lat?: number | null; lng?: number | null }>(
    items: T[]
  ): Promise<T[]> {
    if (!Array.isArray(items) || items.length === 0) return items;
    try {
      const values = await redis.hmGet(
        LOCATION_BUFFER_KEY,
        items.map((item) => item.id)
      );
      if (!values || values.length === 0) return items;

      return items.map((item, index) => {
        const raw = values[index];
        if (!raw) return item;
        try {
          const parsed = JSON.parse(raw);
          if (isValidCoordinatePayload(parsed)) {
            return { ...item, lat: parsed.lat, lng: parsed.lng };
          }
        } catch {
          // Ignore malformed buffer entry
        }
        return item;
      });
    } catch {
      return items;
    }
  }

  static async getAllDrivers(companyId: string, filters: { name?: string; page?: number; limit?: number } = {}) {
    const cacheKey = `drivers:${companyId}:${JSON.stringify(filters)}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      const parsed = JSON.parse(cached);
      return {
        ...parsed,
        items: await this.overlayLiveLocations(parsed.items),
      };
    }

    const { name, page = 1, limit = 10 } = filters;
    const skip = (page - 1) * limit;

    const where: any = { companyId };
    if (name) {
      where.name = { contains: name, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      prisma.driver.findMany({
        where,
        include: { 
          zones: true,
          user: { select: { username: true } } 
        },
        skip,
        take: limit,
      }),
      prisma.driver.count({ where }),
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

    await redis.set(cacheKey, JSON.stringify(result), 1800); // 30 min cache
    return {
      ...result,
      items: await this.overlayLiveLocations(result.items),
    };
  }

  static async createDriver(companyId: string, data: any) {
    const { name, username, password } = data;

    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      throw new Error("username_exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let driver;
    try {
      driver = await prisma.driver.create({
        data: {
          name,
          companyId,
          user: {
            create: {
              username,
              password: hashedPassword,
              role: "driver",
              companyId,
            },
          },
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              role: true,
              companyId: true,
            },
          },
        },
      });
    } catch (error: any) {
      if (error?.code === "P2002") {
        throw new Error("username_exists");
      }
      throw error;
    }

    await redis.delPrefix(`drivers:${companyId}:`); 
    return driver;
  }

  static async assignZones(companyId: string, driverId: string, zoneIds: string[], userId?: string) {
    if (!companyId) throw new Error("company_id_required");

    const uniqueZoneIds = [...new Set(zoneIds)];

    const { revertedPackages, activatedPackages, reassignedPackages, driverName } = await prisma.$transaction(async (tx) => {
      // Lock driver row (FOR NO KEY UPDATE) so concurrent zone assignments for the same driver serialize cleanly
      const driverRows = await tx.$queryRaw<{ id: string; name: string }[]>`
        SELECT "id", "name"
        FROM "Driver"
        WHERE "id" = ${driverId} AND "companyId" = ${companyId}
        FOR NO KEY UPDATE
      `;
      if (driverRows.length === 0) throw new Error("driver_not_found");
      const driver = driverRows[0];

      // Lock all affected zones (currently owned by driver or targeted for assignment) in deterministic order
      const lockedZones = uniqueZoneIds.length > 0
        ? await tx.$queryRaw<{ id: string; name: string; driverId: string | null; isActive: boolean }[]>`
            SELECT "id", "name", "driverId", "isActive"
            FROM "Zone"
            WHERE "companyId" = ${companyId}
              AND ("driverId" = ${driverId} OR "id" IN (${Prisma.join(uniqueZoneIds)}))
            ORDER BY "id" ASC
            FOR UPDATE
          `
        : await tx.$queryRaw<{ id: string; name: string; driverId: string | null; isActive: boolean }[]>`
            SELECT "id", "name", "driverId", "isActive"
            FROM "Zone"
            WHERE "companyId" = ${companyId}
              AND "driverId" = ${driverId}
            ORDER BY "id" ASC
            FOR UPDATE
          `;

      const lockedZoneIds = new Set(lockedZones.map((z) => z.id));
      if (uniqueZoneIds.some((id) => !lockedZoneIds.has(id))) {
        throw new Error("zones_not_founded_or_access_denied");
      }

      const targetZoneIdSet = new Set(uniqueZoneIds);
      const removedZoneIds = lockedZones
        .filter((z) => z.driverId === driverId && !targetZoneIdSet.has(z.id))
        .map((z) => z.id);
      const assignedZones = lockedZones.filter((z) => targetZoneIdSet.has(z.id));

      // 1. Liberar zonas previas de este driver que no permanecen asignadas
      if (removedZoneIds.length > 0) {
        await tx.zone.updateMany({
          where: { id: { in: removedZoneIds }, companyId },
          data: { driverId: null, isActive: false },
        });
      }

      // 2. Asignar nuevas zonas
      if (uniqueZoneIds.length > 0) {
        await tx.zone.updateMany({
          where: { id: { in: uniqueZoneIds }, companyId },
          data: { driverId },
        });
      }

      const actorUserId = await ZoneService.resolveActorUserIdTx(tx, companyId, userId);

      // 3. Revertir a pending paquetes assigned en zonas removidas o reasignadas a otro conductor estando inactivas
      const zonesToRevert = [
        ...removedZoneIds,
        ...assignedZones
          .filter((z) => z.driverId !== driverId && !z.isActive)
          .map((z) => z.id),
      ];
      const reverted = await ZoneService.transitionPackagesInZonesTx(tx, {
        companyId,
        zoneIds: zonesToRevert,
        fromStatus: "assigned",
        toStatus: "pending",
        actorUserId,
        notes: "Reverted to pending: zone unassigned or inactive",
      });

      // 4. Asignar paquetes pending en zonas activas asignadas al conductor
      const zonesToActivate = assignedZones.filter((z) => z.isActive).map((z) => z.id);
      const driverIdByZone = new Map(zonesToActivate.map((zId) => [zId, driverId]));
      const activated = await ZoneService.transitionPackagesInZonesTx(tx, {
        companyId,
        zoneIds: zonesToActivate,
        fromStatus: "pending",
        toStatus: "assigned",
        actorUserId,
        notes: `Assigned automatically via active zone assigned to driver ${driver.name}`,
        driverIdByZone,
      });

      // 5. Actualizar driverId solo en paquetes aun en estado assigned de zonas activas transferidas desde otro conductor
      const reassignedActiveZones = assignedZones
        .filter((z) => z.isActive && z.driverId !== driverId)
        .map((z) => z.id);
      const reassigned = await ZoneService.reassignAssignedPackagesInZonesTx(tx, {
        companyId,
        zoneIds: reassignedActiveZones,
        driverId,
        actorUserId,
        notes: `Reassigned to driver ${driver.name} via active zone transfer`,
      });

      return {
        revertedPackages: reverted,
        activatedPackages: activated,
        reassignedPackages: reassigned,
        driverName: driver.name,
      };
    });

    // Invalidate caches
    await Promise.all([
      redis.delPrefix(`drivers:${companyId}:`),
      redis.delPrefix(`zones:${companyId}:`),
    ]);

    emitToRoom(`company-${companyId}`, "zones-reassigned", { driverId, zoneIds: uniqueZoneIds });

    for (const pkg of reassignedPackages) {
      emitToRoom(`company-${companyId}`, "package-assigned", {
        packageId: pkg.id,
        driverId,
        driverName,
      });
    }

    ZoneService.emitPackageTransitionEvents(
      companyId,
      revertedPackages,
      "pending",
      "Zonas Desasignadas",
      `${revertedPackages.length} paquete(s) revertido(s) a pendiente al desvincular zonas de ${driverName}`
    );

    ZoneService.emitPackageTransitionEvents(
      companyId,
      activatedPackages,
      "assigned",
      "Zonas Reasignadas",
      `${activatedPackages.length} paquete(s) asignado(s) automáticamente a ${driverName}`
    );

    return { ok: true };
  }

  static async getDriverZones(companyId: string, driverId: string) {
    if (!companyId) throw new Error("company_id_required");

    const driver = await prisma.driver.findFirst({
      where: { id: driverId, companyId },
      include: {
        zones: {
          where: { companyId },
        },
      },
    });
    if (!driver) {
      throw new Error("driver_not_found");
    }

    return driver.zones;
  }

  static async updateLocation(driverId: string, companyId: string, lat: number, lng: number) {
    const ts = Date.now();

    // 1. Buffer in Redis (Write-Back)
    await redis.hSet(
      LOCATION_BUFFER_KEY,
      driverId,
      JSON.stringify({ lat, lng, ts, companyId })
    );

    // 2. Publish Real-Time
    const payload = JSON.stringify({
      driverId,
      companyId,
      lat,
      lng,
      timestamp: ts,
    });

    await redis.publish("driver.location.updated", payload);

    return { id: driverId, lat, lng, updatedAt: new Date() };
  }

  // Background Worker to flush Redis buffer to Postgres
  static async syncLocationBuffer(): Promise<void> {
    if (this.activeSyncPromise) {
      return this.activeSyncPromise;
    }

    const run = this.runSyncLocationBuffer().finally(() => {
      if (this.activeSyncPromise === run) {
        this.activeSyncPromise = null;
      }
    });

    this.activeSyncPromise = run;
    return run;
  }

  private static async runSyncLocationBuffer(): Promise<void> {
    const syncKey = LOCATION_SYNC_KEY;
    const lockKey = LOCATION_SYNC_LOCK_KEY;
    const lockToken = randomUUID();

    // Atomically acquire distributed lock and claim/merge buffer into syncKey as first step
    const claimed = await redis.claimLocationSyncBuffer(
      LOCATION_BUFFER_KEY,
      syncKey,
      lockKey,
      lockToken,
      30000
    );
    if (!claimed) return;

    const affectedCompanyIds = new Set<string>();
    try {
      await this.processSyncKey(syncKey, affectedCompanyIds);

      if (affectedCompanyIds.size > 0) {
        await Promise.allSettled(
          Array.from(affectedCompanyIds).map((cId) => redis.delPrefix(`drivers:${cId}:`))
        );
      }
    } finally {
      await redis.releaseLocationSyncLock(lockKey, lockToken).catch((err) => {
        logger.error("Failed to release location sync lock", { lockKey, error: err });
      });
    }
  }

  private static async processSyncKey(syncKey: string, affectedCompanyIds: Set<string>) {
    let all: Record<string, string>;
    try {
      all = await redis.hGetAll(syncKey);
    } catch (err) {
      logger.error("Failed to read sync buffer key from Redis", { syncKey, error: err });
      return;
    }

    const entries = Object.entries(all || {});
    if (entries.length === 0) {
      await redis.del(syncKey).catch(() => {});
      return;
    }

    const validEntries: Array<{ id: string; raw: string; data: BufferedLocation }> = [];
    const handledIds: string[] = [];
    let hasUnrecoveredFailure = false;

    for (const [id, raw] of entries) {
      try {
        const parsed = JSON.parse(raw);
        if (isValidCoordinatePayload(parsed)) {
          validEntries.push({ id, raw, data: parsed });
        } else {
          logger.warn("Discarding out-of-range or invalid buffered driver location", { driverId: id });
          handledIds.push(id);
        }
      } catch {
        logger.warn("Discarding malformed JSON in buffered driver location", { driverId: id });
        handledIds.push(id);
      }
    }

    for (let offset = 0; offset < validEntries.length; offset += SYNC_BATCH_SIZE) {
      const chunk = validEntries.slice(offset, offset + SYNC_BATCH_SIZE);
      const results = await Promise.allSettled(
        chunk.map(async (entry) => {
          const updated = await prisma.driver.update({
            where: { id: entry.id },
            data: { lat: entry.data.lat, lng: entry.data.lng },
            select: { id: true, companyId: true },
          });
          return { entry, companyId: updated.companyId };
        })
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const entry = chunk[i];

        if (result.status === "fulfilled") {
          if (result.value.companyId) {
            affectedCompanyIds.add(result.value.companyId);
          }
          if (typeof entry.data.companyId === "string" && entry.data.companyId) {
            affectedCompanyIds.add(entry.data.companyId);
          }
          handledIds.push(entry.id);
          continue;
        }

        const err = result.reason as any;
        const isNonTransient =
          (typeof err?.code === "string" && NON_TRANSIENT_PRISMA_CODES.has(err.code)) ||
          err?.name === "PrismaClientValidationError";

        if (isNonTransient) {
          if (err?.code !== "P2025") {
            logger.warn("Discarding non-transient driver location update failure", {
              driverId: entry.id,
              code: err?.code,
              message: err?.message,
            });
          }
          if (typeof entry.data.companyId === "string" && entry.data.companyId) {
            affectedCompanyIds.add(entry.data.companyId);
          }
          handledIds.push(entry.id);
          continue;
        }

        try {
          const entryTs = typeof entry.data.ts === "number" ? entry.data.ts : -1;
          await redis.requeueLocationIfNewer(LOCATION_BUFFER_KEY, entry.id, entry.raw, entryTs);
          handledIds.push(entry.id);
        } catch (requeueErr) {
          hasUnrecoveredFailure = true;
          logger.error("Failed to re-queue driver location after transient DB error", {
            driverId: entry.id,
            syncKey,
            error: requeueErr,
          });
        }
      }
    }

    try {
      if (!hasUnrecoveredFailure) {
        await redis.del(syncKey);
      } else if (handledIds.length > 0) {
        await redis.hDel(syncKey, ...handledIds);
      }
    } catch (cleanupErr) {
      logger.error("Failed to clean up sync buffer key", { syncKey, error: cleanupErr });
    }
  }
}
