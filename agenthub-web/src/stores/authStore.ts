import { create } from "zustand";
import api from "@/lib/api";

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  isVerified: boolean;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  sendCode: (email: string) => Promise<string | undefined>;
  register: (email: string, code: string, name: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  _setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  _clearAuth: () => void;
}

function persistToken(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* */ }
}

function removeToken(key: string) {
  try { localStorage.removeItem(key); } catch { /* */ }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  _setAuth: (user, accessToken, refreshToken) => {
    persistToken("token", accessToken);
    persistToken("refresh_token", refreshToken);
    set({ user, isAuthenticated: true, isLoading: false });
  },

  _clearAuth: () => {
    removeToken("token");
    removeToken("refresh_token");
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  sendCode: async (email) => {
    const res = await api.post("/auth/send-code", { email });
    const code: string | undefined = res.data?.data?.code;
    if (code) console.log("[dev] 验证码:", code, "→", email);
    return code;
  },

  register: async (email, code, name, password) => {
    const res = await api.post("/auth/register", { email, code, name, password });
    const { accessToken, refreshToken } = res.data.data;
    persistToken("token", accessToken);
    persistToken("refresh_token", refreshToken);
    await useAuthStore.getState().fetchMe();
  },

  login: async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    const { accessToken, refreshToken } = res.data.data;
    persistToken("token", accessToken);
    persistToken("refresh_token", refreshToken);
    await useAuthStore.getState().fetchMe();
  },

  logout: () => {
    useAuthStore.getState()._clearAuth();
  },

  fetchMe: async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }
      const res = await api.get("/auth/me");
      set({ user: res.data.data, isAuthenticated: true, isLoading: false });
    } catch {
      useAuthStore.getState()._clearAuth();
    }
  },
}));
