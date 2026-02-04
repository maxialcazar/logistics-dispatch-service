import { Router } from "express";
import { getZones, createZone } from "../controllers/zones.controller";
import { auth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";

const router = Router();

router.use(auth);
router.use(requireRole("dispatcher"));

router.get("/", getZones);
router.post("/", createZone);

export default router;