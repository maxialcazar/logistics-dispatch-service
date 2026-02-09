import { prisma } from "../prisma";
import bcrypt from "bcrypt";
import { redis } from "../redis";
import { emitToAll } from "../websocket";

export class DriverService {
  static async getAllDrivers(companyId: string, filters: { name?: string; page?: number; limit?: number } = {}) {
    const cacheKey = `drivers:${companyId}:${JSON.stringify(filters)}`;
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
    return result;
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

    const driver = await prisma.driver.create({
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
        user: true,
      },
    });

    await redis.delPrefix(`drivers:${companyId}:`); 
    return driver;
  }

  static async assignZones(companyId: string, driverId: string, zoneIds: string[]) {
    // Verify driver belongs to company
    const driver = await prisma.driver.findFirst({ where: { id: driverId, companyId } });
    if (!driver) throw new Error("driver_not_found");

    // Verify all zones belong to company
    const count = await prisma.zone.count({ 
      where: { 
        id: { in: zoneIds },
        companyId 
      } 
    });
    if (count !== zoneIds.length) {
      throw new Error("zones_not_founded_or_access_denied");
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Liberar zonas previas de este driver
      await tx.zone.updateMany({
        where: { driverId, companyId },
        data: { driverId: null },
      });

      // 2. Asignar nuevas zonas
      await tx.zone.updateMany({
        where: { id: { in: zoneIds }, companyId },
        data: { driverId },
      });

      return { ok: true };
    });

    // Invalidate caches
    await Promise.all([
      redis.delPrefix(`drivers:${companyId}:`),
      redis.delPrefix(`zones:${companyId}:`),
    ]);

    emitToAll("zones-reassigned", { driverId, zoneIds });

    return result;
  }

  static async getDriverZones(driverId: string) {
    return prisma.zone.findMany({
      where: { driverId },
    });
  }

  static async updateLocation(driverId: string, companyId: string, lat: number, lng: number) {
      const ts = Date.now();
      
      // 1. Buffer in Redis (Write-Back)
      // Note: Buffer key is global or per-company? Global is simpler for worker.
      await redis.hSet("drivers:locations:buffer", driverId, JSON.stringify({ lat, lng, ts }));

      // 2. Publish Real-Time
      const payload = JSON.stringify({ 
        driverId, 
        companyId,
        lat, 
        lng,
        timestamp: ts 
      });
      
      await redis.publish("driver.location.updated", payload);

      return { id: driverId, lat, lng, updatedAt: new Date() };
  }

  // Background Worker to flush Redis buffer to Postgres
  static async syncLocationBuffer() {
      const bufferKey = "drivers:locations:buffer";
      const all = await redis.hGetAll(bufferKey);
      
      if (!all || Object.keys(all).length === 0) return;

      const driverIds = Object.keys(all);
      // console.log(`[Sync] Persisting ${driverIds.length} locations to DB...`);

      const ops = driverIds.map(id => {
          try {
            const data = JSON.parse(all[id]);
            return prisma.driver.update({
                where: { id },
                data: { lat: data.lat, lng: data.lng }
            });
          } catch (e) { return null; } // Skip malformed
      }).filter(op => op !== null) as any[];

      if (ops.length > 0) {
          await prisma.$transaction(ops);
      }

      // Clear processed keys
      await redis.hDel(bufferKey, ...driverIds);
  }
}
