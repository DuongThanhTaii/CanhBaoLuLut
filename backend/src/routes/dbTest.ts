// src/routes/dbTest.ts
import { Router } from "express";
import { pool } from "../config/db";

const router = Router();

// GET /db-test
router.get("/db-test", async (_req, res) => {
  try {
    // Đếm số device trong bảng devices
    const result = await pool.query("SELECT COUNT(*) AS count FROM devices");
    const count = parseInt(result.rows[0].count, 10);

    res.json({
      success: true,
      data: {
        deviceCount: count,
      },
      error: null,
    });
  } catch (err: any) {
    console.error("DB TEST ERROR:", err);
    res.status(500).json({
      success: false,
      data: null,
      error: err.message || "DB_TEST_ERROR",
    });
  }
});

export default router;
