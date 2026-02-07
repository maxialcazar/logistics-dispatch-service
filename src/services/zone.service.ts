import { prisma } from "../prisma";
import { redis } from "../redis";

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

  static async createZone(companyId: string, name: string) {
    const zone = await prisma.zone.create({ 
      data: { name, companyId } 
    });
    
    // Invalidate cache for this company only
    // Note: delPrefix helper might need wildcard support if not already present, 
    // assuming it works like 'KEYS prefix*' -> DEL
    await redis.delPrefix(`zones:${companyId}:`); 
    return zone;
  }
}
