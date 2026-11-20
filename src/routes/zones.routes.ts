import { Router } from "express";
import {
  getZones,
  getZoneById,
  createZone,
  updateZone,
  deleteZone,
  setAllZonesStatus,
} from "../controllers/zones.controller";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  bulkZoneStatusSchema,
  createZoneSchema,
  deleteZoneSchema,
  getZoneByIdSchema,
  updateZoneSchema,
} from "../schemas/zone.schema";

const router = Router();

router.use(auth);

/**
 * @openapi
 * /api/zones:
 *   get:
 *     summary: List all zones with optional filtering
 *     tags: [Zones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Filter by zone name (partial match)
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
// allow admin to create zones too
router.post("/bulk-status", requireRole("dispatcher", "admin"), validate(bulkZoneStatusSchema), setAllZonesStatus);
router.get("/", requireRole("dispatcher", "admin"), getZones);

/**
 * @openapi
 * /api/zones:
 *   post:
 *     summary: Create a new zone
 *     tags: [Zones]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Created
 */
router.post("/", requireRole("dispatcher", "admin"), validate(createZoneSchema), createZone);

/**
 * @openapi
 * /api/zones/{id}:
 *   get:
 *     summary: Get complete zone detail including polygon, assigned driver (without password), and package counts
 *     tags: [Zones]
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
 *         description: Zone detail
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Zone not found
 *   patch:
 *     summary: Update a zone, driver assignment, polygon, or activation status
 *     tags: [Zones]
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
 *         description: Zone updated
 *       400:
 *         description: Validation failed or cannot activate without driver
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Zone or driver not found
 *   delete:
 *     summary: Delete a zone transactionally, reverting assigned packages to pending and preserving other package states
 *     tags: [Zones]
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
 *         description: Zone deleted
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Zone not found
 */
router.get("/:id", requireRole("dispatcher", "admin"), validate(getZoneByIdSchema), getZoneById);
router.patch("/:id", requireRole("dispatcher", "admin"), validate(updateZoneSchema), updateZone);
router.delete("/:id", requireRole("dispatcher", "admin"), validate(deleteZoneSchema), deleteZone);

export default router;
