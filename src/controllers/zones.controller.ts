import { Response } from "express";
import { ZoneService } from "../services/zone.service";
import { AuthRequest } from "../middlewares/auth.middleware";
import logger from "../utils/logger";
import { sanitizePagination } from "../utils/pagination";

export async function getZones(req: AuthRequest, res: Response) {
  try {
    const name = typeof req.query.name === "string" ? req.query.name : undefined;
    const { page, limit } = sanitizePagination(req.query);

    const result = await ZoneService.getAllZones(req.user!.companyId, {
      name,
      page,
      limit,
    });
    res.json(result);
  } catch (error) {
    logger.error("Error in getZones:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function getZoneById(req: AuthRequest, res: Response) {
  const id = String(req.params.id);
  try {
    const zone = await ZoneService.getZoneById(req.user!.companyId, id);
    res.json(zone);
  } catch (error: any) {
    if (error?.message === "Zone not found") {
      return res.status(404).json({ error: error.message });
    }
    logger.error("Error in getZoneById:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function createZone(req: AuthRequest, res: Response) {
  const name = req.body.name as string;
  const description = req.body.description as string | undefined;
  const polygon = req.body.polygon as [number, number][] | undefined;

  const zone = await ZoneService.createZone(req.user!.companyId, name, description, polygon);
  res.status(201).json(zone);
}

export async function updateZone(req: AuthRequest, res: Response) {
  const id = String(req.params.id);
  const { isActive, description, driverId, name, polygon } = req.body ?? {};

  try {
      const zone = await ZoneService.updateZone(
        id,
        req.user!.companyId,
        {
          isActive,
          description,
          driverId,
          name,
          polygon,
        },
        req.user!.id
      );
      res.json(zone);
  } catch (error: any) {
      if (error.message && error.message.includes('Cannot activate')) {
          return res.status(400).json({ error: error.message });
      }
      if (error.message === 'Zone not found' || error.message === 'Driver not found') {
          return res.status(404).json({ error: error.message });
      }
      console.error(error);
      res.status(500).json({ error: 'Failed to update zone' });
  }
}

export async function deleteZone(req: AuthRequest, res: Response) {
  const id = String(req.params.id);
  try {
    const result = await ZoneService.deleteZone(req.user!.companyId, id, req.user!.id);
    res.json(result);
  } catch (error: any) {
    if (error?.message === "Zone not found") {
      return res.status(404).json({ error: error.message });
    }
    logger.error("Error in deleteZone:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function setAllZonesStatus(req: AuthRequest, res: Response) {
    const isActive = req.body?.isActive as boolean;
    if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive boolean is required' });
    }

    try {
        const result = await ZoneService.setAllZonesStatus(req.user!.companyId, isActive, req.user!.id);
        res.json(result);
    } catch (error) {
        console.error("Bulk Zone Update Error:", error);
        res.status(500).json({ error: 'Failed to update zones' });
    }
}