import type {
  SSEMessageStart,
  SSEToken,
  SSEArtifact,
  SSEAgentStatus,
  SSEThinking,
  SSEMessageEnd,
  SSEError,
} from "@/types";

export interface SSECallbacks {
  onMessageStart?: (data: SSEMessageStart) => void;
  onToken?: (data: SSEToken) => void;
  onArtifact?: (data: SSEArtifact) => void;
  onAgentStatus?: (data: SSEAgentStatus) => void;
  onThinking?: (data: SSEThinking) => void;
  onMessageEnd?: (data: SSEMessageEnd) => void;
  onError?: (data: SSEError) => void;
  onConnectionError?: (error: Event) => void;
}

type SSEFactory = (conversationId: string, callbacks: SSECallbacks) => () => void;

let mockSSE: SSEFactory | null = null;

export function setMockSSE(factory: SSEFactory | null) {
  mockSSE = factory;
}

export function createSSEStream(
  conversationId: string,
  callbacks: SSECallbacks,
  prompt?: string,
): () => void {
  if (mockSSE) return mockSSE(conversationId, callbacks);

  const controller = new AbortController();
  const token = localStorage.getItem("token");

  const eventHandlers: Record<string, (data: unknown) => void> = {
    message_start: (d) => callbacks.onMessageStart?.(d as SSEMessageStart),
    token: (d) => callbacks.onToken?.(d as SSEToken),
    artifact: (d) => callbacks.onArtifact?.(d as SSEArtifact),
    agent_status: (d) => callbacks.onAgentStatus?.(d as SSEAgentStatus),
    thinking: (d) => callbacks.onThinking?.(d as SSEThinking),
    message_end: (d) => callbacks.onMessageEnd?.(d as SSEMessageEnd),
    error: (d) => callbacks.onError?.(d as SSEError),
  };

  // [后端对接] SSE 流式端点，事件类型: message_start / token / artifact / agent_status / thinking / message_end / error
  const streamUrl = `/api/v1/conversations/${conversationId}/stream${prompt ? `?prompt=${encodeURIComponent(prompt)}` : ""}`;
  fetch(streamUrl, {
    headers: {
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok || !response.body) {
        throw new Error(`SSE 连接失败: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";
        let currentData = "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            currentData = line.slice(5).trim();
          } else if (line === "" && currentData) {
            const handler = eventHandlers[currentEvent || "message"];
            if (handler) {
              try {
                handler(JSON.parse(currentData));
              } catch {
                // 跳过 JSON 解析失败的事件
              }
            }
            currentEvent = "";
            currentData = "";
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onConnectionError?.(err);
      }
    });

  return () => controller.abort();
}
