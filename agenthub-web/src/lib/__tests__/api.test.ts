import axios from "axios";
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import api, { messageApi } from "../api";

function response<T>(
  config: InternalAxiosRequestConfig,
  data: T,
  status = 200,
): AxiosResponse<T> {
  return {
    data,
    status,
    statusText: "OK",
    headers: {},
    config,
  };
}

describe("api auth refresh", () => {
  const originalAdapter = api.defaults.adapter;

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("replays the original message request after refreshing a 401 token", async () => {
    localStorage.setItem("token", "expired-token");
    localStorage.setItem("refresh_token", "refresh-token");

    vi.spyOn(axios, "post").mockResolvedValue(
      response({} as InternalAxiosRequestConfig, {
        code: 200,
        data: { accessToken: "fresh-token" },
        message: "ok",
      }),
    );

    const seenAuthHeaders: Array<string | undefined> = [];
    let messageAttempts = 0;
    const adapter: AxiosAdapter = async (config) => {
      if (config.url === "/conversations/conv-1/messages") {
        messageAttempts += 1;
        seenAuthHeaders.push(config.headers?.Authorization as string | undefined);
        if (messageAttempts === 1) {
          return Promise.reject({
            config,
            response: { status: 401, data: { code: 401, message: "unauthorized" } },
          });
        }
        return response(config, {
          code: 200,
          data: {
            id: "msg-1",
            conversationId: "conv-1",
            senderType: "user",
            contentType: "text",
            content: "\u90e8\u7f72",
            status: "done",
            artifacts: [],
            isPinned: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          message: "ok",
        });
      }
      throw new Error(`Unexpected request: ${config.url}`);
    };
    api.defaults.adapter = adapter;

    const result = await messageApi.send("conv-1", {
      content: "\u90e8\u7f72",
      mentions: [],
      mode: "auto_orchestrate",
    });

    expect(result.data.data.id).toBe("msg-1");
    expect(messageAttempts).toBe(2);
    expect(seenAuthHeaders).toEqual(["Bearer expired-token", "Bearer fresh-token"]);
    expect(localStorage.getItem("token")).toBe("fresh-token");
  });
});
