import { Router } from "express";
import {
  getPackages,
  createPackage,
  getPackagesByDriver,
  updatePackageStatus,
  assignPackageToDriver,
  getMyPackages
} from "../controllers/packages.controller";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";

const router = Router();

router.use(auth);

router.get("/", requireRole("dispatcher"), getPackages);
router.post("/", requireRole("dispatcher"), createPackage);
router.get("/driver/:driverId", requireRole("dispatcher"), getPackagesByDriver);
router.patch("/:packageId/status", requireRole("dispatcher", "driver"), updatePackageStatus);
router.post("/:packageId/assign", requireRole("dispatcher"), assignPackageToDriver);
router.get("/me", auth, requireRole("driver"), getMyPackages);

export default router;
