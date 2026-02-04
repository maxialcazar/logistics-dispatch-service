import { Request, Response } from "express";
import { drivers } from "../storage/drivers.store";
import { Driver } from "../models/driver.model";
import { randomUUID } from "crypto";

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