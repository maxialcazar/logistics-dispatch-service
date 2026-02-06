import { Router } from "express";
import { getSystemMetrics } from "../controllers/admin.controller";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";

const router = Router();

router.use(auth);

/**
 * @openapi
 * /api/admin/metrics:
 *   get:
 *     summary: Get system health and metrics (Dispatchers only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System metrics
 */
router.get("/metrics", requireRole("dispatcher"), getSystemMetrics);

export default router;
