import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { login, registerCompany } from "../controllers/auth.controller";
import { validate } from "../middlewares/validate.middleware";
import { loginSchema, registerCompanySchema } from "../schemas/auth.schema";

const router = Router();

interface AuthRateLimiterConfig {
  windowMs: number;
  limit: number;
  message: string;
  skipSuccessfulRequests?: boolean;
}

function createAuthRateLimiter({
  windowMs,
  limit,
  message,
  skipSuccessfulRequests = false,
}: AuthRateLimiterConfig) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    message: { error: message },
  });
}

// Strict anti-abuse limit on tenant/company registration
const registerCompanyLimiter = createAuthRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  message: "Too many registration attempts, please try again later.",
});

// Strict anti-brute-force limit on failed login attempts
const loginLimiter = createAuthRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  skipSuccessfulRequests: true,
  message: "Too many login attempts, please try again later.",
});

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
 *       429:
 *         description: Too many registration attempts
 */
router.post(
  "/register-company",
  registerCompanyLimiter,
  validate(registerCompanySchema),
  registerCompany
);

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
 *       429:
 *         description: Too many login attempts
 */
router.post("/login", loginLimiter, validate(loginSchema), login);

export default router;