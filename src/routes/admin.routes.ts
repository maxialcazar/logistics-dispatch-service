import { Router } from "express";
import {
  getCompany,
  getSystemMetrics,
  updateCompany,
} from "../controllers/admin.controller";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import { validate } from "../middlewares/validate.middleware";
import { updateCompanySchema } from "../schemas/company.schema";

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

export const companyRouter = Router();

companyRouter.use(auth);

/**
 * @openapi
 * tags:
 *   name: Company
 *   description: Tenant company profile and settings management (admin only)
 */

/**
 * @openapi
 * /api/company:
 *   get:
 *     summary: Get the authenticated admin's company profile
 *     tags: [Company]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Company profile details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 name:
 *                   type: string
 *                 slug:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin role required)
 *       404:
 *         description: Company not found
 *   patch:
 *     summary: Update the authenticated admin's company name or slug
 *     tags: [Company]
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
 *                 maxLength: 100
 *               slug:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 60
 *                 pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"
 *     responses:
 *       200:
 *         description: Updated company profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 name:
 *                   type: string
 *                 slug:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin role required)
 *       404:
 *         description: Company not found
 *       409:
 *         description: Company URL/Slug already exists
 */
companyRouter.get("/", requireRole("admin"), getCompany);
companyRouter.patch("/", requireRole("admin"), validate(updateCompanySchema), updateCompany);

export default router;
