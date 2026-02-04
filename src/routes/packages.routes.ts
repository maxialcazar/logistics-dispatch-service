import { Router } from "express";
import {
  getPackages,
  createPackage,
  assignPackageToDriver,
  updatePackageStatus,
  getPackagesByDriver,
  getMyPackages,
} from "../controllers/packages.controller";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";

export const packagesRouter = Router();

// Dispatcher

packagesRouter.get("/", auth, requireRole("dispatcher"), getPackages);

packagesRouter.post("/", auth, requireRole("dispatcher"), createPackage);

packagesRouter.post(
  "/:packageId/assign",
  auth,
  requireRole("dispatcher"),
  assignPackageToDriver
);

packagesRouter.get(
  "/driver/:driverId",
  auth,
  requireRole("dispatcher"),
  getPackagesByDriver
);

// Driver

packagesRouter.get("/me", auth, requireRole("driver"), getMyPackages);

packagesRouter.patch(
  "/:packageId/status",
  auth,
  requireRole("driver"),
  updatePackageStatus
);