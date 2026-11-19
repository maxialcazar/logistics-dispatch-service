import { Router } from "express";
import { createUser, changePassword } from "../controllers/users.controller";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import { validate } from "../middlewares/validate.middleware";
import { createUserSchema, changePasswordSchema } from "../schemas/user.schema";

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
router.post("/", auth, requireRole("admin"), validate(createUserSchema), createUser);
router.put("/password", auth, validate(changePasswordSchema), changePassword);

export default router;
