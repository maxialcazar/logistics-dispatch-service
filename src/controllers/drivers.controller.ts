import { Request, Response } from "express";
import { DriverService } from "../services/driver.service";
import { AuthRequest } from "../middlewares/auth.middleware";

export async function getDrivers(req: Request, res: Response) {
  const { name, page, limit } = req.query;
  const drivers = await DriverService.getAllDrivers({
    name: name as string,
    page: page ? parseInt(page as string) : undefined,
    limit: limit ? parseInt(limit as string) : undefined,
  });
  res.json(drivers);
}

export async function createDriver(req: Request, res: Response) {
  try {
    const driver = await DriverService.createDriver(req.body);
    res.status(201).json(driver);
  } catch (error: any) {
    if (error.message === "username_exists") {
      return res.status(400).json({ error: "username already exists" });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function assignZonesToDriver(req: Request, res: Response) {
  const { driverId } = req.params;
  const { zoneIds } = req.body;

  try {
    const result = await DriverService.assignZones(driverId as string, zoneIds);
    res.json(result);
  } catch (error) {
    console.error("Error in assignZonesToDriver:", error);
    res.status(500).json({ error: "Failed to assign zones" });
  }
}

export async function getDriverZones(req: Request, res: Response) {
  const { driverId } = req.params;
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