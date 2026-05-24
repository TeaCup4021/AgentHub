import type { AxiosInstance } from "axios";
import { mockConversations, mockMessages, mockAgents } from "./data";
import { generateId } from "@/lib/utils";
import type {
  ApiResponse,
  PaginatedResponse,
  CreateConversationRequest,
  UpdateConversationRequest,
  CreateAgentRequest,
  Conversation,
  Message,
  Agent,
} from "@/types";

function delay(ms = 50): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function paginatedResponse<T>(list: T[], page = 1, pageSize = 20): [200, PaginatedResponse<T>] {
  return [200, { code: 200, data: { list: [...list], total: list.length, page, pageSize }, message: "success" }];
}

function successResponse<T>(data: T): [200, ApiResponse<T>] {
  return [200, { code: 200, data, message: "success" }];
}

function parseBody(config: { data?: unknown }): Record<string, unknown> {
  if (!config.data) return {};
  if (typeof config.data === "string") {
    try {
      return JSON.parse(config.data);
    } catch {
      return {};
    }
  }
  return config.data as Record<string, unknown>;
}

let conversations = [...mockConversations];
let agents = [...mockAgents];
const messages: Record<string, Message[]> = { ...mockMessages };

export function addMockMessage(conversationId: string, message: Message) {
  if (!messages[conversationId]) messages[conversationId] = [];
  messages[conversationId].push(message);
  const conv = conversations.find((c) => c.id === conversationId);
  if (conv) {
    conv.lastActiveAt = new Date().toISOString();
  }
}

function resetMockData() {
  conversations = JSON.parse(JSON.stringify(mockConversations));
  agents = JSON.parse(JSON.stringify(mockAgents));
  for (const key of Object.keys(messages)) {
    delete messages[key];
  }
  for (const key of Object.keys(mockMessages)) {
    messages[key] = JSON.parse(JSON.stringify(mockMessages[key]));
  }
}

