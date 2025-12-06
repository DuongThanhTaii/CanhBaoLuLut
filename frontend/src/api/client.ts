// src/api/client.ts
// [API CLIENT] File này chứa các hàm gọi lên Server (Backend).
// Thay vì viết fetch() rải rác khắp nơi, ta gom vào đây để dễ quản lý.

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

// Hàm tiện ích: Gọi GET và trả về JSON
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed ${res.status}: ${text}`);
  }
  return res.json();
}


// 1. Lấy danh sách thiết bị
export async function getDevices() {
  return getJson<{
    success: boolean;
    data: {
      id: number;
      device_id: string;
      name: string;
      location: string | null;
      created_at: string;
      updated_at: string;
    }[];
    error: string | null;
  }>("/api/devices");
}


// 2. Lấy số liệu mới nhất (để hiển thị Real-time)
export async function getLatestReading(deviceId: string) {
  return getJson<{
    success: boolean;
    data: {
      id: string;
      device_id: string;
      water_level_cm: string | null;
      water_level_percent: string | null;
      status: string;
      created_at: string;
    } | null;
    error: string | null;
  }>(`/api/devices/${encodeURIComponent(deviceId)}/latest`);
}


// 3. Lấy lịch sử đo đạc (để vẽ biểu đồ)
export async function getReadings(deviceId: string, limit = 20) {
  return getJson<{
    success: boolean;
    data: {
      items: {
        id: string;
        device_id: string;
        water_level_cm: string | null;
        water_level_percent: string | null;
        status: string;
        created_at: string;
      }[];
      total: number;
      limit: number;
      offset: number;
    };
    error: string | null;
  }>(
    `/api/devices/${encodeURIComponent(
      deviceId
    )}/readings?limit=${encodeURIComponent(String(limit))}`
  );
}


// src/api/client.ts  (thêm ở cuối file)

// 4. Lấy cấu hình cảnh báo
export async function getConfig(deviceId: string) {
  return getJson<{
    success: boolean;
    data: {
      deviceId: string;
      minLevelPercent: number;
      maxLevelPercent: number;
      alertEnabled: boolean;
      telegramChatId: string | null;
      isDefault: boolean;
    };
    error: string | null;
  }>(`/api/devices/${encodeURIComponent(deviceId)}/config`);
}


// 5. Cập nhật cấu hình cảnh báo (Gửi PUT request)
export async function updateConfig(
  deviceId: string,
  payload: {
    minLevelPercent?: number;
    maxLevelPercent?: number;
    alertEnabled?: boolean;
    telegramChatId?: string | null;
  }
) {
  const res = await fetch(
    `${API_BASE_URL}/api/devices/${encodeURIComponent(deviceId)}/config`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Config update failed ${res.status}: ${text}`);
  }
  return res.json() as Promise<{
    success: boolean;
    data: {
      deviceId: string;
      minLevelPercent: number;
      maxLevelPercent: number;
      alertEnabled: boolean;
      telegramChatId: string | null;
    };
    error: string | null;
  }>;
}

