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
 *     summary: Get tenant-scoped operational metrics (Admin and Dispatchers; global metrics require system scope)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tenant operational metrics (plus global server metrics when system-scoped)
 */
router.get("/metrics", requireRole("admin", "dispatcher", "system", "superadmin"), getSystemMetrics);

export default router;