export function setupMockHandlers(api: AxiosInstance): () => void {
  resetMockData();

  const interceptor = api.interceptors.request.use(async (config) => {
    const { method, url } = config;

    if (!url) return config;

    // GET /conversations
    if (method === "get" && url === "/conversations") {
      await delay();
      const [status, body] = paginatedResponse(conversations);
      config.adapter = () =>
        Promise.resolve({ data: body, status, statusText: "OK", headers: {}, config });
    }

    // POST /conversations
    else if (method === "post" && url === "/conversations") {
      const body = parseBody(config) as unknown as CreateConversationRequest;
      await delay();
      const now = new Date().toISOString();
      const conv: Conversation = {
        id: `conv-${generateId()}`,
        title: body.title,
        type: body.type,
        ownerId: "00000000-0000-0000-0000-000000000001",
        agentIds: body.agentIds,
        lastActiveAt: now,
        isPinned: false,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      };
      conversations.unshift(conv);
      const [, responseBody] = successResponse(conv);
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // GET /conversations/:id
    else if (method === "get" && /^\/conversations\/[^/]+$/.test(url)) {
      const id = url.split("/").pop()!;
      await delay();
      const conv = conversations.find((c) => c.id === id);
      if (conv) {
        const [, responseBody] = successResponse(conv);
        config.adapter = () =>
          Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
      } else {
        config.adapter = () =>
          Promise.reject({ response: { status: 404, data: { code: 404, message: "未找到" } } });
      }
    }

    // PATCH /conversations/:id
    else if (method === "patch" && /^\/conversations\/[^/]+$/.test(url)) {
      const id = url.split("/").pop()!;
      const body = parseBody(config) as unknown as UpdateConversationRequest;
      await delay();
      const idx = conversations.findIndex((c) => c.id === id);
      if (idx >= 0) {
        conversations[idx] = { ...conversations[idx], ...body, updatedAt: new Date().toISOString() };
        const [, responseBody] = successResponse(conversations[idx]);
        config.adapter = () =>
          Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
      } else {
        config.adapter = () =>
          Promise.reject({ response: { status: 404, data: { code: 404, message: "未找到" } } });
      }
    }

    // DELETE /conversations/:id
    else if (method === "delete" && /^\/conversations\/[^/]+$/.test(url)) {
      const id = url.split("/").pop()!;
      await delay();
      conversations = conversations.filter((c) => c.id !== id);
      const [, responseBody] = successResponse(null);
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // POST /conversations/:id/messages
    else if (method === "post" && /^\/conversations\/[^/]+\/messages$/.test(url)) {
      const conversationId = url.split("/")[2];
      const body = parseBody(config) as unknown as { content: string; contentType?: string; parentMessageId?: string };
      await delay();
      const now = new Date().toISOString();
      const userMsg: Message = {
        id: `msg-${generateId()}`,
        conversationId,
        senderType: "user",
        senderId: "user-1",
        senderName: "我",
        contentType: body.contentType || "text",
        content: body.content,
        parentMessageId: body.parentMessageId,
        artifacts: [],
        status: "done",
        meta: null,
        createdAt: now,
        updatedAt: now,
      };
      if (!messages[conversationId]) messages[conversationId] = [];
      messages[conversationId].push(userMsg);
      const conv = conversations.find((c) => c.id === conversationId);
      if (conv) {
        conv.lastActiveAt = now;
      }
      const [, responseBody] = successResponse(userMsg);
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // GET /conversations/:id/messages (cursor-based pagination)
    else if (method === "get" && /^\/conversations\/[^/]+\/messages$/.test(url)) {
      const conversationId = url.split("/")[2];
      await delay();
      const params = (config.params as { cursor?: string; limit?: number }) || {};
      const cursor = params.cursor;
      const limit = params.limit || 50;
      let msgs = messages[conversationId] || [];

      if (cursor) {
        msgs = msgs.filter((m) => m.createdAt < cursor);
      }
      msgs = [...msgs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const hasMore = msgs.length > limit;
      const items = msgs.slice(0, limit);
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt : null;

      const [, responseBody] = successResponse({ items, nextCursor, hasMore });
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // GET /agents
    else if (method === "get" && url === "/agents") {
      await delay();
      const [, responseBody] = successResponse(agents);
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // GET /agents/:id
    else if (method === "get" && /^\/agents\/[^/]+$/.test(url)) {
      const id = url.split("/").pop()!;
      await delay();
      const agent = agents.find((a) => a.id === id);
      if (agent) {
        const [, responseBody] = successResponse(agent);
        config.adapter = () =>
          Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
      } else {
        config.adapter = () =>
          Promise.reject({ response: { status: 404, data: { code: 404, message: "Agent not found" } } });
      }
    }

    // PATCH /agents/:id
    else if (method === "patch" && /^\/agents\/[^/]+$/.test(url)) {
      const id = url.split("/").pop()!;
      const body = parseBody(config) as unknown as { name?: string; provider?: string; model?: string; systemPrompt?: string };
      await delay();
      const idx = agents.findIndex((a) => a.id === id);
      if (idx >= 0) {
        agents[idx] = { ...agents[idx], ...body, updatedAt: new Date().toISOString() };
        const [, responseBody] = successResponse(agents[idx]);
        config.adapter = () =>
          Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
      } else {
        config.adapter = () =>
          Promise.reject({ response: { status: 404, data: { code: 404, message: "Agent not found" } } });
      }
    }

    // POST /agents
    else if (method === "post" && url === "/agents") {
      const body = parseBody(config) as unknown as CreateAgentRequest;
      await delay();
      const now = new Date().toISOString();
      const agent: Agent = {
        id: `agent-${generateId()}`,
        name: body.name,
        avatarUrl: body.avatarUrl || "",
        provider: body.provider,
        model: body.model,
        capabilities: body.capabilities || [],
        systemPrompt: body.systemPrompt,
        toolConfig: body.toolConfig || {},
        isBuiltin: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      agents.push(agent);
      const [, responseBody] = successResponse(agent);
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    return config;
  });

  return () => api.interceptors.request.eject(interceptor);
}
