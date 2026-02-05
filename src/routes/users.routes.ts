import { Router } from "express";
import { createUser } from "../controllers/users.controller";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";

const router = Router();

// For testing purposes, we might want this to be public or restricted
// Let's restrict it to dispatchers for now, as is common in internal tools
router.post("/", auth, requireRole("dispatcher"), createUser);

export default router;
