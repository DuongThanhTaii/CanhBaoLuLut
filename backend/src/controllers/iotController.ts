// src/controllers/iotController.ts
import { Request, Response } from "express";
import { pool } from "../config/db";
import { sendTelegramMessage } from "../services/telegram";

type IotPayload = {
  device_id?: string;
  water_level_cm?: number;
  water_level_percent?: number;
  status?: string;
  timestamp?: string;
  secret_key?: string;
};

export async function handleWaterLevel(req: Request, res: Response) {
  try {
    const {
      device_id,
      water_level_cm,
      water_level_percent,
      status,
      timestamp,
      secret_key,
    } = req.body as IotPayload;

    // 1) Validate input cơ bản
    if (!device_id) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "DEVICE_ID_REQUIRED",
      });
    }

    // 2) Check secret_key (nếu GLOBAL_SECRET_KEY được set)
    const expectedKey = process.env.GLOBAL_SECRET_KEY;
    if (expectedKey && secret_key !== expectedKey) {
      return res.status(403).json({
        success: false,
        data: null,
        error: "INVALID_SECRET_KEY",
      });
    }

    const client = await pool.connect();
    // Biến để lưu info alert (sau commit mới gửi Telegram)
    let alertToSend: {
      alertId: bigint;
      text: string;
      chatId: string | null;
    } | null = null;

    try {
      await client.query("BEGIN");

      // 3.1) Ensure device tồn tại
      let deviceName = `Device ${device_id}`;
      const deviceRes = await client.query(
        "SELECT id, name FROM devices WHERE device_id = $1",
        [device_id]
      );

      if (deviceRes.rowCount === 0) {
        const insertDevice = await client.query(
          "INSERT INTO devices (device_id, name, location) VALUES ($1, $2, $3) RETURNING id, name",
          [device_id, deviceName, ""]
        );
        deviceName = insertDevice.rows[0].name;
      } else {
        deviceName = deviceRes.rows[0].name;
      }

      // 3.2) Lấy hoặc tạo alert_config (ngưỡng mặc định)
      const DEFAULT_MIN = 20;
      const DEFAULT_MAX = 90;

      const cfgRes = await client.query(
        `SELECT min_level_percent, max_level_percent, alert_enabled, telegram_chat_id
         FROM alert_config WHERE device_id = $1`,
        [device_id]
      );

      let minLevel = DEFAULT_MIN;
      let maxLevel = DEFAULT_MAX;
      let alertEnabled = true;
      let deviceChatId: string | null = null;

      if (cfgRes.rowCount === 0) {
        // chưa có config → tạo default
        await client.query(
          `INSERT INTO alert_config
           (device_id, min_level_percent, max_level_percent, alert_enabled)
           VALUES ($1, $2, $3, $4)`,
          [device_id, DEFAULT_MIN, DEFAULT_MAX, true]
        );
      } else {
        const row = cfgRes.rows[0];
        if (row.min_level_percent != null) {
          minLevel = Number(row.min_level_percent);
        }
        if (row.max_level_percent != null) {
          maxLevel = Number(row.max_level_percent);
        }
        if (row.alert_enabled != null) {
          alertEnabled = row.alert_enabled;
        }
        if (row.telegram_chat_id != null) {
          deviceChatId = String(row.telegram_chat_id);
        }
      }

      // 3.3) Tính status
      let finalStatus = status ?? "UNKNOWN";

      if (typeof water_level_percent === "number") {
        if (water_level_percent < minLevel) finalStatus = "LOW";
        else if (water_level_percent > maxLevel) finalStatus = "HIGH";
        else finalStatus = "NORMAL";
      }

      // 3.4) Xử lý timestamp
      const createdAt = timestamp ? new Date(timestamp) : new Date();

      // 3.5) Insert vào water_readings
      const insertReading = await client.query(
        `INSERT INTO water_readings
         (device_id, water_level_cm, water_level_percent, status, created_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          device_id,
          water_level_cm ?? null,
          water_level_percent ?? null,
          finalStatus,
          createdAt,
        ]
      );

      const reading = insertReading.rows[0];
      const readingId = BigInt(reading.id); // water_readings.id là BIGSERIAL

      // 3.6) Nếu cần cảnh báo → tạo bản ghi trong alerts
      const shouldAlert = finalStatus === "LOW" || finalStatus === "HIGH";
      const defaultChatId = process.env.TELEGRAM_DEFAULT_CHAT_ID || null;
      const targetChatId = deviceChatId || defaultChatId; // ưu tiên chat_id trong config

      let alertRow: any = null;

      if (shouldAlert) {
        const alertType = finalStatus === "LOW" ? "LOW_LEVEL" : "HIGH_LEVEL";
        const levelText =
          typeof water_level_percent === "number"
            ? `${water_level_percent.toFixed(1)}%`
            : "N/A";

        const alertText = [
          `⚠️ CẢNH BÁO MỨC NƯỚC ${finalStatus === "LOW" ? "THẤP" : "CAO"}`,
          `Thiết bị: ${deviceName} (${device_id})`,
          `Mức nước hiện tại: ${levelText}`,
          `Ngưỡng: min=${minLevel}%, max=${maxLevel}%`,
          `Thời gian: ${createdAt.toLocaleString()}`,
        ].join("\n");

        const alertInsert = await client.query(
          `INSERT INTO alerts
           (device_id, reading_id, alert_type, message, sent_to_telegram, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            device_id,
            readingId,
            alertType,
            alertText,
            false, // tạm thời, gửi xong mới update true
            createdAt,
          ]
        );

        alertRow = alertInsert.rows[0];

        if (targetChatId) {
          alertToSend = {
            alertId: BigInt(alertRow.id),
            text: alertText,
            chatId: targetChatId,
          };
        }
      }

      await client.query("COMMIT");

      // 4) Sau khi COMMIT mới gửi Telegram (nếu cần)
      if (alertToSend) {
        try {
          await sendTelegramMessage(alertToSend.chatId!, alertToSend.text);
          await pool.query(
            "UPDATE alerts SET sent_to_telegram = true WHERE id = $1",
            [alertToSend.alertId.toString()]
          );
        } catch (sendErr) {
          console.error("SEND TELEGRAM ALERT ERROR:", sendErr);
          // không throw nữa, tránh làm fail response IoT
        }
      }

      // 5) Trả response
      res.json({
        success: true,
        data: {
          reading,
          device: {
            device_id,
            name: deviceName,
          },
          config: {
            minLevelPercent: minLevel,
            maxLevelPercent: maxLevel,
            alertEnabled,
            deviceChatId,
          },
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
    console.error("handleWaterLevel error:", err);
    res.status(500).json({
      success: false,
      data: null,
      error: err.message || "IOT_ERROR",
    });
  }
}
