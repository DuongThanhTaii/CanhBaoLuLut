// src/controllers/deviceController.ts
import { Request, Response } from "express";
import { pool } from "../config/db";

// GET /api/devices
export async function getDevices(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT id, device_id, name, location, created_at, updated_at
       FROM devices
       ORDER BY id ASC`
    );

    res.json({
      success: true,
      data: result.rows,
      error: null,
    });
  } catch (err: any) {
    console.error("getDevices error:", err);
    res.status(500).json({
      success: false,
      data: null,
      error: err.message || "INTERNAL_ERROR",
    });
  }
}

// GET /api/devices/:deviceId/latest
export async function getLatestReading(req: Request, res: Response) {
  const { deviceId } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, device_id, water_level_cm, water_level_percent, status, created_at
       FROM water_readings
       WHERE device_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [deviceId]
    );

    const latest = result.rows[0] || null;

    res.json({
      success: true,
      data: latest,
      error: null,
    });
  } catch (err: any) {
    console.error("getLatestReading error:", err);
    res.status(500).json({
      success: false,
      data: null,
      error: err.message || "INTERNAL_ERROR",
    });
  }
}

// GET /api/devices/:deviceId/readings?from=&to=&limit=&offset=
export async function getReadings(req: Request, res: Response) {
  const { deviceId } = req.params;
  const { from, to, limit = "100", offset = "0" } = req.query;

  try {
    // Xây where động
    const whereClauses: string[] = ["device_id = $1"];
    const params: any[] = [deviceId];
    let paramIndex = 2;

    if (from) {
      whereClauses.push(`created_at >= $${paramIndex}`);
      params.push(new Date(String(from)));
      paramIndex++;
    }

    if (to) {
      whereClauses.push(`created_at <= $${paramIndex}`);
      params.push(new Date(String(to)));
      paramIndex++;
    }

    const whereSql = whereClauses.join(" AND ");

    const take = Math.min(parseInt(String(limit), 10) || 100, 1000);
    const skip = parseInt(String(offset), 10) || 0;

    // Query data
    const dataSql = `
      SELECT id, device_id, water_level_cm, water_level_percent, status, created_at
      FROM water_readings
      WHERE ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(take, skip);

    // Query count
    const countSql = `
      SELECT COUNT(*) AS count
      FROM water_readings
      WHERE ${whereSql}
    `;
    const countParams = params.slice(0, paramIndex - 1); // chỉ lấy tới where

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataSql, params),
      pool.query(countSql, countParams),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);

    res.json({
      success: true,
      data: {
        items: dataResult.rows,
        total,
        limit: take,
        offset: skip,
      },
      error: null,
    });
  } catch (err: any) {
    console.error("getReadings error:", err);
    res.status(500).json({
      success: false,
      data: null,
      error: err.message || "INTERNAL_ERROR",
    });
  }
}

// GET /api/devices/:deviceId/config
export async function getConfig(req: Request, res: Response) {
  const { deviceId } = req.params;
  const DEFAULT_MIN = 20;
  const DEFAULT_MAX = 90;

  try {
    const cfgRes = await pool.query(
      `SELECT min_level_percent, max_level_percent, alert_enabled, telegram_chat_id
       FROM alert_config
       WHERE device_id = $1
       LIMIT 1`,
      [deviceId]
    );

    if (cfgRes.rowCount === 0) {
      // chưa có config trong DB -> trả default
      return res.json({
        success: true,
        data: {
          deviceId,
          minLevelPercent: DEFAULT_MIN,
          maxLevelPercent: DEFAULT_MAX,
          alertEnabled: true,
          telegramChatId: null,
          isDefault: true, // UI có thể hiển thị "đang dùng ngưỡng mặc định"
        },
        error: null,
      });
    }

    const row = cfgRes.rows[0];

    const minLevel =
      row.min_level_percent != null
        ? Number(row.min_level_percent)
        : DEFAULT_MIN;
    const maxLevel =
      row.max_level_percent != null
        ? Number(row.max_level_percent)
        : DEFAULT_MAX;
    const alertEnabled = row.alert_enabled != null ? row.alert_enabled : true;
    const telegramChatId = row.telegram_chat_id || null;

    res.json({
      success: true,
      data: {
        deviceId,
        minLevelPercent: minLevel,
        maxLevelPercent: maxLevel,
        alertEnabled,
        telegramChatId,
        isDefault: false,
      },
      error: null,
    });
  } catch (err: any) {
    console.error("getConfig error:", err);
    res.status(500).json({
      success: false,
      data: null,
      error: err.message || "INTERNAL_ERROR",
    });
  }
}

