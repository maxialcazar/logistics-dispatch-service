import { Router } from "express";
import {
  getDrivers,
  createDriver,
  assignZonesToDriver,
  getDriverZones,
  getMyZones,
  updateLocation,
  getDriverById,
  updateDriver,
  deleteDriver,
} from "../controllers/drivers.controller";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  createDriverSchema,
  assignZonesSchema,
  updateLocationSchema,
  getDriverZonesSchema,
  getDriverByIdSchema,
  updateDriverSchema,
  deleteDriverSchema,
} from "../schemas/driver.schema";

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
 *       409:
 *         description: Username already exists
 */
router.post("/", requireRole("dispatcher", "admin"), validate(createDriverSchema), createDriver);

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
 *   put:
 *     summary: Assign or replace zones for a driver
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
const assignDriverZonesMiddlewares = [
  requireRole("dispatcher", "admin"),
  validate(assignZonesSchema),
  assignZonesToDriver,
];

router
  .route("/:driverId/zones")
  .post(...assignDriverZonesMiddlewares)
  .put(...assignDriverZonesMiddlewares);

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
router.get("/:driverId/zones", requireRole("dispatcher", "admin"), validate(getDriverZonesSchema), getDriverZones);

/**
 * @openapi
 * /api/drivers/{id}:
 *   get:
 *     summary: Get complete driver detail including zones, online status, and assigned packages
 *     tags: [Drivers]
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
 *         description: Driver detail (without password)
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Driver not found
 *   patch:
 *     summary: Update driver details and optional linked user credentials
 *     tags: [Drivers]
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
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 120
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 60
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 maxLength: 128
 *               lat:
 *                 type: number
 *                 nullable: true
 *               lng:
 *                 type: number
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Driver updated (without password)
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Driver not found
 *       409:
 *         description: Username already exists
 *       422:
 *         description: Driver has no linked user account
 *   delete:
 *     summary: Safely delete a driver, unlink owned zones, and revert assigned packages to pending
 *     tags: [Drivers]
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
 *         description: Driver safely deleted
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Driver not found
 *       422:
 *         description: Driver has packages currently in transit
 */
router.get("/:id", requireRole("dispatcher", "admin"), validate(getDriverByIdSchema), getDriverById);
router.patch("/:id", requireRole("dispatcher", "admin"), validate(updateDriverSchema), updateDriver);
router.delete("/:id", requireRole("dispatcher", "admin"), validate(deleteDriverSchema), deleteDriver);

export default router;
