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

/**
 * @openapi
 * tags:
 *   name: Packages
 *   description: Package management and assignment
 */

/**
 * @openapi
 * /api/packages:
 *   get:
 *     summary: List all packages
 *     tags: [Packages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 */
router.get("/", requireRole("dispatcher"), getPackages);

/**
 * @openapi
 * /api/packages:
 *   post:
 *     summary: Create a new package
 *     tags: [Packages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Created
 */
router.post("/", requireRole("dispatcher"), createPackage);

/**
 * @openapi
 * /api/packages/driver/{driverId}:
 *   get:
 *     summary: Get packages assigned to a specific driver
 *     tags: [Packages]
 *     parameters:
 *       - in: path
 *         name: driverId
 *         required: true
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 */
router.get("/driver/:driverId", requireRole("dispatcher"), getPackagesByDriver);

/**
 * @openapi
 * /api/packages/{packageId}/status:
 *   patch:
 *     summary: Update package status
 *     tags: [Packages]
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 */
router.patch("/:packageId/status", requireRole("dispatcher", "driver"), updatePackageStatus);

/**
 * @openapi
 * /api/packages/{packageId}/assign:
 *   post:
 *     summary: Assign a package to a driver
 *     tags: [Packages]
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 */
router.post("/:packageId/assign", requireRole("dispatcher"), assignPackageToDriver);

/**
 * @openapi
 * /api/packages/me:
 *   get:
 *     summary: Get packages of the current logged-in driver
 *     tags: [Packages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 */
router.get("/me", auth, requireRole("driver"), getMyPackages);

export default router;
