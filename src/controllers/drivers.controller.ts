import { Response } from "express";
import { DriverService } from "../services/driver.service";
import { AuthRequest } from "../middlewares/auth.middleware";
import logger from "../utils/logger";
import { sanitizePagination } from "../utils/pagination";

export async function getDrivers(req: AuthRequest, res: Response) {
  try {
    const { name } = req.query;
    const { page, limit } = sanitizePagination(req.query);
    const drivers = await DriverService.getAllDrivers(req.user!.companyId, {
      name: typeof name === "string" ? name : undefined,
      page,
      limit,
    });
    res.json(drivers);
  } catch (error) {
    logger.error("Error in getDrivers:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function createDriver(req: AuthRequest, res: Response) {
  try {
    const driver = await DriverService.createDriver(req.user!.companyId, req.body);
    res.status(201).json(driver);
  } catch (error: any) {
    if (error?.message === "username_exists") {
      return res.status(409).json({ error: "username already exists" });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function assignZonesToDriver(req: AuthRequest, res: Response) {
  const { driverId } = req.params;
  const { zoneIds } = req.body;

  try {
    const result = await DriverService.assignZones(
      req.user!.companyId,
      driverId as string,
      zoneIds,
      req.user!.id
    );
    res.json(result);
  } catch (error: any) {
    if (error?.message === "driver_not_found") {
      return res.status(404).json({ error: "driver not found" });
    }
    if (error?.message === "zones_not_founded_or_access_denied") {
      return res.status(404).json({ error: "zones not found or access denied" });
    }
    console.error("Error in assignZonesToDriver:", error);
    res.status(500).json({ error: "Failed to assign zones" });
  }
}

export async function getDriverZones(req: AuthRequest, res: Response) {
  const { driverId } = req.params;
  try {
    const zones = await DriverService.getDriverZones(req.user!.companyId, driverId as string);
    res.json(zones);
  } catch (error: any) {
    if (error.message === "driver_not_found") {
      return res.status(404).json({ error: "driver not found" });
    }
    res.status(500).json({ error: "Failed to fetch driver zones" });
  }
}

export async function getMyZones(req: AuthRequest, res: Response) {
  if (!req.user?.driverId) {
    return res.status(400).json({ error: "Not a driver" });
  }

  try {
    const zones = await DriverService.getDriverZones(req.user.companyId, req.user.driverId);
    res.json(zones);
  } catch (error: any) {
    if (error.message === "driver_not_found") {
      return res.status(404).json({ error: "driver not found" });
    }
    res.status(500).json({ error: "Failed to fetch driver zones" });
  }
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

export async function getDriverById(req: AuthRequest, res: Response) {
  const id = String(req.params.id);
  try {
    const driver = await DriverService.getDriverById(req.user!.companyId, id);
    res.json(driver);
  } catch (error: any) {
    if (error?.message === "driver_not_found") {
      return res.status(404).json({ error: "driver not found" });
    }
    logger.error("Error in getDriverById:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function updateDriver(req: AuthRequest, res: Response) {
  const id = String(req.params.id);
  const { name, username, password, lat, lng } = req.body;
  try {
    const updated = await DriverService.updateDriver(req.user!.companyId, id, {
      name,
      username,
      password,
      lat,
      lng,
    });
    res.json(updated);
  } catch (error: any) {
    if (error?.message === "driver_not_found") {
      return res.status(404).json({ error: "driver not found" });
    }
    if (error?.message === "username_exists") {
      return res.status(409).json({ error: "username already exists" });
    }
    if (error?.message === "driver_user_not_found") {
      return res.status(422).json({ error: "driver has no linked user account" });
    }
    logger.error("Error in updateDriver:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function deleteDriver(req: AuthRequest, res: Response) {
  const id = String(req.params.id);
  try {
    const result = await DriverService.deleteDriver(req.user!.companyId, id, req.user!.id);
    res.json(result);
  } catch (error: any) {
    if (error?.message === "driver_not_found") {
      return res.status(404).json({ error: "driver not found" });
    }
    if (error?.message === "driver_has_in_transit_packages") {
      return res.status(422).json({
        error: "Cannot delete driver with packages currently in transit",
      });
    }
    logger.error("Error in deleteDriver:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
