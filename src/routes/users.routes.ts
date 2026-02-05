import { Router } from "express";
import { createUser } from "../controllers/users.controller";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";

const router = Router();

router.post("/", auth, requireRole("dispatcher"), createUser);

export default router;
