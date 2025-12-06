// src/server.ts
// [ARCH] Đây là điểm khởi đầu (Entry Point) của toàn bộ Backend.
// Khi bạn chạy lệnh "npm run dev", file này sẽ được thực thi đầu tiên.

import dotenv from "dotenv";
import app from "./app";

// Load các biến môi trường từ file .env (như PORT, DATABASE_URL)
dotenv.config();

// Xác định cổng chạy server. Nếu không có trong .env thì dùng 4000.
const PORT = process.env.PORT || 4000;

// Khởi động server lắng nghe các request gửi tới
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

