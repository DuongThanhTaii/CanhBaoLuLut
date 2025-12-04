// src/routes/telegramTest.ts
import { Router } from "express";
import { sendTelegramMessage } from "../services/telegram";

const router = Router();

/**
 * POST /api/telegram/test
 * Body (optional):
 *  {
 *    "chatId": "6507355215",
 *    "text": "Nội dung tuỳ chọn"
 *  }
 * Nếu không truyền chatId/text => dùng chatId mặc định trong .env + message mặc định
 */
router.post("/api/telegram/test", async (req, res) => {
  try {
    const body = req.body || {};
    const chatId = body.chatId || process.env.TELEGRAM_DEFAULT_CHAT_ID || null;
    const text =
      body.text || "✅ Test message from Water Level Monitor backend.";

    if (!chatId) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "CHAT_ID_REQUIRED",
      });
    }

    await sendTelegramMessage(chatId, text);

    res.json({
      success: true,
      data: { chatId, text },
      error: null,
    });
  } catch (err: any) {
    console.error("TELEGRAM TEST ERROR:", err);
    res.status(500).json({
      success: false,
      data: null,
      error: err.message || "TELEGRAM_SEND_ERROR",
    });
  }
});

export default router;
