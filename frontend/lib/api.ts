import axios from "axios";
import Cookies from "js-cookie";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = Cookies.get("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      Cookies.remove("token");
      Cookies.remove("user");
      window.location.href = "/";
    }
    return Promise.reject(error);
  },
);

// Auth
export const login = (login: string, password: string) =>
  api.post("/api/auth/login", { login, password });

export const register = (login: string, password: string, role: string) =>
  api.post("/api/auth/register", { login, password, role });

// Receipts
export const uploadReceipt = (formData: FormData) =>
  api.post("/api/receipts", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const getReceipts = () => api.get("/api/receipts");

// Commands
export const getCommands = () => api.get("/api/commands");

export const createCommand = (data: {
  name: string;
  quantity: number;
  price: number;
}) => api.post("/api/command", data);

export const validateCommand = (id: number, status: "validated" | "rejected") =>
  api.post(`/api/commands/${id}/validate`, { status });

// Stock
export const getStock = () => api.get("/api/stock");

// AI
export const getRecommendation = () => api.get("/api/recommendation");
export const getAnalysis = () => api.get("/api/analysis");
export const getReport = () => api.get("/api/report");

// Auth helpers
export const setAuth = (token: string, user: object) => {
  Cookies.set("token", token, { expires: 1 });
  Cookies.set("user", JSON.stringify(user), { expires: 1 });
};

export const getUser = (): {
  id: number;
  login: string;
  role: string;
} | null => {
  const u = Cookies.get("user");
  return u ? JSON.parse(u) : null;
};

export const logout = () => {
  Cookies.remove("token");
  Cookies.remove("user");
  window.location.href = "/";
};

// WebSocket
export const createWebSocket = (
  onMessage: (data: unknown) => void,
): WebSocket => {
  const token = Cookies.get("token");
  const wsUrl = API_URL.replace("http", "ws") + `/api/ws?token=${token}`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onMessage(data);
    } catch {}
  };

  return ws;
};
