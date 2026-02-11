import { Response } from "express";
import { DriverService } from "../services/driver.service";
import { AuthRequest } from "../middlewares/auth.middleware";

export async function getDrivers(req: AuthRequest, res: Response) {
  const { name, page, limit } = req.query;
  const drivers = await DriverService.getAllDrivers(req.user!.companyId, {
    name: name as string,
    page: page ? parseInt(page as string) : undefined,
    limit: limit ? parseInt(limit as string) : undefined,
  });
  res.json(drivers);
}

export async function createDriver(req: AuthRequest, res: Response) {
  try {
    const driver = await DriverService.createDriver(req.user!.companyId, req.body);
    res.status(201).json(driver);
  } catch (error: any) {
    if (error.message === "username_exists") {
      return res.status(400).json({ error: "username already exists" });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function assignZonesToDriver(req: AuthRequest, res: Response) {
  const { driverId } = req.params;
  const { zoneIds } = req.body;

  try {
    const result = await DriverService.assignZones(req.user!.companyId, driverId as string, zoneIds);
    res.json(result);
  } catch (error) {
    console.error("Error in assignZonesToDriver:", error);
    res.status(500).json({ error: "Failed to assign zones" });
  }
}

export async function getDriverZones(req: AuthRequest, res: Response) {
  const { driverId } = req.params;
  // TODO: Update service to support companyId check
  const zones = await DriverService.getDriverZones(driverId as string);
  res.json(zones);
}

export async function getMyZones(req: AuthRequest, res: Response) {
  if (!req.user?.driverId) {
    return res.status(400).json({ error: "Not a driver" });
  }

  const zones = await DriverService.getDriverZones(req.user.driverId);
  res.json(zones);
}

export async function updateLocation(req: AuthRequest, res: Response) {
  if (!req.user?.driverId) {
    return res.status(403).json({ error: "Only drivers can update location" });
  }

  const { lat, lng } = req.body;
  try {
    const updated = await DriverService.updateLocation(req.user.driverId, req.user.companyId, lat, lng);
    res.json(updated);
  } catch (error) {
    console.error("Error in updateLocation:", error);
    res.status(500).json({ error: "Failed to update location" });
  }
}