import { Router } from "express";
import {
  getDrivers,
  createDriver,
  assignZonesToDriver,
} from "../controllers/drivers.controller";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";

const router = Router();

router.use(auth);

router.get("/", requireRole("dispatcher"), getDrivers);
router.post("/", requireRole("dispatcher"), createDriver);
router.post("/:id/zones", requireRole("dispatcher"), assignZonesToDriver);

export default router;
