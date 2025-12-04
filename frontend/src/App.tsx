// src/App.tsx
import React, { useEffect, useState } from "react";
import {
  getDevices,
  getLatestReading,
  getReadings,
  getConfig,
  updateConfig,
} from "./api/client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

import "./App.css";

type Device = {
  id: number;
  device_id: string;
  name: string;
  location: string | null;
  created_at: string;
  updated_at: string;
};

type Reading = {
  id: string;
  device_id: string;
  water_level_cm: string | null;
  water_level_percent: string | null;
  status: string;
  created_at: string;
};

const StatusDot: React.FC<any> = (props) => {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;

  const status = String(payload.status || "").toUpperCase();
  let fill = "#9ca3af"; // default xám

  if (status === "NORMAL") fill = "#4ade80"; // xanh lá
  else if (status === "LOW") fill = "#f97316"; // cam
  else if (status === "HIGH") fill = "#ef4444"; // đỏ
  else if (status === "UNKNOWN") fill = "#e5e7eb";

  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={fill}
      stroke="#020617"
      strokeWidth={1}
    />
  );
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesError, setDevicesError] = useState<string | null>(null);

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const [latest, setLatest] = useState<Reading | null>(null);
  const [latestLoading, setLatestLoading] = useState(false);
  const [latestError, setLatestError] = useState<string | null>(null);

  const [history, setHistory] = useState<Reading[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [minLevel, setMinLevel] = useState<number>(20);
  const [maxLevel, setMaxLevel] = useState<number>(90);
  const [alertEnabled, setAlertEnabled] = useState<boolean>(true);
  const [telegramChatId, setTelegramChatId] = useState<string>("");
  const [configIsDefault, setConfigIsDefault] = useState<boolean>(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaveMsg, setConfigSaveMsg] = useState<string | null>(null);

  // Load devices lúc mở web
  useEffect(() => {
    async function loadDevices() {
      try {
        setDevicesLoading(true);
        setDevicesError(null);
        const res = await getDevices();
        if (!res.success) {
          throw new Error(res.error || "Failed to load devices");
        }
        setDevices(res.data);
        if (res.data.length > 0) {
          setSelectedDeviceId(res.data[0].device_id);
        }
      } catch (err: any) {
        setDevicesError(err.message || "UNKNOWN_ERROR");
      } finally {
        setDevicesLoading(false);
      }
    }

    loadDevices();
  }, []);

  // Khi chọn device -> load latest + history + config
  useEffect(() => {
    if (!selectedDeviceId) return;

    const deviceId = selectedDeviceId; // đảm bảo là string, không null

    async function loadLatest() {
      try {
        setLatestLoading(true);
        setLatestError(null);
        const res = await getLatestReading(deviceId);
        if (!res.success) {
          throw new Error(res.error || "Failed to load latest reading");
        }
        setLatest(res.data);
      } catch (err: any) {
        setLatestError(err.message || "UNKNOWN_ERROR");
      } finally {
        setLatestLoading(false);
      }
    }

    async function loadHistory() {
      try {
        setHistoryLoading(true);
        setHistoryError(null);
        const res = await getReadings(deviceId, 20);
        if (!res.success) {
          throw new Error(res.error || "Failed to load readings");
        }
        setHistory(res.data.items);
      } catch (err: any) {
        setHistoryError(err.message || "UNKNOWN_ERROR");
      } finally {
        setHistoryLoading(false);
      }
    }

    async function loadConfig() {
      try {
        setConfigLoading(true);
        setConfigError(null);
        setConfigSaveMsg(null);
        const res = await getConfig(deviceId);
        if (!res.success) {
          throw new Error(res.error || "Failed to load config");
        }
        const cfg = res.data;
        setMinLevel(cfg.minLevelPercent);
        setMaxLevel(cfg.maxLevelPercent);
        setAlertEnabled(cfg.alertEnabled);
        setTelegramChatId(cfg.telegramChatId ?? "");
        setConfigIsDefault(cfg.isDefault);
      } catch (err: any) {
        setConfigError(err.message || "UNKNOWN_ERROR");
      } finally {
        setConfigLoading(false);
      }
    }

    loadLatest();
    loadHistory();
    loadConfig();
  }, [selectedDeviceId]);

  async function handleSaveConfig(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedDeviceId) return;

    try {
      setConfigSaving(true);
      setConfigError(null);
      setConfigSaveMsg(null);

      const res = await updateConfig(selectedDeviceId, {
        minLevelPercent: minLevel,
        maxLevelPercent: maxLevel,
        alertEnabled,
        telegramChatId: telegramChatId.trim() || null,
      });

      if (!res.success) {
        throw new Error(res.error || "Update config failed");
      }

      setConfigSaveMsg("Đã lưu cấu hình cảnh báo ✅");
    } catch (err: any) {
      setConfigError(err.message || "UNKNOWN_ERROR");
    } finally {
      setConfigSaving(false);
    }
  }

  const chartData = history
    .slice() // copy
    .reverse() // lịch sử từ cũ -> mới
    .map((r) => ({
      timeLabel: new Date(r.created_at).toLocaleTimeString(), // hiển thị giờ
      value:
        r.water_level_percent != null ? Number(r.water_level_percent) : null,
      status: r.status,
    }));

  return (
    <div className="app-root">
      <header className="app-header">
        <h1>CẢNH BÁO LŨ LỤT HCMUE DASHBOARD</h1>
        <span className="app-subtitle">Nhóm , HCMUE</span>
      </header>

      <main className="app-main">
        <section className="card">
          <h2>Thiết bị</h2>
          {devicesLoading && <p>Đang tải danh sách thiết bị...</p>}
          {devicesError && (
            <p className="error">Lỗi tải thiết bị: {devicesError}</p>
          )}
          {!devicesLoading && !devicesError && devices.length === 0 && (
            <p>Chưa có thiết bị nào.</p>
          )}
          {devices.length > 0 && (
            <select
              className="device-select"
              value={selectedDeviceId || ""}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
            >
              {devices.map((d) => (
                <option key={d.device_id} value={d.device_id}>
                  {d.name} ({d.device_id})
                </option>
              ))}
            </select>
          )}
        </section>

        <section className="card">
          <h2>Trạng thái mới nhất</h2>
          {!selectedDeviceId && <p>Chưa chọn thiết bị.</p>}
          {latestLoading && <p>Đang tải...</p>}
          {latestError && <p className="error">Lỗi: {latestError}</p>}
          {!latestLoading && !latestError && latest && (
            <div className="latest-box">
              <p>
                <strong>Thiết bị:</strong> {latest.device_id}
              </p>
              <p>
                <strong>Mức nước:</strong> {latest.water_level_percent ?? "N/A"}
                %
              </p>
              <p>
                <strong>Trạng thái:</strong>{" "}
                <span
                  className={`status status-${latest.status.toLowerCase()}`}
                >
                  {latest.status}
                </span>
              </p>
              <p>
                <strong>Thời gian:</strong> {formatDate(latest.created_at)}
              </p>
            </div>
          )}
          {!latestLoading && !latestError && !latest && selectedDeviceId && (
            <p>Thiết bị chưa có dữ liệu đo.</p>
          )}
        </section>

        <section className="card">
          <h2>Lịch sử gần đây</h2>
          {historyLoading && <p>Đang tải lịch sử...</p>}
          {historyError && <p className="error">Lỗi: {historyError}</p>}
          {!historyLoading && !historyError && history.length === 0 && (
            <p>Chưa có bản ghi nào.</p>
          )}

          {history.length > 0 && (
            <>
              <div className="chart-wrapper">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={chartData}
                    margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(148,163,184,0.3)"
                    />
                    <XAxis
                      dataKey="timeLabel"
                      tick={{ fontSize: 11, fill: "#cbd5f5" }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: "#cbd5f5" }}
                      tickCount={6}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#020617",
                        border: "1px solid #4b5563",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(val: any, _name, props: any) => {
                        const status = props?.payload?.status ?? "";
                        return [
                          val != null ? `${val}%` : "N/A",
                          `Mức nước (${status})`,
                        ];
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#60a5fa"
                      strokeWidth={2}
                      dot={<StatusDot />}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="table-wrapper">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Thời gian</th>
                      <th>Mức nước (%)</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((r) => (
                      <tr key={r.id}>
                        <td>{formatDate(r.created_at)}</td>
                        <td>{r.water_level_percent ?? "N/A"}</td>
                        <td>
                          <span
                            className={`status status-${r.status.toLowerCase()}`}
                          >
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="card">
          <h2>Cấu hình cảnh báo</h2>
          {!selectedDeviceId && <p>Chưa chọn thiết bị.</p>}
          {selectedDeviceId && (
            <>
              {configLoading && <p>Đang tải cấu hình...</p>}
              {configError && (
                <p className="error">Lỗi config: {configError}</p>
              )}
              {!configLoading && !configError && (
                <form className="config-form" onSubmit={handleSaveConfig}>
                  {configIsDefault && (
                    <p className="config-note">
                      Đang dùng ngưỡng mặc định (20% - 90%). Bạn có thể tùy
                      chỉnh.
                    </p>
                  )}

                  <div className="form-row">
                    <label>
                      Min level (%):
                      <input
                        type="number"
                        step="1"
                        value={minLevel}
                        onChange={(e) =>
                          setMinLevel(Number(e.target.value) || 0)
                        }
                      />
                    </label>
                  </div>

                  <div className="form-row">
                    <label>
                      Max level (%):
                      <input
                        type="number"
                        step="1"
                        value={maxLevel}
                        onChange={(e) =>
                          setMaxLevel(Number(e.target.value) || 0)
                        }
                      />
                    </label>
                  </div>

                  <div className="form-row">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={alertEnabled}
                        onChange={(e) => setAlertEnabled(e.target.checked)}
                      />
                      Bật cảnh báo
                    </label>
                  </div>

                  <div className="form-row">
                    <label>
                      Telegram chat ID (tuỳ chọn):
                      <input
                        type="text"
                        value={telegramChatId}
                        onChange={(e) => setTelegramChatId(e.target.value)}
                        placeholder="Mặc định dùng chat bot có sẵn."
                      />
                    </label>
                  </div>

                  <button type="submit" className="btn" disabled={configSaving}>
                    {configSaving ? "Đang lưu..." : "Lưu cấu hình"}
                  </button>

                  {configSaveMsg && (
                    <p className="success-text">{configSaveMsg}</p>
                  )}
                </form>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
