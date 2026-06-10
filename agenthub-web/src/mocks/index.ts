import api from "@/lib/api";
import { setMockSSE } from "@/lib/sse";
import { setupMockHandlers } from "./handlers";
import { createMockSSEStream } from "./sse";

let cleanupHandlers: (() => void) | null = null;

export function enableMockMode() {
  if (cleanupHandlers) return;
  cleanupHandlers = setupMockHandlers(api);
  setMockSSE(createMockSSEStream);
  console.log("[Mock] API + SSE 拦截器已启用");
}

export function disableMockMode() {
  cleanupHandlers?.();
  cleanupHandlers = null;
  setMockSSE(null);
  console.log("[Mock] API + SSE 拦截器已关闭");
}

export { createMockSSEStream };
