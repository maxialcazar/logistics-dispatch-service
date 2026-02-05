import { Request, Response } from "express";
import { prisma } from "../prisma";
import bcrypt from "bcrypt";
import { AuthRequest } from "../middlewares/auth.middleware";

// Listar drivers
export async function getDrivers(req: Request, res: Response) {
  const drivers = await prisma.driver.findMany({
    include: { zones: true },
  });
  res.json(drivers);
}

// Crear driver
export async function createDriver(req: Request, res: Response) {
  const { name, username, password } = req.body;

  if (!name || !username || !password) {
    return res.status(400).json({
      error: "name, username and password are required",
    });
  }

  const existingUser = await prisma.user.findUnique({
    where: { username },
  });

  if (existingUser) {
    return res.status(400).json({ error: "username already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const driver = await prisma.driver.create({
    data: {
      name,
      user: {
        create: {
          username,
          password: hashedPassword,
          role: "driver",
        },
      },
    },
    include: {
      user: true,
    },
  });

  res.status(201).json(driver);
}

export async function assignZonesToDriver(req: Request, res: Response) {
  const { driverId } = req.params;
  const { zoneIds } = req.body;

  if (!Array.isArray(zoneIds)) {
    return res.status(400).json({ error: "zoneIds must be an array" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Liberar zonas previas de este driver
      await tx.zone.updateMany({
        where: { driverId: driverId as string },
        data: { driverId: null },
      });

      // 2. Asignar nuevas zonas
      await tx.zone.updateMany({
        where: { id: { in: zoneIds } },
        data: { driverId: driverId as string },
      });

      return { ok: true };
    });

    res.json(result);
  } catch (error) {
    console.error("Error in assignZonesToDriver:", error);
    res.status(500).json({ error: "Failed to assign zones" });
  }
}

export async function getDriverZones(req: Request, res: Response) {
  const { driverId } = req.params;

  const zones = await prisma.zone.findMany({
    where: { driverId: driverId as string },
  });

  res.json(zones);
}

export async function getMyZones(req: AuthRequest, res: Response) {
  if (!req.user?.driverId) {
    return res.status(400).json({ error: "Not a driver" });
  }

  const zones = await prisma.zone.findMany({
    where: { driverId: req.user.driverId },
  });

  res.json(zones);
}