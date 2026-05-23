import type { Conversation, Message, Agent } from "@/types";

export const mockAgents: Agent[] = [
  {
    id: "agent-claude-code",
    name: "Claude Code",
    avatar: "",
    provider: "claude-code",
    capabilities: ["代码生成", "代码审查", "重构", "调试"],
    tools: [
      { name: "read_file", description: "读取文件内容" },
      { name: "write_file", description: "写入文件" },
      { name: "execute_command", description: "执行命令" },
    ],
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
  {
    id: "agent-codex",
    name: "Codex",
    avatar: "",
    provider: "codex",
    capabilities: ["代码生成", "代码补全", "文档生成"],
    tools: [
      { name: "read_file", description: "读取文件内容" },
      { name: "write_file", description: "写入文件" },
    ],
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: "agent-opencode",
    name: "OpenCode",
    avatar: "",
    provider: "opencode",
    capabilities: ["代码生成", "SQL 编写", "架构设计"],
    tools: [
      { name: "read_file", description: "读取文件内容" },
      { name: "write_file", description: "写入文件" },
      { name: "execute_command", description: "执行命令" },
    ],
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
];

export const mockConversations: Conversation[] = [
  {
    id: "conv-1",
    title: "用 React 写一个登录页面",
    type: "single",
    agentIds: ["agent-claude-code"],
    lastMessage: "好的，我已经创建了登录页面组件，包含表单验证和错误处理。",
    lastActiveAt: new Date(Date.now() - 5 * 60000).toISOString(),
    isPinned: true,
    isArchived: false,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "conv-2",
    title: "重构 API 中间件",
    type: "group",
    agentIds: ["agent-claude-code", "agent-codex"],
    lastMessage: "Codex: 已审查代码，发现 3 处潜在性能问题。",
    lastActiveAt: new Date(Date.now() - 30 * 60000).toISOString(),
    isPinned: false,
    isArchived: false,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: "conv-3",
    title: "设计数据库 Schema",
    type: "single",
    agentIds: ["agent-opencode"],
    lastMessage: "这是完整的 PostgreSQL schema，包含索引优化建议。",
    lastActiveAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    isPinned: false,
    isArchived: false,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

export const mockMessages: Record<string, Message[]> = {
  "conv-1": [
    {
      id: "msg-1-1",
      conversationId: "conv-1",
      role: "user",
      content: [{ type: "text", text: "帮我用 React 写一个登录页面，需要邮箱和密码输入，加上表单验证。" }],
      status: "done",
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "msg-1-2",
      conversationId: "conv-1",
      role: "agent",
      agentId: "agent-claude-code",
      agentName: "Claude Code",
      content: [
        { type: "text", text: "好的，我来创建一个完整的登录页面组件。\n\n这个组件包含：\n- 邮箱 / 密码输入\n- 客户端表单验证\n- 错误提示\n- 加载状态\n- 响应式设计" },
        {
          type: "code",
          language: "tsx",
          fileName: "LoginPage.tsx",
          code: `import { useState, FormEvent } from "react";\n\ninterface LoginForm {\n  email: string;\n  password: string;\n}\n\ninterface FormErrors {\n  email?: string;\n  password?: string;\n}\n\nexport function LoginPage() {\n  const [form, setForm] = useState<LoginForm>({ email: "", password: "" });\n  const [errors, setErrors] = useState<FormErrors>({});\n  const [loading, setLoading] = useState(false);\n\n  const validate = (): boolean => {\n    const newErrors: FormErrors = {};\n    if (!form.email) newErrors.email = "请输入邮箱";\n    else if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(form.email)) newErrors.email = "邮箱格式不正确";\n    if (!form.password) newErrors.password = "请输入密码";\n    else if (form.password.length < 6) newErrors.password = "密码至少 6 位";\n    setErrors(newErrors);\n    return Object.keys(newErrors).length === 0;\n  };\n\n  const handleSubmit = async (e: FormEvent) => {\n    e.preventDefault();\n    if (!validate()) return;\n    setLoading(true);\n    // TODO: 调用登录 API\n    await new Promise((r) => setTimeout(r, 1000));\n    setLoading(false);\n  };\n\n  return (\n    <div className="flex min-h-screen items-center justify-center bg-gray-50">\n      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">\n        <h1 className="mb-6 text-2xl font-bold text-gray-900">登录</h1>\n        <div className="mb-4">\n          <label className="mb-1 block text-sm font-medium text-gray-700">邮箱</label>\n          <input\n            type="email" value={form.email}\n            onChange={(e) => setForm({ ...form, email: e.target.value })}\n            className={\`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 \${\n              errors.email ? "border-red-500" : "border-gray-300"\n            }\`}\n            placeholder="name@example.com"\n          />\n          {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}\n        </div>\n        <div className="mb-6">\n          <label className="mb-1 block text-sm font-medium text-gray-700">密码</label>\n          <input\n            type="password" value={form.password}\n            onChange={(e) => setForm({ ...form, password: e.target.value })}\n            className={\`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 \${\n              errors.password ? "border-red-500" : "border-gray-300"\n            }\`}\n            placeholder="至少 6 位密码"\n          />\n          {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}\n        </div>\n        <button\n          type="submit" disabled={loading}\n          className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"\n        >\n          {loading ? "登录中..." : "登录"}\n        </button>\n      </form>\n    </div>\n  );\n}`,
        },
      ],
      status: "done",
      createdAt: new Date(Date.now() - 3000000).toISOString(),
    },
  ],
  "conv-2": [
    {
      id: "msg-2-1",
      conversationId: "conv-2",
      role: "user",
      content: [{ type: "text", text: "帮我审查一下 API 中间件的代码，看看有没有性能问题。" }],
      status: "done",
      createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: "msg-2-2",
      conversationId: "conv-2",
      role: "agent",
      agentId: "agent-claude-code",
      agentName: "Claude Code",
      content: [
        { type: "text", text: "我来分析一下当前的 API 中间件代码。" },
        {
          type: "code",
          language: "typescript",
          fileName: "middleware.ts",
          code: `import { NextFunction, Request, Response } from "express";\n\nconst rateLimitMap = new Map<string, number[]>();\n\nexport function rateLimiter(maxRequests: number, windowMs: number) {\n  return (req: Request, res: Response, next: NextFunction) => {\n    const ip = req.ip || "unknown";\n    const now = Date.now();\n    const windowStart = now - windowMs;\n\n    const timestamps = rateLimitMap.get(ip) || [];\n    const recent = timestamps.filter((t) => t > windowStart);\n\n    if (recent.length >= maxRequests) {\n      return res.status(429).json({ error: "请求过于频繁" });\n    }\n\n    recent.push(now);\n    rateLimitMap.set(ip, recent);\n    next();\n  };\n}`,
        },
      ],
      status: "done",
      createdAt: new Date(Date.now() - 6000000).toISOString(),
    },
    {
      id: "msg-2-3",
      conversationId: "conv-2",
      role: "agent",
      agentId: "agent-codex",
      agentName: "Codex",
      content: [
        { type: "text", text: "审查完成，发现以下问题：\n\n1. **内存泄漏风险**：`rateLimitMap` 无过期清理机制，长时间运行会持续增长\n2. **竞态条件**：Node.js 单线程但异步操作间 map 状态可能不一致\n3. **类型安全**：`req.ip` 可能为 undefined" },
        {
          type: "diff",
          language: "typescript",
          fileName: "middleware.ts",
          oldCode: `const rateLimitMap = new Map<string, number[]>();\n\nexport function rateLimiter(maxRequests: number, windowMs: number) {\n  return (req: Request, res: Response, next: NextFunction) => {\n    const ip = req.ip || "unknown";\n    const now = Date.now();\n    const windowStart = now - windowMs;\n    const timestamps = rateLimitMap.get(ip) || [];\n    const recent = timestamps.filter((t) => t > windowStart);\n    if (recent.length >= maxRequests) {\n      return res.status(429).json({ error: "请求过于频繁" });\n    }\n    recent.push(now);\n    rateLimitMap.set(ip, recent);\n    next();\n  };\n}`,
          newCode: `const rateLimitMap = new Map<string, number[]>();\n\n// 每 5 分钟清理过期条目\nsetInterval(() => {\n  const now = Date.now();\n  for (const [key, timestamps] of rateLimitMap) {\n    const valid = timestamps.filter((t) => t > now - 600000);\n    if (valid.length === 0) rateLimitMap.delete(key);\n    else rateLimitMap.set(key, valid);\n  }\n}, 300000);\n\nexport function rateLimiter(maxRequests: number, windowMs: number) {\n  return (req: Request, res: Response, next: NextFunction) => {\n    const ip = req.ip || "unknown";\n    const now = Date.now();\n    const timestamps = rateLimitMap.get(ip) || [];\n    const recent = timestamps.filter((t) => t > now - windowMs);\n    if (recent.length >= maxRequests) {\n      return res.status(429).json({ error: "请求过于频繁" });\n    }\n    recent.push(now);\n    rateLimitMap.set(ip, recent);\n    next();\n  };\n}`,
        },
      ],
      status: "done",
      createdAt: new Date(Date.now() - 5000000).toISOString(),
    },
  ],
  "conv-3": [
    {
      id: "msg-3-1",
      conversationId: "conv-3",
      role: "user",
      content: [{ type: "text", text: "帮我设计一个电商系统的数据库 Schema。" }],
      status: "done",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: "msg-3-2",
      conversationId: "conv-3",
      role: "agent",
      agentId: "agent-opencode",
      agentName: "OpenCode",
      content: [
        { type: "text", text: "以下是电商系统核心表的 PostgreSQL Schema：\n\n包含 users、products、orders、order_items 四张核心表，带索引优化。" },
        {
          type: "code",
          language: "sql",
          fileName: "schema.sql",
          code: `CREATE TABLE users (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  email VARCHAR(255) UNIQUE NOT NULL,\n  name VARCHAR(100) NOT NULL,\n  password_hash VARCHAR(255) NOT NULL,\n  role VARCHAR(20) DEFAULT 'customer',\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  updated_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nCREATE INDEX idx_users_email ON users(email);\n\nCREATE TABLE products (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  name VARCHAR(255) NOT NULL,\n  description TEXT,\n  price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),\n  stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),\n  category VARCHAR(100),\n  image_url TEXT,\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  updated_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nCREATE INDEX idx_products_category ON products(category);\nCREATE INDEX idx_products_price ON products(price);\n\nCREATE TABLE orders (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  user_id UUID NOT NULL REFERENCES users(id),\n  status VARCHAR(20) DEFAULT 'pending',\n  total_amount DECIMAL(12, 2) NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  updated_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nCREATE INDEX idx_orders_user_id ON orders(user_id);\nCREATE INDEX idx_orders_status ON orders(status);\n\nCREATE TABLE order_items (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,\n  product_id UUID NOT NULL REFERENCES products(id),\n  quantity INT NOT NULL CHECK (quantity > 0),\n  unit_price DECIMAL(10, 2) NOT NULL\n);\n\nCREATE INDEX idx_order_items_order_id ON order_items(order_id);`,
        },
      ],
      status: "done",
      createdAt: new Date(Date.now() - 86000000).toISOString(),
    },
  ],
};
