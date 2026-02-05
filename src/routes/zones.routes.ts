import { Router } from "express";
import { getZones, createZone } from "../controllers/zones.controller";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";

const router = Router();

router.use(auth);

router.get("/", requireRole("dispatcher"), getZones);
router.post("/", requireRole("dispatcher"), createZone);

export default router;
