import { Router } from "express";
import { getUsers, createUser, deleteUser, changePassword } from "../controllers/users.controller";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  getUsersSchema,
  createUserSchema,
  deleteUserSchema,
  changePasswordSchema,
} from "../schemas/user.schema";

const router = Router();

/**
 * @openapi
 * tags:
 *   name: Users
 *   description: Team user management (admin only) and account password updates
 */

/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: List team users scoped to the authenticated admin's company
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Case-insensitive partial filter by username
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, dispatcher, driver]
 *         description: Filter by user role
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
 *         description: Items per page (max 100)
 *     responses:
 *       200:
 *         description: Paginated list of team users (without passwords)
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin role required)
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
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *               password:
 *                 type: string
 *                 minLength: 6
 *               role:
 *                 type: string
 *                 enum: [dispatcher]
 *     responses:
 *       201:
 *         description: Created (without password)
 *       400:
 *         description: Validation failed or cannot create driver user without Driver profile
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin role required)
 *       409:
 *         description: Username already exists
 */
router.get("/", auth, requireRole("admin"), validate(getUsersSchema), getUsers);
router.post("/", auth, requireRole("admin"), validate(createUserSchema), createUser);

/**
 * @openapi
 * /api/users/password:
 *   put:
 *     summary: Change password for the currently authenticated user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password updated successfully
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized or incorrect current password
 *       404:
 *         description: User not found
 */
router.put("/password", auth, validate(changePasswordSchema), changePassword);

/**
 * @openapi
 * /api/users/{id}:
 *   delete:
 *     summary: Delete a team dispatcher user scoped to the authenticated admin's company
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Target user ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       400:
 *         description: Validation failed, self-deletion forbidden, or driver user cannot be deleted directly
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin role required)
 *       404:
 *         description: User not found in this company
 */
router.delete("/:id", auth, requireRole("admin"), validate(deleteUserSchema), deleteUser);

export default router;
