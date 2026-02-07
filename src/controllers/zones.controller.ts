import { Response } from "express";
import { ZoneService } from "../services/zone.service";
import { AuthRequest } from "../middlewares/auth.middleware";

export async function getZones(req: AuthRequest, res: Response) {
  const { name, page, limit } = req.query;
  const result = await ZoneService.getAllZones(req.user!.companyId, { 
    name: name as string,
    page: page ? parseInt(page as string) : undefined,
    limit: limit ? parseInt(limit as string) : undefined,
  });
  res.json(result);
}

export async function createZone(req: AuthRequest, res: Response) {
  const { name } = req.body;
  const zone = await ZoneService.createZone(req.user!.companyId, name);
  res.status(201).json(zone);
}