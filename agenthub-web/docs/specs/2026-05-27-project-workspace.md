# Spec: 多项目工作区

**日期**: 2026-05-27 | **状态**: 待实现

---

## 一句话定义

给对话列表加一层文件夹分组。选"React Dashboard"只看前端对话，选"API 后端"只看后端对话。每个项目可绑定默认 Agent。

---

## 用户流程

```
进入 AgentHub
  → 左上角显示"当前项目"下拉
  → 默认选中上次使用的项目
  → 切换项目：对话列表刷新为该项目的对话
  → 新建对话：默认选中该项目的默认 Agent
  → 没有项目时：显示"默认空间"，行为和现在一样
```

---

## 数据结构

### 前端类型（`src/types/chat.ts` 新增）

```ts
interface Project {
  id: string;
  name: string;
  description?: string;
  defaultAgentIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

### Conversation 扩展

```ts
// 已有字段保持，新增：
projectId?: string;  // 可选，不归属项目的对话兼容现有数据
```

### Mock 数据（`src/mocks/data.ts` 新增）

3 个预设项目：React Dashboard / API 后端重构 / 数据库优化，各有 2-3 个对话。

---

## UI 改动

### 1. 项目切换器

**位置**: ConversationList 顶部，AgentHub 标题旁边

```
┌─ AgentHub  [React Dashboard ▾] ─┐
│  [+ 新建项目]                      │
│  ──────────────────────────────── │
│  ● React Dashboard                 │
│  ○ API 后端重构                    │
│  ○ 数据库优化                      │
└───────────────────────────────────┘
```

- 点击切换项目 → 对话列表刷新为该项目的对话
- "+ 新建项目" → 弹出创建弹窗
- 底部有"管理项目"入口 → 跳转设置或弹出管理面板
- 无项目时默认显示"所有对话"

### 2. 创建项目弹窗

```
┌─ 新建项目 ──────────────────┐
│ 名称        [______________] │
│ 描述        [______________] │
│ 默认 Agent  [多选下拉]       │
│                              │
│  [取消]  [创建]              │
└──────────────────────────────┘
```

### 3. 项目设置弹窗（编辑/删除项目）

```
┌─ 项目设置 ──────────────────┐
│ 名称  [______________]       │
│ 描述  [______________]       │
│ 默认 Agent [多选]            │
│                              │
│  [删除项目]  [取消]  [保存]  │
└──────────────────────────────┘
```

### 4. 对话归属

- 在项目内新建对话 → 自动归属该项目
- 对话右键菜单新增"移动到项目"选项
- 创建对话弹窗中显示当前项目名，可切换

---

## 状态管理

### `src/stores/projectStore.ts`（新增）

```ts
interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  setActiveProject: (id: string | null) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  removeProject: (id: string) => void;
}
```

---

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/types/chat.ts` | 新增 Project 接口，Conversation 加 projectId |
| `src/stores/projectStore.ts` | 新增 |
| `src/mocks/data.ts` | 新增 3 个预设项目 |
| `src/components/layout/ConversationList.tsx` | 顶部加项目切换器，项目过滤逻辑 |
| `src/components/layout/AppLayout.tsx` | 项目筛选 conversation 列表 |
| `src/components/project/CreateProjectModal.tsx` | 新增 |
| `src/components/project/ProjectSettingsModal.tsx` | 新增 |
| `src/hooks/useProjects.ts` | 新增（React Query hooks，Mock 兼容） |

---

## 与后端对接

- 项目 CRUD 走 `POST/GET/PATCH/DELETE /api/v1/projects`
- 对话列表过滤走 `GET /conversations?project_id=xxx`
- 后端未就绪时前端用 Mock projectStore 独立运行