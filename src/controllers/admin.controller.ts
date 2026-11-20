import { Response } from "express";
import { prisma } from "../prisma";
import { redis } from "../redis";
import logger from "../utils/logger";
import {
  getTenantConnectedClientCount,
  getGlobalConnectedClientCount,
} from "../websocket";
import { AuthRequest } from "../middlewares/auth.middleware";

const COMPANY_SELECT = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function getCompany(req: AuthRequest, res: Response) {
  const companyId = req.user?.companyId?.trim();
  if (!companyId) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: COMPANY_SELECT,
    });

    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    return res.json(company);
  } catch (err) {
    logger.error("Failed to fetch company", err);
    return res.status(500).json({ error: "Failed to fetch company" });
  }
}

export async function updateCompany(req: AuthRequest, res: Response) {
  const companyId = req.user?.companyId?.trim();
  if (!companyId) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const data: { name?: string; slug?: string } = {};
  if (typeof req.body?.name === "string") {
    data.name = req.body.name.trim();
  }
  if (typeof req.body?.slug === "string") {
    data.slug = req.body.slug.trim();
  }

  if (Object.keys(data).length === 0) {
    return res
      .status(400)
      .json({ error: "At least one updatable field (name or slug) must be provided" });
  }

  try {
    const updated = await prisma.company.update({
      where: { id: companyId },
      data,
      select: COMPANY_SELECT,
    });

    return res.json(updated);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "Company URL/Slug already exists" });
    }
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Company not found" });
    }
    logger.error("Failed to update company", err);
    return res.status(500).json({ error: "Failed to update company" });
  }
}

export async function getSystemMetrics(req: AuthRequest, res: Response) {
  const companyId = req.user?.companyId?.trim();
  if (!companyId) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const isSystemScope =
    req.user?.scope === "system" ||
    req.user?.role === "system" ||
    req.user?.role === "superadmin";

  let dbStatus = "ok";
  const startDb = Date.now();
  const packageCounts: Record<string, number> = {
    pending: 0,
    assigned: 0,
    in_transit: 0,
    delivered: 0,
    cancelled: 0,
    total: 0,
  };
  let driversTotal = 0;
  let zonesTotal = 0;
  let zonesActive = 0;

  try {
    const [packageGroups, driverCount, zoneGroups] = await Promise.all([
      prisma.package.groupBy({
        by: ["status"],
        where: { companyId, isArchived: false },
        _count: { _all: true },
      }),
      prisma.driver.count({ where: { companyId } }),
      prisma.zone.groupBy({
        by: ["isActive"],
        where: { companyId },
        _count: { _all: true },
      }),
    ]);

    for (const group of packageGroups) {
      const count = group._count._all;
      packageCounts[group.status] = count;
      packageCounts.total += count;
    }
    driversTotal = driverCount;
    for (const zGroup of zoneGroups) {
      const count = zGroup._count._all;
      zonesTotal += count;
      if (zGroup.isActive) {
        zonesActive += count;
      }
    }
  } catch (err) {
    dbStatus = "error";
    logger.error("Failed to fetch tenant operational metrics", err);
  }
  const dbLatency = Date.now() - startDb;
  const tenantConnectedClients = getTenantConnectedClientCount(companyId);

  const payload: Record<string, any> = {
    status: dbStatus === "ok" ? "online" : "degraded",
    companyId,
    timestamp: new Date().toISOString(),
    metrics: {
      packages: dbStatus === "ok" ? packageCounts : null,
      drivers: dbStatus === "ok" ? { total: driversTotal } : null,
      zones: dbStatus === "ok" ? { total: zonesTotal, active: zonesActive } : null,
      websockets: {
        connected_clients: tenantConnectedClients,
      },
    },
    components: {
      database: {
        status: dbStatus,
        ...(isSystemScope ? { latency_ms: dbLatency } : {}),
      },
      websockets: {
        connected_clients: tenantConnectedClients,
        ...(isSystemScope
          ? { global_connected_clients: getGlobalConnectedClientCount() }
          : {}),
      },
    },
  };

  if (isSystemScope) {
    const uptime = process.uptime();
    const memory = process.memoryUsage();

    let redisStatus = "ok";
    let redisPing = -1;
    if (process.env.REDIS_ENABLED === "true") {
      const startRedis = Date.now();
      try {
        await redis.ping();
      } catch (err) {
        redisStatus = "error";
        payload.status = "degraded";
        logger.error("Redis ping check failed in metrics", err);
      }
      redisPing = Date.now() - startRedis;
    } else {
      redisStatus = "disabled";
    }

    payload.uptime = `${Math.floor(uptime)}s`;
    payload.resources = {
      memory_rss_mb: Math.round(memory.rss / 1024 / 1024),
      memory_heap_mb: Math.round(memory.heapUsed / 1024 / 1024),
    };
    payload.components.redis = {
      status: redisStatus,
      latency_ms: redisPing,
    };
  }

  return res.status(dbStatus === "ok" ? 200 : 503).json(payload);
}
