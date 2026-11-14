import { Router } from "express";
import {
  getPackages,
  createPackage,
  getPackagesByDriver,
  updatePackageStatus,
  assignPackageToDriver,
  getMyPackages,
  getPackageHistory,
  getDashboardStats,
  archivePackages,
  deletePackages
} from "../controllers/packages.controller";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import { validate } from "../middlewares/validate.middleware";
import { createPackageSchema, updatePackageStatusSchema, assignPackageSchema, getPackagesByDriverSchema } from "../schemas/package.schema";

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
 *     summary: List all packages with filtering and pagination
 *     tags: [Packages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, assigned, in_transit, delivered, cancelled]
 *         description: Filter by package status
 *       - in: query
 *         name: zoneId
 *         schema:
 *           type: string
 *         description: Filter by zone ID
 *       - in: query
 *         name: trackingCode
 *         schema:
 *           type: string
 *         description: Search by tracking code (partial match)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 */
router.get("/", requireRole("dispatcher", "admin"), getPackages);

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
router.post("/", requireRole("dispatcher", "admin"), validate(createPackageSchema), createPackage);

/**
 * @openapi
 * /api/packages/stats:
 *   get:
 *     summary: Get dashboard statistics (delivered today, in transit, avg time)
 *     tags: [Packages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 */
// Archive Packages
router.post("/archive", requireRole("dispatcher", "admin"), archivePackages);

// Delete Packages (Permanent)
router.post("/delete", requireRole("dispatcher", "admin"), deletePackages);


router.get("/stats", requireRole("dispatcher", "admin"), getDashboardStats);

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
router.get("/driver/:driverId", requireRole("dispatcher", "admin"), validate(getPackagesByDriverSchema), getPackagesByDriver);

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
router.patch("/:packageId/status", requireRole("dispatcher", "driver", "admin"), validate(updatePackageStatusSchema), updatePackageStatus);

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
router.post("/:packageId/assign", requireRole("dispatcher", "admin"), validate(assignPackageSchema), assignPackageToDriver);

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
router.get("/my-packages", auth, requireRole("driver"), getMyPackages);

/**
 * @openapi
 * /api/packages/{packageId}/history:
 *   get:
 *     summary: Get history of a package
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
router.get("/:packageId/history", auth, requireRole("dispatcher", "driver", "admin"), getPackageHistory);

export default router;
