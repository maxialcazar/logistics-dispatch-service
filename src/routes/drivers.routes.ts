import { Router } from "express";
import {
  getDrivers,
  createDriver,
  assignZonesToDriver,
  getDriverZones,
  getMyZones,
} from "../controllers/drivers.controller";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import { validate } from "../middlewares/validate.middleware";
import { createDriverSchema, assignZonesSchema } from "../schemas/driver.schema";

const router = Router();

router.use(auth);

router.get("/", requireRole("dispatcher"), getDrivers);
router.post("/", requireRole("dispatcher"), validate(createDriverSchema), createDriver);
router.post("/:driverId/zones", requireRole("dispatcher"), validate(assignZonesSchema), assignZonesToDriver);
router.get("/me/zones", requireRole("driver"), getMyZones);
router.get("/:driverId/zones", requireRole("dispatcher"), getDriverZones);

export default router;
