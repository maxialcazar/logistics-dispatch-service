import { Router } from "express";
import {
  getDrivers,
  createDriver,
  assignZonesToDriver,
  getDriverZones,
  getMyZones,
  updateLocation,
} from "../controllers/drivers.controller";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import { validate } from "../middlewares/validate.middleware";
import { createDriverSchema, assignZonesSchema, updateLocationSchema } from "../schemas/driver.schema";

const router = Router();

router.use(auth);

/**
 * @openapi
 * tags:
 *   name: Drivers
 *   description: Driver management and zone assignment
 */

/**
 * @openapi
 * /api/drivers:
 *   get:
 *     summary: List all drivers with filtering and pagination
 *     tags: [Drivers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Filter by driver name (partial match)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Success
 */

// allow admin to manage drivers
router.get("/", requireRole("dispatcher", "admin"), getDrivers);
/**
 * @openapi
 * /api/drivers:
 *   post:
 *     summary: Create a new driver (and its user)
 *     tags: [Drivers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Created
 */
router.post("/", requireRole("dispatcher", "admin"), validate(createDriverSchema), createDriver);

/**
 * @openapi
 * /api/drivers/{driverId}/zones:
 *   post:
 *     summary: Assign zones to a driver
 *     tags: [Drivers]
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
router.post("/:driverId/zones", requireRole("dispatcher", "admin"), validate(assignZonesSchema), assignZonesToDriver);

/**
 * @openapi
 * /api/drivers/me/zones:
 *   get:
 *     summary: Get zones assigned to the current driver
 *     tags: [Drivers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 */
router.get("/me/zones", requireRole("driver"), getMyZones);

/**
 * @openapi
 * /api/drivers/{driverId}/zones:
 *   get:
 *     summary: Get zones of a specific driver
 *     tags: [Drivers]
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
router.get("/:driverId/zones", requireRole("dispatcher", "admin"), getDriverZones);

/**
 * @openapi
 * /api/drivers/location:
 *   patch:
 *     summary: Update driver's current location (real-time tracking)
 *     tags: [Drivers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               lat:
 *                 type: number
 *               lng:
 *                 type: number
 *     responses:
 *       200:
 *         description: Location updated
 */
router.patch("/location", requireRole("driver"), validate(updateLocationSchema), updateLocation);

export default router;
