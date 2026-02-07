import { Router } from "express";
import { login, registerCompany } from "../controllers/auth.controller";
import { validate } from "../middlewares/validate.middleware";
import { loginSchema } from "../schemas/auth.schema";

const router = Router();

/**
 * @openapi
 * /api/auth/register-company:
 *   post:
 *     summary: Register a new company and admin user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - companyName
 *               - companySlug
 *               - username
 *               - password
 *             properties:
 *               companyName:
 *                 type: string
 *               companySlug:
 *                 type: string
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: Company created successfully
 *       409:
 *         description: Username or Slug already taken
 */
router.post("/register-company", registerCompany);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Log in to the application
 *     tags: [Auth]
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
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/login", validate(loginSchema), login);

export default router;