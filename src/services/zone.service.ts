import { prisma } from "../prisma";
import { redis } from "../redis";

export class ZoneService {
  static async getAllZones(filters: { name?: string } = {}) {
    const cacheKey = `zones:${JSON.stringify(filters)}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    const { name } = filters;
    const where: any = {};
    if (name) {
      where.name = { contains: name, mode: 'insensitive' };
    }
    const zones = await prisma.zone.findMany({ 
      where,
      include: { driver: true } 
    });

    await redis.set(cacheKey, JSON.stringify(zones), 3600); // 1 hour cache
    return zones;
  }

  static async createZone(name: string) {
    const zone = await prisma.zone.create({ data: { name } });
    await redis.delPrefix('zones:'); // Invalidate cache
    return zone;
  }
}
