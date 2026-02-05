import { prisma } from "../prisma";
import bcrypt from "bcrypt";
import { redis } from "../redis";

export class DriverService {
  static async getAllDrivers(filters: { name?: string; page?: number; limit?: number } = {}) {
    const cacheKey = `drivers:${JSON.stringify(filters)}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const { name, page = 1, limit = 10 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
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

  static async createDriver(data: any) {
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
        user: {
          create: {
            username,
            password: hashedPassword,
            role: "driver",
          },
        },
      },
      include: {
        user: true,
      },
    });

    await redis.delPrefix('drivers:'); // Invalidate drivers cache
    return driver;
  }

  static async assignZones(driverId: string, zoneIds: string[]) {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Liberar zonas previas de este driver
      await tx.zone.updateMany({
        where: { driverId },
        data: { driverId: null },
      });

      // 2. Asignar nuevas zonas
      await tx.zone.updateMany({
        where: { id: { in: zoneIds } },
        data: { driverId },
      });

      return { ok: true };
    });

    // Invalidate caches for both drivers and zones as their relationship changed
    await Promise.all([
      redis.delPrefix('drivers:'),
      redis.delPrefix('zones:'),
    ]);

    return result;
  }

  static async getDriverZones(driverId: string) {
    return prisma.zone.findMany({
      where: { driverId },
    });
  }
}
