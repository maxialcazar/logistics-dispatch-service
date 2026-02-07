import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";

// Routers
import packagesRouter from "./routes/packages.routes";
import driversRouter from "./routes/drivers.routes";
import zonesRouter from "./routes/zones.routes";
import authRouter from "./routes/auth.routes";
import usersRouter from "./routes/users.routes";
import publicRouter from "./routes/public.routes";
import adminRouter from "./routes/admin.routes";

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

// Security Middleware
app.use(helmet());
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, 
	max: 50000, // Limit each IP
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

// Middleware global
app.use(cors());
app.use(express.json());

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

// Health check
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// Error handler
app.use(errorHandler);

export default app;
