# HƯỚNG DẪN SỬ DỤNG

## Hệ thống giám sát & cảnh báo mực nước

---

## 1. Giới thiệu

Hệ thống giúp bạn:

- **Giám sát mực nước** của bồn / hố ga / kênh trên thời gian thực.
- **Xem biểu đồ lịch sử** mực nước theo thời gian.
- **Nhận cảnh báo tức thời qua Telegram** khi:
  - Mực nước **quá thấp** (có nguy cơ thiếu nước).
  - Mực nước **quá cao** (nguy cơ tràn / ngập).

Hệ thống gồm 3 phần:

1. **Thiết bị IoT** (ESP32 + cảm biến mực nước) gắn tại vị trí cần giám sát.
2. **Máy chủ** (backend + cơ sở dữ liệu) lưu trữ & xử lý dữ liệu.
3. **Website dashboard** để theo dõi & cấu hình (frontend) + **bot Telegram** gửi cảnh báo.

> Ghi chú:
>
> - Đường dẫn website: **`https://canh-bao-lu-lut.vercel.app/`**.
> - Bot Telegram: **`@canh_bao_lu_lut_bot`**.

---

## 2. Điều kiện để sử dụng

1. Thiết bị IoT đã được **lắp đặt & cấu hình WiFi** bởi kỹ thuật viên.
2. Bạn có:
   - Điện thoại / máy tính có Internet.
   - Tài khoản **Telegram**.
3. Đã được cấp:
   - Đường dẫn website: `https://canh-bao-lu-lut.vercel.app/`
   - Tên bot Telegram: `@canh_bao_lu_lut_bot`

---

## 3. Đăng nhập & truy cập website

1. Mở trình duyệt (Chrome, Edge, …).
2. Gõ địa chỉ:

   ```text
   https://canh-bao-lu-lut.vercel.app/
   ```
