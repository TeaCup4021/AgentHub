# 代码编辑器与 Diff 应用 — 前后端 API 协定

日期：2026-06-02 | 状态：前端待后端实现

---

## 背景

课题要求：
1. "全屏预览 / 代码编辑器" — 产物代码需要可编辑
2. "一键应用 Diff" — DiffCard 需有"应用修改"按钮

前端计划：Monaco Editor 作为代码编辑器，CodeCard 从只读升级为可编辑。

---

## 1. 项目文件系统

Agent 产出的代码文件需要持久化到项目工作区，支持后续编辑。

### 1.1 获取项目文件树

```
GET /api/v1/projects/:project_id/files
Authorization: Bearer <token>
```

Response:

```json
{
  "code": 200,
  "data": {
    "project_id": "proj-001",
    "files": [
      {
        "id": "file-uuid-001",
        "path": "src/App.tsx",
        "size": 4096,
        "mime_type": "text/typescript",
        "updated_at": "2026-06-02T10:00:00Z",
        "source_agent_id": "agent-001",
        "source_message_id": "msg-001"
      }
    ]
  }
}
```

### 1.2 获取/更新文件内容

```
GET /api/v1/files/:file_id/content
Authorization: Bearer <token>
```

Response: 文件原始文本内容（`Content-Type: text/plain`）

```
PUT /api/v1/files/:file_id/content
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "// new file content"
}
```

Response:

```json
{
  "code": 200,
  "data": {
    "id": "file-uuid-001",
    "path": "src/App.tsx",
    "size": 4096,
    "updated_at": "2026-06-02T10:30:00Z"
  }
}
```

---

## 2. Apply Diff（一键应用 Diff）

### 2.1 应用 Diff

```
POST /api/v1/files/:file_id/apply-diff
Authorization: Bearer <token>
Content-Type: application/json

{
  "diff": "@@ -10,7 +10,7 @@\n-const old = 'value';\n+const new = 'value';",
  "expected_hash": "abc123"
}
```

| 字段 | 说明 |
|------|------|
| diff | Unified diff 格式的补丁 |
| expected_hash | 可选，当前文件内容的 SHA256，用于乐观锁冲突检测 |

Response (200):

```json
{
  "code": 200,
  "data": {
    "id": "file-uuid-001",
    "path": "src/App.tsx",
    "new_size": 4120,
    "applied": true,
    "new_hash": "def456"
  }
}
```

Response (409 — 冲突):

```json
{
  "code": 409,
  "data": {
    "conflict": true,
    "current_content": "...",
    "expected_hash": "abc123",
    "actual_hash": "xyz789"
  },
  "message": "文件已被修改，请手动处理冲突"
}
```

---

## 3. 代码冲突处理（Orchestrator 群聊场景）

当多个 Agent 同时修改同一文件时，Orchestrator 需要检测冲突并提供合并方案。

### 3.1 SSE 冲突通知事件

在 SSE 流中新增事件类型：

```
event: conflict_detected
data: {
  "file_id": "file-uuid-001",
  "file_path": "src/App.tsx",
  "conflicting_agent_ids": ["agent-claude-code", "agent-codex"],
  "conflict_description": "两个 Agent 同时修改了 src/App.tsx 的 handleClick 函数"
}
```

### 3.2 获取冲突详情

```
GET /api/v1/files/:file_id/conflicts
Authorization: Bearer <token>
```

Response:

```json
{
  "code": 200,
  "data": {
    "file_id": "file-uuid-001",
    "file_path": "src/App.tsx",
    "base_content": "原始内容...",
    "changes": [
      {
        "agent_id": "agent-claude-code",
        "agent_name": "Claude Code",
        "diff": "@@ -10,7 +10,7 @@\n...",
        "description": "添加了表单验证逻辑"
      },
      {
        "agent_id": "agent-codex",
        "agent_name": "Codex",
        "diff": "@@ -10,7 +10,7 @@\n...",
        "description": "重构了事件处理函数"
      }
    ]
  }
}
```

### 3.3 解决冲突

```
POST /api/v1/files/:file_id/resolve-conflict
Authorization: Bearer <token>
Content-Type: application/json

{
  "resolution": "merge",
  "merged_content": "// 合并后的完整文件内容",
  "accepted_changes": ["agent-claude-code", "agent-codex"]
}
```

`resolution` 可选值：
- `"merge"` — 手动合并，传 merged_content
- `"accept_all"` — 接受所有修改
- `"accept_one"` — 只接受某一个 Agent 的，传 accepted_changes 为单元素数组

---

## 4. 前端实现计划

### 4.1 Monaco Editor 集成

- 安装 `@monaco-editor/react`
- CodeCard 增加"编辑"按钮 → 切换到 Monaco 编辑器模式
- PreviewCard 全屏 Modal 增加代码编辑 Tab
- 保存时调用 `PUT /api/v1/files/:id/content`

### 4.2 一键应用 Diff

- DiffCard 增加"应用修改"按钮
- 点击 → 调用 `POST /api/v1/files/:id/apply-diff`
- 成功 → 绿色 toast "修改已应用"
- 409 冲突 → 弹出 ConflictResolver 组件（三栏对比：原始 | Claude | Codex）

### 4.3 代码冲突 UI

- 冲突通知：ChatArea 中 banner 提示 + OrchestratorSummary 中标记
- ConflictResolver 组件：三栏 Monaco diff 对比视图
  - 左：原始版本（base）
  - 中：Agent A 的修改
  - 右：Agent B 的修改
  - 底部：合并结果编辑器
- 解决后调 resolve-conflict API，继续 Orchestrator 流程

### 4.4 Mock 实现

- 文件内容存在 mock store Map 中
- apply-diff 用 diff 库（或简单正则）本地应用
- 冲突检测用 expected_hash 对比本地存储的 hash