// PUT /api/devices/:deviceId/config
export async function updateConfig(req: Request, res: Response) {
  const { deviceId } = req.params;
  const { minLevelPercent, maxLevelPercent, alertEnabled, telegramChatId } =
    req.body;

  const DEFAULT_MIN = 20;
  const DEFAULT_MAX = 90;

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1) Đảm bảo device tồn tại
      const deviceRes = await client.query(
        "SELECT id, name FROM devices WHERE device_id = $1",
        [deviceId]
      );

      if (deviceRes.rowCount === 0) {
        await client.query(
          "INSERT INTO devices (device_id, name, location) VALUES ($1, $2, $3)",
          [deviceId, `Device ${deviceId}`, ""]
        );
      }

      // 2) Lấy config hiện tại (nếu có)
      const cfgRes = await client.query(
        `SELECT id, min_level_percent, max_level_percent, alert_enabled, telegram_chat_id
         FROM alert_config
         WHERE device_id = $1
         LIMIT 1`,
        [deviceId]
      );

      let finalMin =
        typeof minLevelPercent === "number" ? minLevelPercent : DEFAULT_MIN;
      let finalMax =
        typeof maxLevelPercent === "number" ? maxLevelPercent : DEFAULT_MAX;
      let finalAlertEnabled =
        typeof alertEnabled === "boolean" ? alertEnabled : true;
      let finalChatId = telegramChatId !== undefined ? telegramChatId : null;

      if (cfgRes.rowCount != null && cfgRes.rowCount > 0) {
        const row = cfgRes.rows[0];
        // Nếu client không gửi field nào -> giữ giá trị cũ
        if (
          typeof minLevelPercent !== "number" &&
          row.min_level_percent != null
        ) {
          finalMin = Number(row.min_level_percent);
        }
        if (
          typeof maxLevelPercent !== "number" &&
          row.max_level_percent != null
        ) {
          finalMax = Number(row.max_level_percent);
        }
        if (typeof alertEnabled !== "boolean" && row.alert_enabled != null) {
          finalAlertEnabled = row.alert_enabled;
        }
        if (telegramChatId === undefined && row.telegram_chat_id != null) {
          finalChatId = row.telegram_chat_id;
        }

        // UPDATE
        await client.query(
          `UPDATE alert_config
           SET min_level_percent = $2,
               max_level_percent = $3,
               alert_enabled    = $4,
               telegram_chat_id = $5,
               updated_at       = NOW()
           WHERE device_id = $1`,
          [deviceId, finalMin, finalMax, finalAlertEnabled, finalChatId]
        );
      } else {
        // INSERT mới
        await client.query(
          `INSERT INTO alert_config
           (device_id, min_level_percent, max_level_percent, alert_enabled, telegram_chat_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [deviceId, finalMin, finalMax, finalAlertEnabled, finalChatId]
        );
      }

      await client.query("COMMIT");

      res.json({
        success: true,
        data: {
          deviceId,
          minLevelPercent: finalMin,
          maxLevelPercent: finalMax,
          alertEnabled: finalAlertEnabled,
          telegramChatId: finalChatId,
        },
        error: null,
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("updateConfig error:", err);
    res.status(500).json({
      success: false,
      data: null,
      error: err.message || "INTERNAL_ERROR",
    });
  }
}
