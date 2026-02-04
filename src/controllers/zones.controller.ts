import { Request, Response } from "express";
import { zones } from "../storage/zones.store";
import { randomUUID } from "crypto";
import { Zone } from "../models/zones.model";

export function getZones(req: Request, res: Response) {
  res.json(zones);
}

export function createZone(req: Request, res: Response) {
  const { code, description } = req.body;

  if (!code) {
    return res.status(400).json({ error: "code is required" });
  }

  const exists = zones.some(z => z.code === code);
  if (exists) {
    return res.status(409).json({ error: "zone already exists" });
  }

  const zone: Zone = {
    id: randomUUID(),
    code,
    description,
  };

  zones.push(zone);
  res.status(201).json(zone);
}