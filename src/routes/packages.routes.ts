import { Router } from "express";
import {
  getPackages,
  createPackage,
  getPackagesByDriver,
  updatePackageStatus,
  assignPackageToDriver,
} from "../controllers/packages.controller";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";

const router = Router();

router.use(auth);

router.get("/", requireRole("dispatcher"), getPackages);
router.post("/", requireRole("dispatcher"), createPackage);
router.get("/driver/:driverId", requireRole("dispatcher"), getPackagesByDriver);
router.patch("/:packageId/status", requireRole("dispatcher"), updatePackageStatus);
router.post("/:packageId/assign", requireRole("dispatcher"), assignPackageToDriver);

export default router;
