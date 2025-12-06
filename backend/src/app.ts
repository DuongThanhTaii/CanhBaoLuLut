import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import dbTestRouter from "./routes/dbTest";
import iotRouter from "./routes/iot";
import telegramTestRouter from "./routes/telegramTest";
import devicesRouter from "./routes/devices";

dotenv.config();

// [ARCH] Khởi tạo ứng dụng Express
// Express là framework giúp xử lý các HTTP Request dễ dàng hơn.
const app = express();

// [MIDDLEWARE]
// cors(): Cho phép Frontend (từ domain khác) gọi API tới Backend này.
app.use(cors());
// express.json(): Giúp Backend hiểu được dữ liệu JSON gửi lên từ body request.
app.use(express.json());

// [ROUTES] Định nghĩa các đường dẫn API

// Health check: Để kiểm tra xem server có còn sống không.
app.get("/health", (_req, res) => {
  res.json({
    success: true,
    data: "OK",
    error: null,
  });
});

// Route test kết nối DB (dùng để debug)
app.use(dbTestRouter);

// [CORE] Route xử lý dữ liệu IoT (quan trọng nhất)
// Mọi request bắt đầu bằng /api/iot sẽ đi vào iotRouter
app.use("/api/iot", iotRouter);

// Route test Telegram (dùng để debug)
app.use(telegramTestRouter);

// [WEB] Route phục vụ cho Frontend (lấy danh sách thiết bị, lịch sử...)
app.use("/api/devices", devicesRouter);

export default app;

