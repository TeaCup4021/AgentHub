# AgentHub 前后端联调问题根因分析

> 日期: 2026-05-24

---

## 7 个问题的根因归类

### 类别 A：前后端契约缺失（3 个问题）

| # | 问题 | 根因 |
|---|------|------|
| 2 | 前端硬编码 `"agent-claude-code"` 不是 UUID | 前端用假 ID 独立开发，不知道后端 UUID 格式 |
| 5 | `avatarUrl: string` vs 后端 `null` | 前后端各自定义类型，没有统一来源 |
| 7 | `task_id` vs `message_id` 命名不一致 | SSE 事件结构前后端各自设计，缺少协议约定 |

**共同特征：** 前后端各写各的，没有一份共享的接口契约来约束双方。

### 类别 B：后端自测不完整（3 个问题）

| # | 问题 | 根因 |
|---|------|------|
| 1 | DELETE 返回 500（FK 约束违反） | Service 只删了 2 张表，漏了 6 张关联表，从未测试过"含消息的会话删除" |
| 4 | 422 响应 `message: "success"` | 中间件只考虑了 200 场景，4xx/5xx 走同一分支 |
| 6 | 422 格式与自定义异常不一致 | 只处理了 `AppException` 和 `HTTPException`，遗漏了 FastAPI 内置的 `RequestValidationError` |

**共同特征：** 只测了 happy path，没有覆盖错误场景和级联操作。

### 类别 C：开发残留（1 个问题）

| # | 问题 | 根因 |
|---|------|------|
| 3 | Mock SSE 每次发送假 error 事件 | 后端调试时把 error 事件写死在正常流里测前端错误处理，写完忘了删 |

---

## 为什么会发生？

```
┌─────────────────────────────────────────────────────────┐
│                    典型的分工开发流程                      │
│                                                         │
│   后端                         前端                      │
│   ┌──────────┐                ┌──────────┐              │
│   │ 定义 ORM │                │ 写 Mock  │              │
│   │ 写 CRUD  │                │ 写组件  │              │
│   │ 写路由   │                │ 写 Store │              │
│   │ curl 自测 │               │ Mock 自测│              │
│   └──────────┘                └──────────┘              │
│         │                           │                   │
│         └──────── 联调 ─────────────┘                   │
│                     │                                   │
│              问题集中爆发                                 │
└─────────────────────────────────────────────────────────┘
```

**本质原因**：前后端在两个独立闭环中开发，各自用 Mock 数据自测通过，直到联调才第一次真正交互。Mock 数据和真实 API 之间的差距就是 bug。

具体来说：

1. **后端用 curl 自测 → 不会测到前端传过来的 camelCase 字段映射问题**
2. **前端用 MSW 自测 → 不会测到后端 UUID 验证、FK 约束、错误响应格式问题**
3. **两边都认为"我的代码没问题" → 但交互边界没人管**

---

## 如何避免

### 短期（立即执行）

**1. API 文档即契约**

用 FastAPI 自带的 OpenAPI + Swagger 作为唯一真源。后端写完接口后，前端从 `http://localhost:8080/openapi.json` 获取所有类型定义。

可以用工具自动生成前端 TypeScript 类型（如 `openapi-typescript`），避免手写类型不一致：

```bash
npx openapi-typescript http://localhost:8080/openapi.json -o src/types/api.generated.ts
```

**2. 联调前跑集成测试**

在 CI 或本地用脚本模拟核心流程：

```bash
# 创建会话 → 发消息 → 删会话（验证级联删除）
curl -X POST /api/v1/conversations -d '{...}'  # 应返回 201
curl -X POST /api/v1/conversations/{id}/messages -d '{...}'  # 应返回 201
curl -X DELETE /api/v1/conversations/{id}  # 应返回 204，不是 500
```

**3. 错误场景 checklist**

每个接口写完后对照检查：

- [ ] 正常返回
- [ ] 资源不存在 → 404
- [ ] 参数格式错误 → 422（格式统一）
- [ ] 级联操作（删除/更新）→ 关联数据正确处理
- [ ] 认证失败 → 401

### 长期（架构层面）

**4. 共享类型包**

抽取一个 `shared/` 目录放前后端共享的类型定义，作为 npm 包 + pip 包分别引用：

```
shared/
  types/
    conversation.ts   ← Conversation, MessageCreate 等接口形状
    sse-events.ts     ← 所有 SSE 事件的精确类型
    api-responses.ts  ← 统一响应包装格式
```

前端 import 类型，后端用 Pydantic 从同一份 schema 生成。

**5. Mock 对齐机制**

Mock 数据的结构必须从真实 API schema 生成，不允许手写。后端的接口变更要同步更新前端 mock：

```typescript
// 不好：手写假数据
const fakeAgent = { id: "agent-claude-code", ... }

// 好：从 schema 生成
const fakeAgent = generateMock<Agent>(AgentSchema)
```

**6. 禁止在 Mock/测试代码中写死业务数据**

Mock SSE 流中的 error 事件、硬编码的 Agent ID、固定的测试文本——这些应该通过环境变量或配置控制，默认关闭：

```python
# 正确做法
if os.getenv("AGENTHUB_MOCK_ERROR", "0") == "1":
    events.append(("error", ...))
```

---

## 总结

| 根因类别 | 问题数 | 核心矛盾 |
|----------|--------|----------|
| 前后端契约缺失 | 3 | 各写各的类型，Mock 和数据不一致 |
| 后端自测不完整 | 3 | 只测 happy path，漏错误/级联场景 |
| 开发残留 | 1 | 调试代码未清理 |

**一句话：接口文档先行，集成测试兜底，Mock 和真实数据对齐。**
