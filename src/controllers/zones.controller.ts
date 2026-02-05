import { Request, Response } from "express";
import { ZoneService } from "../services/zone.service";

export async function getZones(req: Request, res: Response) {
  const { name, page, limit } = req.query;
  const result = await ZoneService.getAllZones({ 
    name: name as string,
    page: page ? parseInt(page as string) : undefined,
    limit: limit ? parseInt(limit as string) : undefined,
  });
  res.json(result);
}

export async function createZone(req: Request, res: Response) {
  const { name } = req.body;
  const zone = await ZoneService.createZone(name);
  res.status(201).json(zone);
}