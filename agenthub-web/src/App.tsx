import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ConfigProvider } from "@douyinfe/semi-ui";
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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <ThemeSync />
        <BrowserRouter>
          <Routes>
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/*" element={<AppLayout />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" richColors />
      </ConfigProvider>
    </QueryClientProvider>
  );
}
