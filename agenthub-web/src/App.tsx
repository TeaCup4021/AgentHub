import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ConfigProvider } from "@douyinfe/semi-ui";
import { AnimatePresence, motion } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { SettingsPage } from "@/components/settings";
import { useUIStore } from "@/stores/uiStore";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

function ThemeSync() {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    if (theme === "dark") {
      document.body.setAttribute("theme-mode", "dark");
    } else {
      document.body.removeAttribute("theme-mode");
    }
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
          <Route path="/settings" element={<SettingsPage />} />
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
