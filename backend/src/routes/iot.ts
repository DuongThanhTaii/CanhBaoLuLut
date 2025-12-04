// src/routes/iot.ts
import { Router } from "express";
import { handleWaterLevel } from "../controllers/iotController";

const router = Router();

// POST /api/iot/water-level
router.post("/water-level", handleWaterLevel);

export default router;
