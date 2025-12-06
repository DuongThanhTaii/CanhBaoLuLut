// src/controllers/iotController.ts
import { Request, Response } from "express";
import { pool } from "../config/db";
import { sendTelegramMessage } from "../services/telegram";

// [TYPE] Định nghĩa kiểu dữ liệu mà thiết bị gửi lên
type IotPayload = {
  device_id?: string;        // Mã thiết bị (VD: "ESP32-01")
  water_level_cm?: number;   // Mực nước tính bằng cm (tùy chọn)
  water_level_percent?: number; // Mực nước tính bằng % (quan trọng)
  status?: string;           // Trạng thái thô từ thiết bị (nếu có)
  timestamp?: string;        // Thời gian đo (nếu thiết bị có RTC)
  secret_key?: string;       // Khóa bảo mật để chống giả mạo
};

// [CONTROLLER] Hàm xử lý chính khi nhận dữ liệu từ IoT
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

    // 1) Validate input cơ bản: Bắt buộc phải có device_id
    if (!device_id) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "DEVICE_ID_REQUIRED",
      });
    }

    // 2) Check secret_key (Bảo mật)
    // Nếu server có cài đặt GLOBAL_SECRET_KEY, thì gói tin gửi lên bắt buộc phải khớp.
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
      await client.query("BEGIN"); // Bắt đầu Transaction (đảm bảo toàn vẹn dữ liệu)

      // 3.1) Ensure device tồn tại
      // Nếu device_id này lần đầu gửi tin, hệ thống sẽ tự động tạo mới trong DB.
      let deviceName = `Device ${device_id}`;
      const deviceRes = await client.query(
        "SELECT id, name FROM devices WHERE device_id = $1",
        [device_id]
      );

      if (deviceRes.rowCount === 0) {
        // Chưa có -> Tạo mới (INSERT)
        const insertDevice = await client.query(
          "INSERT INTO devices (device_id, name, location) VALUES ($1, $2, $3) RETURNING id, name",
          [device_id, deviceName, ""]
        );
        deviceName = insertDevice.rows[0].name;
      } else {
        // Đã có -> Lấy tên ra dùng
        deviceName = deviceRes.rows[0].name;
      }


      // 3.2) Lấy cấu hình cảnh báo (Alert Config)
      // Mỗi thiết bị có thể có ngưỡng min/max khác nhau.
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
        // Nếu chưa có config -> Tạo config mặc định
        await client.query(
          `INSERT INTO alert_config
           (device_id, min_level_percent, max_level_percent, alert_enabled)
           VALUES ($1, $2, $3, $4)`,
          [device_id, DEFAULT_MIN, DEFAULT_MAX, true]
        );
      } else {
        // Nếu đã có -> Lấy giá trị từ DB
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


      // 3.3) Tính toán trạng thái (Logic quan trọng)
      // So sánh mức nước hiện tại với ngưỡng min/max để ra quyết định.
      let finalStatus = status ?? "UNKNOWN";

      if (typeof water_level_percent === "number") {
        if (water_level_percent < minLevel) finalStatus = "LOW";      // Cạn nước
        else if (water_level_percent > maxLevel) finalStatus = "HIGH"; // Ngập lụt (Nguy hiểm)
        else finalStatus = "NORMAL";                                  // Bình thường
      }


      // 3.4) Xử lý timestamp
      const createdAt = timestamp ? new Date(timestamp) : new Date();

      // 3.5) Insert vào bảng water_readings (Lưu lịch sử)
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
      const readingId = BigInt(reading.id);

      // 3.6) Xử lý Cảnh Báo (Alert Logic)
      // Nếu trạng thái là LOW hoặc HIGH -> Tạo cảnh báo và gửi Telegram

      const shouldAlert = finalStatus === "LOW" || finalStatus === "HIGH";
      const defaultChatId = process.env.TELEGRAM_DEFAULT_CHAT_ID || null;
      const targetChatId = deviceChatId || defaultChatId; // ưu tiên chat_id trong config

      let alertRow: any = null;

      if (shouldAlert) {
        const alertType = finalStatus === "LOW" ? "LOW_LEVEL" : "HIGH_LEVEL";

        const levelPercentText =
          typeof water_level_percent === "number"
            ? `${water_level_percent.toFixed(1)}%`
            : "không rõ";

        const levelCmText =
          typeof water_level_cm === "number"
            ? `${water_level_cm.toFixed(1)} cm`
            : "không rõ";

        const timeText = createdAt.toLocaleString("vi-VN");

        // (Optional) nếu bạn có dashboard URL thì cho vào env
        // const dashboardUrl = process.env.DASHBOARD_URL;
        // const dashboardLine = dashboardUrl
        //   ? `\n🌐 Xem chi tiết: ${dashboardUrl}`
        //   : "";

        // Tiêu đề tuỳ theo trạng thái
        let prefix = "";
        if (finalStatus === "HIGH") {
          prefix = "🚨 CẢNH BÁO MỰC NƯỚC CAO 🚨";
        } else if (finalStatus === "LOW") {
          prefix = "⚠️ Cảnh báo mực nước thấp";
        }

        // Gợi ý hành động
        let actionHint = "";
        if (finalStatus === "HIGH") {
          actionHint =
            "\n➡️ Vui lòng kiểm tra ngay khu vực xung quanh, có nguy cơ tràn/ngập.";
        } else if (finalStatus === "LOW") {
          actionHint =
            "\n➡️ Vui lòng kiểm tra nguồn nước, xem có cần bơm thêm hoặc xử lý sự cố thiếu nước.";
        }

        const alertText = [
          prefix,
          "",
          `📍 Thiết bị: ${deviceName} (${device_id})`,
          `💧 Mực nước hiện tại: ${levelPercentText}`,
          `📊 Ngưỡng cài đặt: min = ${minLevel}% · max = ${maxLevel}%`,
          actionHint,
          // dashboardLine,
        ]
          .filter((line) => line !== "")
          .join("\n");

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

      await client.query("COMMIT"); // Lưu tất cả thay đổi vào DB vĩnh viễn

      // 4) Gửi Telegram (Side Effect)
      // Thực hiện sau khi COMMIT để đảm bảo dữ liệu đã an toàn trong DB.
      if (alertToSend) {
        try {
          await sendTelegramMessage(alertToSend.chatId!, alertToSend.text);
          // Cập nhật trạng thái đã gửi thành công
          await pool.query(
            "UPDATE alerts SET sent_to_telegram = true WHERE id = $1",
            [alertToSend.alertId.toString()]
          );
        } catch (sendErr) {
          console.error("SEND TELEGRAM ALERT ERROR:", sendErr);
          // Lưu ý: Lỗi gửi Telegram không làm lỗi cả request (người dùng vẫn thấy thành công)
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
