import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import path from "path";

// Routers
import packagesRouter from "./routes/packages.routes";
import driversRouter from "./routes/drivers.routes";
import zonesRouter from "./routes/zones.routes";
import authRouter from "./routes/auth.routes";
import usersRouter from "./routes/users.routes";
import publicRouter from "./routes/public.routes";
import adminRouter, { companyRouter } from "./routes/admin.routes";

// Middlewares
import { errorHandler } from "./middlewares/error.middleware";

// Swagger
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./swagger";

import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import logger from "./utils/logger";

dotenv.config();

const app = express();

// Trust the first proxy hop so req.ip and rate limiters resolve the real client IP
app.set("trust proxy", 1);

// Security Middleware
app.use(helmet({
	contentSecurityPolicy: false, // Disable CSP for simple monitoring usage
}));

const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, 
	max: 50000, // Limit each IP
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

// Middleware global
// CORS: In production reads CORS_ORIGIN env var; falls back to Vite dev server in development
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:8080'];

app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

// Serve public folder relative to the project root (src/../public)
app.use("/uploads", (_req, res, next) => {
	res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
	res.setHeader("X-Content-Type-Options", "nosniff");
	next();
});
app.use(express.static(path.join(__dirname, "../public")));

// Logging: Use morgan for HTTP request logs, and winston for application logs
app.use(morgan("combined", {
	stream: { write: (message) => logger.info(message.trim()) }
}));


// Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Swagger JSON
app.get("/swagger.json", (req, res) => {
	res.setHeader("Content-Type", "application/json");
	res.send(swaggerSpec);
});

// Rutas
app.use("/api/packages", packagesRouter);
app.use("/api/drivers", driversRouter);
app.use("/api/zones", zonesRouter);
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/public", publicRouter);
app.use("/api/admin", adminRouter);
app.use("/api/company", companyRouter);

// Health check
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// Error handler
app.use(errorHandler);

export default app;
