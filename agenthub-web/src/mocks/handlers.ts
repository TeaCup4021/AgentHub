import type { AxiosInstance } from "axios";
import { mockConversations, mockMessages, mockAgents, mockProjects } from "./data";
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
  PlanSubtask,
} from "@/types";

let _orchestratorPhase: "idle" | "planning" | "executing" = "idle";
let _orchestratorPlan: PlanSubtask[] = [];

export function getOrchestratorPhase() {
  return _orchestratorPhase;
}

export function setOrchestratorPhase(phase: "idle" | "planning" | "executing") {
  _orchestratorPhase = phase;
}

export function getOrchestratorPlan(): PlanSubtask[] {
  return _orchestratorPlan;
}

function generatePlan(agentIds: string[]): PlanSubtask[] {
  const allAgents = [...mockAgents, ...agents];
  const available = agentIds
    .map((id) => allAgents.find((a) => a.id === id))
    .filter(Boolean) as Agent[];
  if (available.length === 0) {
    available.push(mockAgents[0]);
  }
  return available.map((agent, i) => ({
    subtask_id: `sub-${generateId()}`,
    agent: { id: agent.id, name: agent.name },
    instruction: available.length === 1
      ? "分析需求并生成方案"
      : i === 0
        ? "分析需求并制定执行方案"
        : i === available.length - 1
          ? "审查输出结果并汇总报告"
          : `实现第 ${i} 部分功能模块`,
    priority: i + 1,
  }));
}

