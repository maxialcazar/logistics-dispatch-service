import { Router } from "express";
import {
  getPackages,
  createPackage,
  getPackageById,
  updatePackage,
  getPackagesByDriver,
  updatePackageStatus,
  assignPackageToDriver,
  getMyPackages,
  getPackageHistory,
  getDashboardStats,
  archivePackages,
  unarchivePackages,
  deletePackages
} from "../controllers/packages.controller";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  getPackagesSchema,
  createPackageSchema,
  getPackageByIdSchema,
  updatePackageSchema,
  unarchivePackagesSchema,
  updatePackageStatusSchema,
  assignPackageSchema,
  getPackagesByDriverSchema,
} from "../schemas/package.schema";

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
 *     summary: List all packages with server-side filtering and pagination
 *     tags: [Packages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Case-insensitive partial search across trackingCode, recipientName, recipientAddress, and recipientPhone
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by package status (single value or comma-separated list from pending, assigned, in_transit, delivered, cancelled)
 *       - in: query
 *         name: zoneId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by zone ID
 *       - in: query
 *         name: driverId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by assigned driver ID (direct driverId or zone driver fallback when package driverId is null)
 *       - in: query
 *         name: trackingCode
 *         schema:
 *           type: string
 *         description: Search by tracking code (partial match, case-insensitive)
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter packages created on or after this date/time (YYYY-MM-DD at 00:00:00.000Z or ISO 8601 datetime)
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter packages created on or before this date/time (YYYY-MM-DD inclusive until 23:59:59.999Z or ISO 8601 datetime)
 *       - in: query
 *         name: isArchived
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *           default: "false"
 *         description: Filter archived packages
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
 *         description: Number of items per page (capped at 100)
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
 *       400:
 *         description: Validation failed for query parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get("/", requireRole("dispatcher", "admin"), validate(getPackagesSchema), getPackages);

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
 *             required: [trackingCode, recipientName, recipientAddress, recipientPhone]
 *             properties:
 *               trackingCode:
 *                 type: string
 *               recipientName:
 *                 type: string
 *               recipientAddress:
 *                 type: string
 *               recipientPhone:
 *                 type: string
 *               recipientEmail:
 *                 type: string
 *                 format: email
 *               addressStreet:
 *                 type: string
 *               addressNumber:
 *                 type: string
 *               addressFloor:
 *                 type: string
 *                 nullable: true
 *               addressCity:
 *                 type: string
 *                 nullable: true
 *               addressZip:
 *                 type: string
 *                 nullable: true
 *               addressCountry:
 *                 type: string
 *               addressReferences:
 *                 type: string
 *               senderName:
 *                 type: string
 *               senderAddress:
 *                 type: string
 *               senderPhone:
 *                 type: string
 *               weight:
 *                 type: number
 *                 nullable: true
 *               volume:
 *                 type: number
 *                 nullable: true
 *               zoneId:
 *                 type: string
 *                 format: uuid
 *               lat:
 *                 type: number
 *                 nullable: true
 *               lng:
 *                 type: number
 *                 nullable: true
 *               estimatedDeliveryAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               deliveryWindowStart:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               deliveryWindowEnd:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Validation failed or zone not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post("/", requireRole("dispatcher", "admin"), validate(createPackageSchema), createPackage);

// Archive Packages
router.post("/archive", requireRole("dispatcher", "admin"), archivePackages);

/**
 * @openapi
 * /api/packages/unarchive:
 *   post:
 *     summary: Unarchive one or more packages
 *     tags: [Packages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [packageIds]
 *             properties:
 *               packageIds:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       200:
 *         description: Packages unarchived
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post("/unarchive", requireRole("dispatcher", "admin"), validate(unarchivePackagesSchema), unarchivePackages);

// Delete Packages (Permanent)
router.post("/delete", requireRole("dispatcher", "admin"), deletePackages);

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
router.get("/stats", requireRole("dispatcher", "admin"), getDashboardStats);

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
 * /api/packages/{id}:
 *   get:
 *     summary: Get complete package detail including zone, assigned driver, chronological history, and delivery evidences
 *     tags: [Packages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Package detail
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Driver not authorized for this package
 *       404:
 *         description: Package not found
 */
router.get("/:id", requireRole("dispatcher", "driver", "admin"), validate(getPackageByIdSchema), getPackageById);

/**
 * @openapi
 * /api/packages/{id}:
 *   patch:
 *     summary: Update package recipient, address, coordinates, delivery window, or reassign zone
 *     tags: [Packages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               recipientName:
 *                 type: string
 *               recipientAddress:
 *                 type: string
 *               recipientPhone:
 *                 type: string
 *               recipientEmail:
 *                 type: string
 *                 format: email
 *                 nullable: true
 *               addressStreet:
 *                 type: string
 *                 nullable: true
 *               addressNumber:
 *                 type: string
 *                 nullable: true
 *               addressFloor:
 *                 type: string
 *                 nullable: true
 *               addressCity:
 *                 type: string
 *                 nullable: true
 *               addressZip:
 *                 type: string
 *                 nullable: true
 *               addressReferences:
 *                 type: string
 *                 nullable: true
 *               senderName:
 *                 type: string
 *                 nullable: true
 *               senderAddress:
 *                 type: string
 *                 nullable: true
 *               senderPhone:
 *                 type: string
 *                 nullable: true
 *               weight:
 *                 type: number
 *                 nullable: true
 *               volume:
 *                 type: number
 *                 nullable: true
 *               zoneId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               lat:
 *                 type: number
 *                 nullable: true
 *               lng:
 *                 type: number
 *                 nullable: true
 *               estimatedDeliveryAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               deliveryWindowStart:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               deliveryWindowEnd:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Package updated
 *       400:
 *         description: Validation failed or zone not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Package not found
 *       422:
 *         description: Package cannot be edited or zone reassigned in current status
 */
router.patch("/:id", requireRole("dispatcher", "admin"), validate(updatePackageSchema), updatePackage);

/**
 * @openapi
 * /api/packages/{packageId}/status:
 *   patch:
 *     summary: Update package status and record optional notes or reason in PackageHistory
 *     tags: [Packages]
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, assigned, in_transit, delivered, cancelled]
 *               lat:
 *                 type: number
 *               lng:
 *                 type: number
 *               estimatedDeliveryAt:
 *                 type: string
 *                 format: date-time
 *               signature:
 *                 type: string
 *               photo:
 *                 type: string
 *               notes:
 *                 type: string
 *                 nullable: true
 *                 description: Optional incident, cancellation, or delivery notes stored in PackageHistory
 *               reason:
 *                 type: string
 *                 nullable: true
 *                 description: Optional cancellation or incident reason stored in PackageHistory
 *               deliveryNotes:
 *                 type: string
 *                 nullable: true
 *                 description: Optional delivery notes alias maintained for compatibility
 *     responses:
 *       200:
 *         description: Success
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Driver not authorized for this package
 *       404:
 *         description: Package not found
 *       422:
 *         description: Invalid status transition
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
 *       403:
 *         description: Driver not authorized for this package's zone
 *       404:
 *         description: Package not found
 */
router.get("/:packageId/history", auth, requireRole("dispatcher", "driver", "admin"), getPackageHistory);

export default router;
