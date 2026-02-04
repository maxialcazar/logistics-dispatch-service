import { Request, Response } from "express";
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
}