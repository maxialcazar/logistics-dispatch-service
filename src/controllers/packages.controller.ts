import { Response } from "express";
import { PackageService } from "../services/package.service";
import { AuthRequest } from "../middlewares/auth.middleware";
import { PackageStatus } from "@prisma/client";

export async function getPackages(req: AuthRequest, res: Response) {
  const { status, zoneId, trackingCode, page, limit, isArchived } = req.query;

  try {
    const result = await PackageService.getAllPackages(req.user!.companyId, {
      status: status as PackageStatus,
      zoneId: zoneId as string,
      trackingCode: trackingCode as string,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      isArchived: isArchived === 'true',
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function createPackage(req: AuthRequest, res: Response) {
  const { 
    trackingCode, 
    recipientName, recipientAddress, recipientPhone, recipientEmail,
    addressStreet, addressNumber, addressReferences,
    senderName, senderAddress, senderPhone,
    weight, volume,
    zoneId, lat, lng, estimatedDeliveryAt 
  } = req.body;

  try {
    const pkg = await PackageService.createPackage(req.user!.companyId, {
      trackingCode,
      recipientName,
      recipientAddress,
      recipientPhone,
      recipientEmail,
      addressStreet,
      addressNumber,
      addressReferences,
      senderName,
      senderAddress,
      senderPhone,
      weight,
      volume,
      zoneId,
      userId: req.user!.id,
      lat,
      lng,
      estimatedDeliveryAt: estimatedDeliveryAt ? new Date(estimatedDeliveryAt) : undefined,
    });
    res.status(201).json(pkg);
  } catch (error: any) {
    console.error(error);
    if (error.message === "zone_not_found") {
      return res.status(400).json({ error: "zone not found" });
    }
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
}

export async function getPackagesByDriver(req: AuthRequest, res: Response) {
  const driverId = req.params.driverId as string;
  try {
    const packages = await PackageService.getPackagesByDriver(req.user!.companyId, driverId);
    res.json(packages);
  } catch (error: any) {
    if (error.message === "driver_not_found") {
      return res.status(404).json({ error: "driver not found" });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function updatePackageStatus(req: AuthRequest, res: Response) {
  const { packageId } = req.params;
  const { status, lat, lng, estimatedDeliveryAt, signature, photo } = req.body;

  try {
    const updated = await PackageService.updateStatus(req.user!.companyId, {
      packageId: packageId as string,
      status,
      userId: req.user!.id,
      userRole: req.user!.role,
      userDriverId: req.user!.driverId || null,
      lat,
      lng,
      estimatedDeliveryAt: estimatedDeliveryAt ? new Date(estimatedDeliveryAt) : undefined,
      signature,
      photo,
    });
    res.json(updated);
  } catch (error: any) {
    if (error.message === "package_not_found") {
      return res.status(404).json({ error: "package not found" });
      
    }
    if (error.message === "not_authorized_for_zone") {
      return res.status(403).json({ error: "not authorized for this zone" });
    }
    if (error.message.startsWith("invalid_transition")) {
      const [, from, to] = error.message.split(":");
      return res.status(400).json({
        error: "invalid status transition",
        from,
        to,
      });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function assignPackageToDriver(req: AuthRequest, res: Response) {
  const { driverId } = req.body;
  const packageId = req.params.packageId as string;

  try {
    const updated = await PackageService.assignToDriver(req.user!.companyId, packageId, driverId, req.user!.id);
    res.json(updated);
  } catch (error: any) {
    if (error.message === "package_not_found") {
      return res.status(404).json({ error: "package not found" });
    }
    if (error.message === "driver_not_found") {
      return res.status(404).json({ error: "driver not found" });
    }
    if (error.message === "driver_not_in_zone") {
      return res.status(400).json({ error: "driver is not assigned to this package's zone" });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function getMyPackages(req: AuthRequest, res: Response) {
  if (!req.user?.driverId) {
    return res.status(403).json({ error: "not a driver" });
  }

  try {
    const packages = await PackageService.getMyPackages(req.user.companyId, req.user.driverId);
    res.json(packages);
  } catch (error: any) {
    if (error.message === "driver_not_found") {
      return res.status(404).json({ error: "driver not found" });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function getPackageHistory(req: AuthRequest, res: Response) {
  const packageId = req.params.packageId as string;
  try {
    const history = await PackageService.getPackageHistory(req.user!.companyId, packageId);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function getDashboardStats(req: AuthRequest, res: Response) {
    try {
        const stats = await PackageService.getDashboardStats(req.user!.companyId);
        res.json(stats);
    } catch (error) {
        console.error("Stats Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}

export async function archivePackages(req: AuthRequest, res: Response) {
    const { packageIds } = req.body;
    if (!Array.isArray(packageIds) || packageIds.length === 0) {
        return res.status(400).json({ error: "Invalid packageIds" });
    }
    try {
        const result = await PackageService.archivePackages(req.user!.companyId, packageIds);
        res.json({ count: result.count });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
}

export async function deletePackages(req: AuthRequest, res: Response) {
    const { packageIds } = req.body;
    if (!Array.isArray(packageIds) || packageIds.length === 0) {
        return res.status(400).json({ error: "Invalid packageIds" });
    }
    try {
        const result = await PackageService.deletePackages(req.user!.companyId, packageIds);
        res.json({ count: result.count });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
}