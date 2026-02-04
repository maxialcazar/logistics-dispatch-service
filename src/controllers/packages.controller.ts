import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { packages } from "../storage/packages.store";
import { zones } from "../storage/zones.store";
import { drivers } from "../storage/drivers.store";
import { Package, PackageStatus } from "../models/package.model";
import { AuthRequest } from "../middlewares/auth.middleware";

export function getPackages(req: Request, res: Response) {
  res.json(packages);
}

export function createPackage(req: Request, res: Response) {
  const { trackingCode, zoneId } = req.body;

  if (!trackingCode || !zoneId) {
    return res.status(400).json({ error: "trackingCode and zoneId required" });
  }

  const zoneExists = zones.some(z => z.id === zoneId);
  if (!zoneExists) {
    return res.status(400).json({ error: "invalid zoneId" });
  }

  const pkg: Package = {
    id: randomUUID(),
    trackingCode,
    zoneId,
    status: "pending",
  };

  packages.push(pkg);
  res.status(201).json(pkg);
}

export function getPackagesByDriver(req: Request, res: Response) {
  const { driverId } = req.params;

  const driver = drivers.find(d => d.id === driverId);
  if (!driver) {
    return res.status(404).json({ error: "driver not found" });
  }

  const result = packages.filter(p => {
    if (p.driverId) {
      return p.driverId === driver.id;
    }
    return driver.zoneIds.includes(p.zoneId);
  });

  res.json(result);
}

const allowedTransitions: Record<
  "dispatcher" | "driver",
  Record<PackageStatus, PackageStatus[]>
> = {
  driver: {
    pending: ["assigned"],
    assigned: ["in_transit"],
    in_transit: ["delivered"],
    delivered: [],
    cancelled: [],
  },
  dispatcher: {
    pending: ["assigned", "cancelled"],
    assigned: ["in_transit", "cancelled"],
    in_transit: ["delivered", "cancelled"],
    delivered: [],
    cancelled: [],
  },
};

export function updatePackageStatus(req: AuthRequest, res: Response) {
  const { packageId } = req.params;
  const { status } = req.body as { status: PackageStatus };

  const pkg = packages.find(p => p.id === packageId);
  if (!pkg) {
    return res.status(404).json({ error: "package not found" });
  }

  if (!req.user) {
    return res.status(401).json({ error: "unauthenticated" });
  }

  const role = req.user.role as "dispatcher" | "driver";

  if (role === "driver" && pkg.driverId !== req.user.driverId) {
    return res.status(403).json({ error: "not your package" });
  }

  const allowed = allowedTransitions[role][pkg.status];

  if (!allowed.includes(status)) {
    return res.status(400).json({
      error: "invalid status transition",
      role,
      from: pkg.status,
      to: status,
      allowed,
    });
  }

  pkg.status = status;
  res.json(pkg);
}

export function assignPackageToDriver(req: Request, res: Response) {
  const { packageId } = req.params;
  const { driverId } = req.body;

  const pkg = packages.find(p => p.id === packageId);
  if (!pkg) {
    return res.status(404).json({ error: "package not found" });
  }

  const driver = drivers.find(d => d.id === driverId);
  if (!driver) {
    return res.status(404).json({ error: "driver not found" });
  }

  // regla: el driver debe tener la zone del package
  if (!driver.zoneIds.includes(pkg.zoneId)) {
    return res.status(400).json({
      error: "driver does not belong to package zone",
    });
  }

  pkg.driverId = driverId;
  pkg.status = "assigned";

  res.json(pkg);
}

export function getMyPackages(req: AuthRequest, res: Response) {
  const driverId = req.user?.driverId;

  if (!driverId) {
    return res.status(400).json({ error: "driver not linked" });
  }

  const result = packages.filter(p => {
    // prioridad: paquetes asignados explícitamente
    if (p.driverId) return p.driverId === driverId;

    // fallback: paquetes de las zonas del driver
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return false;

    return driver.zoneIds.includes(p.zoneId);
  });

  res.json(result);
}