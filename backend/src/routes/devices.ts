// src/routes/devices.ts
import { Router } from "express";
import {
  getDevices,
  getLatestReading,
  getReadings,
  getConfig,
  updateConfig,
} from "../controllers/deviceController";

const router = Router();

// GET /api/devices
router.get("/", getDevices);

// GET /api/devices/:deviceId/latest
router.get("/:deviceId/latest", getLatestReading);

// GET /api/devices/:deviceId/readings
router.get("/:deviceId/readings", getReadings);

// GET /api/devices/:deviceId/config
router.get("/:deviceId/config", getConfig);

// PUT /api/devices/:deviceId/config
router.put("/:deviceId/config", updateConfig);

export default router;
