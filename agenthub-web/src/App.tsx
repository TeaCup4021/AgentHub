import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ConfigProvider, Spin } from "@douyinfe/semi-ui";
import { AnimatePresence, motion } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { useUIStore } from "@/stores/uiStore";

const SettingsPage = lazy(() =>
  import("@/components/settings").then((m) => ({ default: m.SettingsPage })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

function resolveTheme(theme: "light" | "dark" | "system"): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

const lightColors: Record<string, string> = {
  /* 背景色 — 飞书风格柔和蓝灰 */
  "--semi-color-bg-0": "rgba(240,242,246,1)",
  "--semi-color-bg-1": "rgba(255,255,255,1)",
  "--semi-color-bg-2": "rgba(250,251,252,1)",
  "--semi-color-bg-3": "rgba(244,245,247,1)",
  "--semi-color-bg-4": "rgba(238,240,243,1)",
  "--semi-blue-5": "51,112,255",
  "--semi-blue-6": "43,95,217",
  "--semi-blue-7": "34,76,174",
  "--semi-green-0": "232,247,240",
  "--semi-green-1": "209,237,223",
  "--semi-green-2": "158,217,188",
  "--semi-green-3": "107,194,152",
  "--semi-green-4": "56,168,117",
  "--semi-green-5": "0,168,112",
  "--semi-green-6": "0,138,90",
  "--semi-green-7": "0,108,70",
  "--semi-green-8": "0,78,52",
  "--semi-green-9": "0,48,32",
  "--semi-red-0": "252,240,239",
  "--semi-red-1": "248,220,218",
  "--semi-red-2": "242,181,178",
  "--semi-red-3": "235,139,137",
  "--semi-red-4": "229,100,99",
  "--semi-red-5": "213,73,65",
  "--semi-red-6": "184,58,51",
  "--semi-red-7": "156,45,40",
  "--semi-red-8": "124,33,29",
  "--semi-red-9": "88,20,18",
  "--semi-orange-0": "253,242,233",
  "--semi-orange-1": "250,226,205",
  "--semi-orange-2": "246,194,152",
  "--semi-orange-3": "240,161,101",
  "--semi-orange-4": "235,129,52",
  "--semi-orange-5": "227,115,24",
  "--semi-orange-6": "197,98,16",
  "--semi-orange-7": "162,78,9",
  "--semi-orange-8": "122,56,5",
  "--semi-orange-9": "78,34,2",
};

const darkColors: Record<string, string> = {
  "--semi-color-bg-0": "rgba(20,20,20,1)",
  "--semi-color-bg-1": "rgba(31,31,31,1)",
  "--semi-color-bg-2": "rgba(42,42,42,1)",
  "--semi-color-bg-3": "rgba(51,51,51,1)",
  "--semi-color-bg-4": "rgba(58,58,58,1)",
  "--semi-blue-5": "92,143,255",
  "--semi-blue-6": "125,168,255",
  "--semi-blue-7": "74,114,204",
  "--semi-green-0": "33,55,42",
  "--semi-green-1": "40,68,52",
  "--semi-green-2": "55,93,72",
  "--semi-green-3": "70,118,92",
  "--semi-green-4": "85,143,112",
  "--semi-green-5": "91,186,138",
  "--semi-green-6": "125,212,168",
  "--semi-green-7": "66,153,107",
  "--semi-green-8": "48,112,78",
  "--semi-green-9": "32,74,52",
  "--semi-red-0": "58,33,31",
  "--semi-red-1": "72,41,39",
  "--semi-red-2": "98,56,53",
  "--semi-red-3": "124,71,67",
  "--semi-red-4": "152,87,83",
  "--semi-red-5": "224,136,124",
  "--semi-red-6": "240,168,160",
  "--semi-red-7": "192,112,104",
  "--semi-red-8": "152,86,79",
  "--semi-red-9": "108,58,52",
  "--semi-orange-0": "52,37,24",
  "--semi-orange-1": "64,45,29",
  "--semi-orange-2": "88,62,40",
  "--semi-orange-3": "112,79,51",
  "--semi-orange-4": "136,96,62",
  "--semi-orange-5": "240,160,74",
  "--semi-orange-6": "245,188,120",
  "--semi-orange-7": "204,130,50",
  "--semi-orange-8": "160,100,36",
  "--semi-orange-9": "112,68,22",
};

function applyThemeColors(resolved: "light" | "dark") {
  const colors = resolved === "dark" ? darkColors : lightColors;
  const body = document.body;
  Object.entries(colors).forEach(([key, value]) => {
    body.style.setProperty(key, value);
  });
}

function ThemeSync() {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    const resolved = resolveTheme(theme);
    applyThemeColors(resolved);

    if (resolved === "dark") {
      document.body.setAttribute("theme-mode", "dark");
    } else {
      document.body.removeAttribute("theme-mode");
    }
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const resolved = resolveTheme("system");
      applyThemeColors(resolved);
      if (mq.matches) {
        document.body.setAttribute("theme-mode", "dark");
      } else {
        document.body.removeAttribute("theme-mode");
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  return null;
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        style={{ height: "100%" }}
      >
        <Routes location={location}>
          <Route path="/settings" element={
            <Suspense fallback={<div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}><Spin size="large" /></div>}>
              <SettingsPage />
            </Suspense>
          } />
          <Route path="/*" element={<AppLayout />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <ThemeSync />
        <BrowserRouter>
          <AnimatedRoutes />
        </BrowserRouter>
        <Toaster position="top-center" richColors />
      </ConfigProvider>
    </QueryClientProvider>
  );
}
