import { Request, Response } from "express";
import { prisma } from "../prisma";
import { PackageStatus } from "@prisma/client";
import { AuthRequest } from "../middlewares/auth.middleware";

// Listar todos los paquetes
export async function getPackages(req: Request, res: Response) {
  const packages = await prisma.package.findMany({
    include: { 
      zone: {
        include: { driver: true }
      }
    },
  });
  res.json(packages);
}

// Crear un paquete
export async function createPackage(req: Request, res: Response) {
  const { trackingCode, zoneId } = req.body;
  if (!trackingCode || !zoneId) {
    return res.status(400).json({ error: "trackingCode and zoneId required" });
  }

  // Verificar que la zona existe
  const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
  if (!zone) {
    return res.status(400).json({ error: "zone not found" });
  }

  const pkg = await prisma.package.create({
    data: { trackingCode, zoneId, status: "pending" },
    include: { 
      zone: {
        include: { driver: true }
      }
    },
  });

  res.status(201).json(pkg);
}

// Listar paquetes de un driver
export async function getPackagesByDriver(req: Request, res: Response) {
  const driverId = Array.isArray(req.params.driverId)
    ? req.params.driverId[0]
    : req.params.driverId;

  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
  });
  if (!driver) return res.status(404).json({ error: "driver not found" });

  const packages = await prisma.package.findMany({
    where: { 
      zone: { driverId }
    },
    include: { zone: true },
  });

  res.json(packages);
}

// Actualizar estado de paquete
const allowedTransitions: Record<PackageStatus, PackageStatus[]> = {
  pending: ["assigned", "cancelled"],
  assigned: ["in_transit", "cancelled"],
  in_transit: ["delivered"],
  delivered: [],
  cancelled: [],
};

export async function updatePackageStatus(req: AuthRequest, res: Response) {
  const packageId = Array.isArray(req.params.packageId)
    ? req.params.packageId[0]
    : req.params.packageId;

  const { status } = req.body as { status: PackageStatus };

  const pkg = await prisma.package.findUnique({ 
    where: { id: packageId },
    include: { zone: true }
  });
  
  if (!pkg) return res.status(404).json({ error: "package not found" });

  // Ownership check: If user is a driver, they can only update packages in their zone
  if (req.user?.role === "driver" && pkg.zone.driverId !== req.user.driverId) {
    return res.status(403).json({ error: "not authorized for this zone" });
  }

  const allowed = allowedTransitions[pkg.status as PackageStatus];
  if (!allowed.includes(status)) {
    return res.status(400).json({
      error: "invalid status transition",
      from: pkg.status,
      to: status,
    });
  }

  const updated = await prisma.package.update({
    where: { id: packageId },
    data: { status },
  });

  res.json(updated);
}

// Asignar paquete a driver (ahora es "Mover paquete a una zona de este driver")
// O simplemente se puede usar para cambiar el estado a "assigned" si ya está en la zona correcta
export async function assignPackageToDriver(req: Request, res: Response) {
  const { driverId } = req.body;
  const packageId = Array.isArray(req.params.packageId)
    ? req.params.packageId[0]
    : req.params.packageId;

  const pkg = await prisma.package.findUnique({ 
    where: { id: packageId },
    include: { zone: true } 
  });
  if (!pkg) return res.status(404).json({ error: "package not found" });

  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    include: { zones: true },
  });
  if (!driver) return res.status(404).json({ error: "driver not found" });

  // Verificar que la zona del paquete pertenezca al driver
  if (pkg.zone.driverId !== driverId) {
    return res
      .status(400)
      .json({ error: "driver is not assigned to this package's zone" });
  }

  const updated = await prisma.package.update({
    where: { id: packageId },
    data: { status: "assigned" },
    include: { 
      zone: {
        include: { driver: true }
      }
    },
  });

  res.json(updated);
}

export async function getMyPackages(req: AuthRequest, res: Response) {
  if (!req.user?.driverId) {
    return res.status(403).json({ error: "not a driver" });
  }

  const packages = await prisma.package.findMany({
    where: { 
      zone: {
        driverId: req.user.driverId
      }
    },
    include: { zone: true },
  });

  res.json(packages);
}