import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import dbTestRouter from "./routes/dbTest";
import iotRouter from "./routes/iot";
import telegramTestRouter from "./routes/telegramTest";
import devicesRouter from "./routes/devices";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// health check
app.get("/health", (_req, res) => {
  res.json({
    success: true,
    data: "OK",
    error: null,
  });
});

// test DB
app.use(dbTestRouter);

// IoT endpoint
app.use("/api/iot", iotRouter);

// Telegram test
app.use(telegramTestRouter);

// Web: devices
app.use("/api/devices", devicesRouter);

export default app;
