import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { enableMockMode } from "./mocks";
import "reset-css";
import "./styles/tokens.css";
import "./index.css";
import App from "./App";

// [后端对接] VITE_USE_MOCK=false 切换真实 API，默认 Mock
const useMock = import.meta.env.VITE_USE_MOCK !== "false";

if (useMock) {
  enableMockMode();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
