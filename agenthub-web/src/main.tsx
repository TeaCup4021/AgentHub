import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { enableMockMode } from "./mocks";
import "reset-css";
import "./styles/tokens.css";
import "./index.css";
import App from "./App";

enableMockMode();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
