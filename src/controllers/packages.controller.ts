import { Response } from "express";
import { PackageService } from "../services/package.service";
import { AuthRequest } from "../middlewares/auth.middleware";
import { PackageStatus } from "@prisma/client";

export async function getPackages(req: AuthRequest, res: Response) {
  const { status, zoneId, trackingCode, page, limit } = req.query;

  try {
    const result = await PackageService.getAllPackages({
      status: status as PackageStatus,
      zoneId: zoneId as string,
      trackingCode: trackingCode as string,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function createPackage(req: AuthRequest, res: Response) {
  const { trackingCode, zoneId } = req.body;
  try {
    const pkg = await PackageService.createPackage(trackingCode, zoneId, req.user!.id);
    res.status(201).json(pkg);
  } catch (error: any) {
    if (error.message === "zone_not_found") {
      return res.status(400).json({ error: "zone not found" });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function getPackagesByDriver(req: AuthRequest, res: Response) {
  const driverId = req.params.driverId as string;
  try {
    const packages = await PackageService.getPackagesByDriver(driverId);
    res.json(packages);
  } catch (error: any) {
    if (error.message === "driver_not_found") {
      return res.status(404).json({ error: "driver not found" });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function updatePackageStatus(req: AuthRequest, res: Response) {
  const packageId = req.params.packageId as string;
  const { status } = req.body as { status: PackageStatus };

  try {
    const updated = await PackageService.updateStatus(
      packageId,
      status,
      req.user!.id,
      req.user!.role,
      req.user!.driverId
    );
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
    const updated = await PackageService.assignToDriver(packageId, driverId, req.user!.id);
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

  const packages = await PackageService.getMyPackages(req.user.driverId);
  res.json(packages);
}

export async function getPackageHistory(req: AuthRequest, res: Response) {
  const packageId = req.params.packageId as string;
  try {
    const history = await PackageService.getPackageHistory(packageId);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
}