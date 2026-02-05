/*import { Request, Response } from "express";
import { drivers } from "../storage/drivers.store";
import { Driver } from "../models/driver.model";
import { randomUUID } from "crypto";
import { zones } from "../storage/zones.store";

export function getDrivers(req: Request, res: Response) {
  res.json(drivers);
}

export function createDriver(req: Request, res: Response) {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: "name and email required" });
  }

  const newDriver: Driver = {
    id: randomUUID(),
    name,
    email,
    zoneIds: [],
  };

  drivers.push(newDriver);

  res.status(201).json(newDriver);
}

export function assignZonesToDriver(req: Request, res: Response) {
  const { driverId } = req.params;
  const { zoneIds } = req.body;

  if (!Array.isArray(zoneIds)) {
    return res.status(400).json({ error: "zoneIds must be an array" });
  }

  const driver = drivers.find(d => d.id === driverId);
  if (!driver) {
    return res.status(404).json({ error: "driver not found" });
  }

  const validZoneIds = zones.map(z => z.id);
  const invalid = zoneIds.filter(id => !validZoneIds.includes(id));

  if (invalid.length > 0) {
    return res.status(400).json({ error: "invalid zoneIds", invalid });
  }

  driver.zoneIds = [...new Set(zoneIds)];

  res.json(driver);
}*/

import { Request, Response } from "express";
import { prisma } from "../prisma";

// Listar drivers
export async function getDrivers(req: Request, res: Response) {
  const drivers = await prisma.driver.findMany({
    include: { zones: true, packages: true },
  });
  res.json(drivers);
}

// Crear driver
export async function createDriver(req: Request, res: Response) {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });

  const driver = await prisma.driver.create({
    data: { name },
  });
  res.status(201).json(driver);
}

// Asignar zonas a driver
export async function assignZonesToDriver(req: Request, res: Response) {
  // Corregir params
  const driverId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { zoneIds } = req.body as { zoneIds: string[] };

  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) return res.status(404).json({ error: "driver not found" });

  const updated = await prisma.driver.update({
    where: { id: driverId },
    data: {
      zones: {
        set: zoneIds.map((id) => ({ id })), // reemplaza las zonas actuales
      },
    },
    include: { zones: true },
  });

  res.json(updated);
}