import { Router } from "express";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import {
  getDrivers,
  createDriver,
  assignZonesToDriver,
} from "../controllers/drivers.controller";

export const driversRouter = Router();

driversRouter.use(auth);
driversRouter.use(requireRole("dispatcher"));

driversRouter.get("/", getDrivers);
driversRouter.post("/", createDriver);
driversRouter.post("/:driverId/zones", assignZonesToDriver);
