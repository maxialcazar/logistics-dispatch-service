import { Request, Response } from "express";
import { prisma } from "../prisma";

// Listar zonas
export async function getZones(req: Request, res: Response) {
  const zones = await prisma.zone.findMany({ include: { driver: true } });
  res.json(zones);
}

// Crear zona
export async function createZone(req: Request, res: Response) {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });

  const zone = await prisma.zone.create({ data: { name } });
  res.status(201).json(zone);
}