import { Router } from "express";
import { getZones, createZone } from "../controllers/zones.controller";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import { validate } from "../middlewares/validate.middleware";
import { createZoneSchema } from "../schemas/zone.schema";

const router = Router();

router.use(auth);

/**
 * @openapi
 * /api/zones:
 *   get:
 *     summary: List all zones
 *     tags: [Zones]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 */
router.get("/", requireRole("dispatcher"), getZones);

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
router.post("/", requireRole("dispatcher"), validate(createZoneSchema), createZone);

export default router;
