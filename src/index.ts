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

// Middlewares
import { auth } from "./middlewares/auth.middleware";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware global
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Rutas
app.use("/api/packages", packagesRouter);
app.use("/api/drivers", driversRouter);
app.use("/api/zones", zonesRouter);
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);

// Health check
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// Error handler genérico
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});

// Arrancar servidor
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});