import { Router } from "express";
import { createUser } from "../controllers/users.controller";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";

const router = Router();

/**
 * @openapi
 * /api/users:
 *   post:
 *     summary: Create a new user (Dispatcher only)
 *     tags: [Users]
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
router.post("/", auth, requireRole("dispatcher"), createUser);

export default router;
