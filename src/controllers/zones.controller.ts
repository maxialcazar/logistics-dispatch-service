import { Request, Response } from "express";
import { ZoneService } from "../services/zone.service";

export async function getZones(req: Request, res: Response) {
  const { name } = req.query;
  const zones = await ZoneService.getAllZones({ name: name as string });
  res.json(zones);
}

export async function createZone(req: Request, res: Response) {
  const { name } = req.body;
  const zone = await ZoneService.createZone(name);
  res.status(201).json(zone);
}