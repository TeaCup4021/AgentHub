import type { AxiosInstance } from "axios";
import { mockConversations, mockMessages, mockAgents } from "./data";
import { generateId } from "@/lib/utils";
import type {
  CreateConversationRequest,
  UpdateConversationRequest,
  CreateAgentRequest,
  Conversation,
  Message,
  Agent,
} from "@/types";

function delay(ms = 300): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function ok<T>(data: T) {
  return { code: 0, data, message: "ok" };
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
    conv.lastMessage = message.content.find((c) => c.type === "text")?.text?.slice(0, 50) || "";
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
      config.adapter = () =>
        Promise.resolve({ data: ok(conversations), status: 200, statusText: "OK", headers: {}, config });
    }

    // POST /conversations
    else if (method === "post" && url === "/conversations") {
      const body = parseBody(config) as unknown as CreateConversationRequest;
      await delay();
      const conv: Conversation = {
        id: `conv-${generateId()}`,
        title: body.title,
        type: body.type,
        agentIds: body.agentIds,
        lastActiveAt: new Date().toISOString(),
        isPinned: false,
        isArchived: false,
        createdAt: new Date().toISOString(),
      };
      conversations.unshift(conv);
      config.adapter = () =>
        Promise.resolve({ data: ok(conv), status: 201, statusText: "Created", headers: {}, config });
    }

    // GET /conversations/:id
    else if (method === "get" && /^\/conversations\/[^/]+$/.test(url)) {
      const id = url.split("/").pop()!;
      await delay();
      const conv = conversations.find((c) => c.id === id);
      config.adapter = () =>
        conv
          ? Promise.resolve({ data: ok(conv), status: 200, statusText: "OK", headers: {}, config })
          : Promise.reject({ response: { status: 404, data: { code: 404, message: "未找到" } } });
    }

    // PATCH /conversations/:id
    else if (method === "patch" && /^\/conversations\/[^/]+$/.test(url)) {
      const id = url.split("/").pop()!;
      const body = parseBody(config) as unknown as UpdateConversationRequest;
      await delay();
      const idx = conversations.findIndex((c) => c.id === id);
      if (idx >= 0) {
        conversations[idx] = { ...conversations[idx], ...body };
        config.adapter = () =>
          Promise.resolve({ data: ok(conversations[idx]), status: 200, statusText: "OK", headers: {}, config });
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
      config.adapter = () =>
        Promise.resolve({ data: ok(null), status: 200, statusText: "OK", headers: {}, config });
    }

    // POST /conversations/:id/messages
    else if (method === "post" && /^\/conversations\/[^/]+\/messages$/.test(url)) {
      const conversationId = url.split("/")[2];
      const body = parseBody(config) as unknown as { content: string };
      await delay();
      const userMsg: Message = {
        id: `msg-${generateId()}`,
        conversationId,
        role: "user",
        content: [{ type: "text", text: body.content }],
        status: "done",
        createdAt: new Date().toISOString(),
      };
      if (!messages[conversationId]) messages[conversationId] = [];
      messages[conversationId].push(userMsg);
      const conv = conversations.find((c) => c.id === conversationId);
      if (conv) {
        conv.lastMessage = body.content;
        conv.lastActiveAt = new Date().toISOString();
      }
      config.adapter = () =>
        Promise.resolve({ data: ok(userMsg), status: 201, statusText: "Created", headers: {}, config });
    }

    // GET /conversations/:id/messages
    else if (method === "get" && /^\/conversations\/[^/]+\/messages$/.test(url)) {
      const conversationId = url.split("/")[2];
      await delay();
      const msgs = messages[conversationId] || [];
      config.adapter = () =>
        Promise.resolve({ data: ok(msgs), status: 200, statusText: "OK", headers: {}, config });
    }

    // GET /agents
    else if (method === "get" && url === "/agents") {
      await delay();
      config.adapter = () =>
        Promise.resolve({ data: ok(agents), status: 200, statusText: "OK", headers: {}, config });
    }

    // POST /agents
    else if (method === "post" && url === "/agents") {
      const body = parseBody(config) as unknown as CreateAgentRequest;
      await delay();
      const agent: Agent = {
        id: `agent-${generateId()}`,
        name: body.name,
        avatar: body.avatar,
        provider: "custom",
        capabilities: [],
        systemPrompt: body.systemPrompt,
        tools: body.tools.map((t) => ({ name: t, description: "" })),
        createdAt: new Date().toISOString(),
      };
      agents.push(agent);
      config.adapter = () =>
        Promise.resolve({ data: ok(agent), status: 201, statusText: "Created", headers: {}, config });
    }

    return config;
  });

  return () => api.interceptors.request.eject(interceptor);
}
