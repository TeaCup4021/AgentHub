import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { enableMockMode } from "./mocks";
import "./index.css";
import App from "./App";

//enableMockMode();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
