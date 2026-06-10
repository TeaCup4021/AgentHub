import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSSEStream, setMockSSE } from "../sse";
import type { SSECallbacks } from "../sse";

describe("createSSEStream", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ReadableStream({
        start(controller) {
          controller.close();
        },
      }), { status: 200 }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    setMockSSE(null);
  });

  it("应调用 fetch 正确的 URL", () => {
    const callbacks: SSECallbacks = {};
    createSSEStream("conv-1", callbacks);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("/api/v1/conversations/conv-1/stream");
  });

  it("应使用 GET 方法", () => {
    createSSEStream("conv-1", {});
    const options = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(options.method).toBe("GET");
  });

  it("prompt 存在时应添加到 query params", () => {
    createSSEStream("conv-1", {}, "帮我写代码");
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("prompt=");
  });

  it("返回的 abort 函数应能取消请求", () => {
    const abort = createSSEStream("conv-1", {});
    expect(() => abort()).not.toThrow();
  });

  it("Mock 模式启用时不应调用 fetch", () => {
    const mockFactory = vi.fn(() => () => {});
    setMockSSE(mockFactory);
    createSSEStream("conv-1", {});
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockFactory).toHaveBeenCalled();
  });

  it("Mock 工厂返回的清理函数应用于 abort", () => {
    const cleanup = vi.fn();
    setMockSSE(() => cleanup);
    const abort = createSSEStream("conv-1", {});
    abort();
    expect(cleanup).toHaveBeenCalled();
  });
});
