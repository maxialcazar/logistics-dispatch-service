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

  static async createZone(companyId: string, name: string, description?: string) {
    const zone = await prisma.zone.create({ 
      data: { name, description, companyId } 
    });
    
    await redis.delPrefix(`zones:${companyId}:`); 
    return zone;
  }

  static async updateZone(
    zoneId: string, 
    companyId: string, 
    data: { 
      isActive?: boolean; 
      description?: string; 
      driverId?: string | null; 
      name?: string;
    }
  ) {
    try {
      const currentZone = await prisma.zone.findFirst({ where: { id: zoneId, companyId } });
      if (!currentZone) throw new Error('Zone not found');

      const willBeActive = data.isActive !== undefined ? data.isActive : currentZone.isActive;
      const willHaveDriver = data.driverId !== undefined ? data.driverId : currentZone.driverId;

      // Check logic: Can only activate if driver is assigned
      if (willBeActive && !willHaveDriver) {
        throw new Error('Cannot activate zone without an assigned driver');
      }

      const updatedZone = await prisma.zone.update({
        where: { id: zoneId }, // ID is globally unique
        data: {
          description: data.description,
          isActive: data.isActive,
          driverId: data.driverId,
          name: data.name
        },
        include: { driver: true }
      });

      // Business Logic: If activated, assign pending packages in this zone
      if (data.isActive === true) {
        console.log(`Activating zone ${zoneId}, updating packages...`);
        try {
            await prisma.package.updateMany({
              where: {
                zoneId: zoneId,
                status: 'pending',
                companyId
              },
              data: { 
                status: 'assigned',
                updatedAt: new Date()
              }
            });
        } catch (pkgError) {
            console.error("Error updating packages status (non-fatal):", pkgError);
        }
      }

      const keysToInvalidate = [
          `zones:${companyId}`,
          `drivers:${companyId}`
      ];
      await Promise.all(keysToInvalidate.map(k => redis.delPrefix(`${k}:`)));
      
      return updatedZone;

    } catch (error) {
      console.error("Error in ZoneService.updateZone:", error);
      throw error;
    }
  }
}
