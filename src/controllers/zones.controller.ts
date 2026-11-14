import { Response } from "express";
import { ZoneService } from "../services/zone.service";
import { AuthRequest } from "../middlewares/auth.middleware";

export async function getZones(req: AuthRequest, res: Response) {
  const name = req.query.name ? String(req.query.name) : undefined;
  const page = req.query.page ? Number(req.query.page) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;

  const result = await ZoneService.getAllZones(req.user!.companyId, { 
    name,
    page,
    limit,
  });
  res.json(result);
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
  const isActive = req.body.isActive as boolean | undefined;
  const description = req.body.description ? String(req.body.description) : undefined;
  const driverId = req.body.driverId !== undefined
    ? (req.body.driverId === null ? null : String(req.body.driverId))
    : undefined;
  const name = req.body.name ? String(req.body.name) : undefined;
  // polygon: undefined means "don't change"; null means "clear"; array means "set"
  const polygon = req.body.polygon !== undefined
    ? (req.body.polygon === null ? null : req.body.polygon as [number, number][])
    : undefined;
  
  try {
      const zone = await ZoneService.updateZone(id, req.user!.companyId, {
        isActive,
        description,
        driverId,
        name,
        polygon,
      });
      res.json(zone);
  } catch (error: any) {
      if (error.message && error.message.includes('Cannot activate')) {
          return res.status(400).json({ error: error.message });
      }
      if (error.message === 'Zone not found') {
          return res.status(404).json({ error: 'Zone not found' });
      }
      console.error(error);
      res.status(500).json({ error: 'Failed to update zone' });
  }
}

export async function setAllZonesStatus(req: AuthRequest, res: Response) {
    const isActive = req.body.isActive as boolean;
    if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive boolean is required' });
    }

    try {
        const result = await ZoneService.setAllZonesStatus(req.user!.companyId, isActive);
        res.json(result);
    } catch (error) {
        console.error("Bulk Zone Update Error:", error);
        res.status(500).json({ error: 'Failed to update zones' });
    }
}