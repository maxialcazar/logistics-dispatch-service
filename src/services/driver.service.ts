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
        include: { zones: true },
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

  static async updateLocation(driverId: string, lat: number, lng: number) {
    const updated = await prisma.driver.update({
      where: { id: driverId },
      data: { lat, lng },
    });

    // Send to Redis (Pub/Sub) instead of direct socket emit
    // This allows dedicated socket nodes to pick it up and broadcast
    const payload = JSON.stringify({ 
      driverId, 
      lat, 
      lng,
      timestamp: Date.now() 
    });
    
    // Fire and forget (low latency)
    await redis.publish("driver.location.updated", payload);

    return updated;
  }
}