function delay(ms = 50): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function shouldFail(endpoint: string): string | null {
  const mode = sessionStorage.getItem("mock_fail_mode");
  if (mode === endpoint || mode === "all") {
    const rawCount = sessionStorage.getItem("mock_fail_count");
    const count = rawCount ? parseInt(rawCount, 10) : 1;
    if (count > 1) {
      sessionStorage.setItem("mock_fail_count", String(count - 1));
    } else {
      sessionStorage.removeItem("mock_fail_mode");
      sessionStorage.removeItem("mock_fail_count");
    }
    return mode;
  }
  return null;
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
let projects = [...mockProjects];
const messages: Record<string, Message[]> = { ...mockMessages };

const mockUser = {
  id: "user-mock-1",
  email: "test@agenthub.dev",
  name: "测试用户",
  password: "123456",
  avatarUrl: null as string | null,
  isVerified: true,
};
let registeredUsers: Array<typeof mockUser> = [{ ...mockUser }];
const authCodes: Map<string, { code: string; expires: number }> = new Map();

function makeToken(): { accessToken: string; refreshToken: string; expiresIn: number } {
  return {
    accessToken: `mock-ak-${generateId()}`,
    refreshToken: `mock-rk-${generateId()}`,
    expiresIn: 1800,
  };
}

export function getMockAgents(): Agent[] {
  return agents;
}

export function getLastUserMessage(conversationId: string): { content: string } | null {
  const msgs = messages[conversationId];
  if (!msgs || msgs.length === 0) return null;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].senderType === "user") return { content: msgs[i].content };
  }
  return null;
}

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
  projects = JSON.parse(JSON.stringify(mockProjects));
  registeredUsers = [{ ...mockUser }];
  authCodes.clear();
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
      const params = (config.params as { keyword?: string; projectId?: string; page?: number; pageSize?: number }) || {};
      let filtered = conversations;
      if (params.projectId) {
        filtered = filtered.filter((c) => c.projectId === params.projectId);
      }
      if (params.keyword) {
        const kw = params.keyword.toLowerCase();
        filtered = filtered.filter((c) => c.title.toLowerCase().includes(kw));
      }
      const [status, body] = paginatedResponse(filtered, params.page, params.pageSize);
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
        projectId: body.projectId,
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
      if (shouldFail("delete")) {
        config.adapter = () =>
          Promise.reject({ response: { status: 500, data: { code: 500, message: "模拟删除失败" } } });
        return config;
      }
      conversations = conversations.filter((c) => c.id !== id);
      const [, responseBody] = successResponse(null);
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // POST /conversations/:id/messages
    else if (method === "post" && /^\/conversations\/[^/]+\/messages$/.test(url)) {
      const conversationId = url.split("/")[2];
      if (shouldFail("message")) {
        await delay();
        config.adapter = () =>
          Promise.reject({ response: { status: 500, data: { code: 500, message: "模拟发送失败" } } });
        return config;
      }
      const body = parseBody(config) as unknown as {
        content: string;
        contentType?: string;
        parentMessageId?: string;
        mode?: "auto_orchestrate" | "direct" | "refine_plan" | "confirm_plan";
        plan_id?: string;
        plan?: { subtask_id: string; agent_id: string; instruction: string }[];
        plannerAgentId?: string;
      };
      await delay();
      const now = new Date().toISOString();
      const conv = conversations.find((c) => c.id === conversationId);
      const isGroup = conv?.type === "group";

      if (body.mode === "confirm_plan") {
        _orchestratorPhase = "executing";
        _orchestratorPlan = (body.plan || []).map((item) => ({
          subtask_id: item.subtask_id,
          agent: {
            id: item.agent_id,
            name: agents.find((a) => a.id === item.agent_id)?.name || mockAgents.find((a) => a.id === item.agent_id)?.name || "Agent",
          },
          instruction: item.instruction,
          priority: 0,
        }));
        const userMsg: Message = {
          id: `msg-${generateId()}`,
          conversationId,
          senderType: "user",
          senderId: "user-1",
          senderName: "我",
          contentType: "text",
          content: body.content || "确认执行计划",
          artifacts: [],
          status: "done",
          meta: null,
          createdAt: now,
          updatedAt: now,
        };
        if (!messages[conversationId]) messages[conversationId] = [];
        messages[conversationId].push(userMsg);
        if (conv) conv.lastActiveAt = now;
        const [, responseBody] = successResponse(userMsg);
        config.adapter = () =>
          Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
        return config;
      }

      if (body.mode === "refine_plan") {
        _orchestratorPhase = "planning";
        const refinedPlan = _orchestratorPlan.length > 0
          ? _orchestratorPlan.map((t, i) => ({
              ...t,
              agent: { ...t.agent },
              instruction: i === _orchestratorPlan.length - 1
                ? `${t.instruction}（根据反馈调整：${body.content}）`
                : t.instruction,
            }))
          : generatePlan(conv?.agentIds || []);
        _orchestratorPlan = refinedPlan;
        const userMsg: Message = {
          id: `msg-${generateId()}`,
          conversationId,
          senderType: "user",
          senderId: "user-1",
          senderName: "我",
          contentType: "text",
          content: body.content,
          artifacts: [],
          status: "done",
          meta: null,
          createdAt: now,
          updatedAt: now,
        };
        if (!messages[conversationId]) messages[conversationId] = [];
        messages[conversationId].push(userMsg);
        if (conv) conv.lastActiveAt = now;
        const [, responseBody] = successResponse(userMsg);
        config.adapter = () =>
          Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
        return config;
      }

      if (isGroup && body.mode === "auto_orchestrate") {
        _orchestratorPhase = "planning";
        _orchestratorPlan = generatePlan(conv?.agentIds || []);
      }

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
      const params = (config.params as { cursor?: string; limit?: number; senderType?: string; senderId?: string }) || {};
      const cursor = params.cursor;
      const limit = params.limit || 50;
      let msgs = messages[conversationId] || [];

      if (params.senderType) {
        msgs = msgs.filter((m) => m.senderType === params.senderType);
      }
      if (params.senderId) {
        msgs = msgs.filter((m) => m.senderId === params.senderId);
      }
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

    // GET /orchestrator/tasks/:taskId/dag
    if (method === "get" && /^\/orchestrator\/tasks\/[^/]+\/dag$/.test(url)) {
      await delay();
      const [, responseBody] = successResponse({
        taskId: url.split("/")[3],
        status: "completed",
        nodes: [
          { subtaskId: "s1", agentId: "agent-claude-code", agentName: "Claude Code", instruction: "实现登录页面", status: "completed", latencyMs: 3200, outputMessageId: "msg-2" },
          { subtaskId: "s2", agentId: "agent-codex", agentName: "Codex", instruction: "添加表单验证", status: "completed", latencyMs: 2100, outputMessageId: "msg-5" },
          { subtaskId: "s3", agentId: "agent-opencode", agentName: "OpenCode", instruction: "代码审查", status: "completed", latencyMs: 1800 },
        ],
        edges: [
          { from: "s1", to: "s3" },
          { from: "s2", to: "s3" },
        ],
      });
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // GET /agents/capabilities
    if (method === "get" && url === "/agents/capabilities") {
      await delay();
      const caps = ["coding", "review", "refactoring", "debugging", "docs", "ui", "testing", "reasoning", "planning"];
      const [, responseBody] = successResponse(caps);
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

    // DELETE /agents/:id
    else if (method === "delete" && /^\/agents\/[^/]+$/.test(url)) {
      const id = url.split("/").pop()!;
      await delay();
      agents = agents.filter((a) => a.id !== id);
      const [, responseBody] = successResponse(null);
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // POST /auth/send-code
    if (method === "post" && url === "/auth/send-code") {
      await delay(300);
      const body = parseBody(config) as unknown as { email: string };
      const code = String(Math.floor(100000 + Math.random() * 900000));
      authCodes.set(body.email, { code, expires: Date.now() + 600000 });
      const [, responseBody] = successResponse({ status: "ok", message: "验证码已发送" });
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // POST /auth/register
    else if (method === "post" && url === "/auth/register") {
      await delay(200);
      const body = parseBody(config) as unknown as { email: string; code: string; name: string; password: string };
      const saved = authCodes.get(body.email);
      if (!saved || saved.code !== body.code || saved.expires < Date.now()) {
        config.adapter = () =>
          Promise.reject({ response: { status: 400, data: { code: 400, message: "验证码错误或已过期" } } });
        return config;
      }
      if (registeredUsers.find((u) => u.email === body.email)) {
        config.adapter = () =>
          Promise.reject({ response: { status: 409, data: { code: 409, message: "邮箱已注册" } } });
        return config;
      }
      const user = {
        id: `user-${generateId()}`,
        email: body.email,
        name: body.name,
        password: body.password,
        avatarUrl: null as string | null,
        isVerified: false,
      };
      registeredUsers.push(user);
      authCodes.delete(body.email);
      const tokens = makeToken();
      const [, responseBody] = successResponse({ ...tokens, tokenType: "bearer" });
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 201, statusText: "OK", headers: {}, config });
    }

    // POST /auth/login
    else if (method === "post" && url === "/auth/login") {
      await delay(200);
      const body = parseBody(config) as unknown as { email: string; password: string };
      const user = registeredUsers.find((u) => u.email === body.email && u.password === body.password);
      if (!user) {
        config.adapter = () =>
          Promise.reject({ response: { status: 401, data: { code: 401, message: "邮箱或密码错误" } } });
        return config;
      }
      const tokens = makeToken();
      const [, responseBody] = successResponse({ ...tokens, tokenType: "bearer" });
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // POST /auth/refresh
    else if (method === "post" && url === "/auth/refresh") {
      await delay(100);
      const tokens = makeToken();
      const [, responseBody] = successResponse({ ...tokens, tokenType: "bearer" });
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // PATCH /auth/me
    if (method === "patch" && url === "/auth/me") {
      await delay(100);
      const body = parseBody(config) as unknown as { name?: string; avatarUrl?: string };
      const user = registeredUsers[registeredUsers.length - 1];
      if (body.name) user.name = body.name;
      if (body.avatarUrl !== undefined) user.avatarUrl = body.avatarUrl;
      const [, responseBody] = successResponse({
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        isVerified: user.isVerified,
      });
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // GET /auth/me
    else if (method === "get" && url === "/auth/me") {
      await delay(100);
      const authHeader = (config.headers as Record<string, string>)?.Authorization;
      if (!authHeader?.startsWith("Bearer mock-ak-")) {
        const user = registeredUsers[registeredUsers.length - 1];
        const [, responseBody] = successResponse({
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          isVerified: user.isVerified,
        });
        config.adapter = () =>
          Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
      } else {
        const [, responseBody] = successResponse({
          id: mockUser.id,
          email: mockUser.email,
          name: mockUser.name,
          avatarUrl: mockUser.avatarUrl,
          isVerified: mockUser.isVerified,
        });
        config.adapter = () =>
          Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
      }
    }

    // PATCH /auth/password
    else if (method === "patch" && url === "/auth/password") {
      await delay();
      const body = parseBody(config) as unknown as { old_password: string; new_password: string };
      if (body.old_password === body.new_password) {
        config.adapter = () =>
          Promise.reject({ response: { status: 400, data: { code: 400, message: "新密码不能与旧密码相同" } } });
        return config;
      }
      const [, responseBody] = successResponse({ status: "ok", message: "密码已修改" });
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // GET /projects
    if (method === "get" && url === "/projects") {
      await delay();
      const sorted = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const [, responseBody] = successResponse(sorted);
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // GET /projects/:id
    else if (method === "get" && /^\/projects\/[^/]+$/.test(url)) {
      const id = url.split("/").pop()!;
      await delay();
      const project = projects.find((p) => p.id === id);
      if (project) {
        const [, responseBody] = successResponse(project);
        config.adapter = () =>
          Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
      } else {
        config.adapter = () =>
          Promise.reject({ response: { status: 404, data: { code: 404, message: "项目不存在" } } });
      }
    }

    // POST /projects
    else if (method === "post" && url === "/projects") {
      const body = parseBody(config) as unknown as { name: string; description?: string; defaultAgentIds?: string[] };
      await delay();
      const now = new Date().toISOString();
      const project = {
        id: `proj-${generateId()}`,
        name: body.name,
        description: body.description,
        ownerId: "00000000-0000-0000-0000-000000000001",
        defaultAgentIds: body.defaultAgentIds || [],
        conversationCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      projects.push(project);
      const [, responseBody] = successResponse(project);
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 201, statusText: "OK", headers: {}, config });
    }

    // PATCH /projects/:id
    else if (method === "patch" && /^\/projects\/[^/]+$/.test(url)) {
      const id = url.split("/").pop()!;
      const body = parseBody(config) as unknown as { name?: string; description?: string; defaultAgentIds?: string[] };
      await delay();
      const idx = projects.findIndex((p) => p.id === id);
      if (idx >= 0) {
        projects[idx] = { ...projects[idx], ...body, updatedAt: new Date().toISOString() };
        const [, responseBody] = successResponse(projects[idx]);
        config.adapter = () =>
          Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
      } else {
        config.adapter = () =>
          Promise.reject({ response: { status: 404, data: { code: 404, message: "项目不存在" } } });
      }
    }

    // DELETE /projects/:id
    else if (method === "delete" && /^\/projects\/[^/]+$/.test(url)) {
      const id = url.split("/").pop()!;
      await delay();
      projects = projects.filter((p) => p.id !== id);
      const [, responseBody] = successResponse(null);
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 204, statusText: "OK", headers: {}, config });
    }

    // POST /agents
    else if (method === "post" && url === "/agents") {
      const body = parseBody(config) as unknown as CreateAgentRequest;
      if (shouldFail("agent")) {
        await delay();
        config.adapter = () =>
          Promise.reject({ response: { status: 500, data: { code: 500, message: "模拟创建失败" } } });
        return config;
      }
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
        baseUrl: body.baseUrl || "",
        apiKey: body.apiKey || "",
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

    // POST /agents/verify
    else if (method === "post" && url === "/agents/verify") {
      await delay();
      const [, responseBody] = successResponse({ status: "ok", message: "验证通过" });
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // GET /messages/:id/artifacts
    else if (method === "get" && /^\/messages\/[^/]+\/artifacts$/.test(url)) {
      await delay();
      const [, responseBody] = successResponse([]);
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // POST /messages/:id/regenerate
    else if (method === "post" && /^\/messages\/[^/]+\/regenerate$/.test(url)) {
      const messageId = url.split("/")[2];
      await delay();
      const [, responseBody] = successResponse({ message_id: messageId, status: "regenerated" });
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // POST /conversations/:id/pins
    else if (method === "post" && /^\/conversations\/[^/]+\/pins$/.test(url)) {
      await delay();
      const [, responseBody] = successResponse({ status: "pinned" });
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // DELETE /conversations/:id/pins/:messageId
    else if (method === "delete" && /^\/conversations\/[^/]+\/pins\/[^/]+$/.test(url)) {
      await delay();
      const [, responseBody] = successResponse(null);
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // GET /conversations/:id/pins
    else if (method === "get" && /^\/conversations\/[^/]+\/pins$/.test(url)) {
      await delay();
      const convId = url.split("/")[2];
      const msgs = messages[convId] || [];
      const pinned = msgs.slice(0, 2).map((m) => ({
        messageId: m.id,
        conversationId: m.conversationId,
        content: m.content.slice(0, 100),
        senderName: m.senderName || "Agent",
        createdAt: m.createdAt,
      }));
      const [, responseBody] = successResponse(pinned);
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // POST /files/upload
    else if (method === "post" && url === "/files/upload") {
      await delay(200);
      const fileId = `file-${generateId()}`;
      const [, responseBody] = successResponse({
        id: fileId,
        url: `https://picsum.photos/800/600?random=${Date.now()}`,
        filename: "uploaded-file",
        size: 123456,
        mime_type: "image/png",
        width: 800,
        height: 600,
      });
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // GET /files/:id
    else if (method === "get" && /^\/files\/[^/]+$/.test(url) && !url.includes("/content") && !url.includes("/apply-diff")) {
      await delay();
      const [, responseBody] = successResponse({
        url: `https://picsum.photos/800/600?random=${Date.now()}`,
        fileName: "file.png",
        mimeType: "image/png",
      });
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    // PUT /files/:id/content (for Monaco editor)
    else if (method === "put" && /^\/files\/[^/]+\/content$/.test(url)) {
      await delay();
      const [, responseBody] = successResponse({ status: "updated" });
      config.adapter = () =>
        Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
    }

    return config;
  });

  return () => api.interceptors.request.eject(interceptor);
}
