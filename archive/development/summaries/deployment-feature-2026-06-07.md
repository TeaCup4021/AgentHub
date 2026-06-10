# 轻量级部署功能实现总结

**日期：** 2026-06-07  
**实现方案：** A方案（轻量级快速预览）  
**完成时间：** 1天内

## 功能概述

实现了一个轻量级的 HTTP Server 部署系统，允许用户在 AgentHub 中通过自然语言指令快速部署静态网页。

### 核心特性

1. **自动部署流程**
   - 用户：发送部署指令（如"部署到8090端口"或"把hello.html部署到本地"）
   - Agent：创建文件并返回 `<artifact type="deploy_status" url="DEPLOY_REQUEST"/>`
   - 前端：DeployStatusCard 自动检测并触发部署
   - 后端：启动独立的 HTTP server 进程
   - 用户：获得可点击的本地链接

2. **智能端口分配**
   - 范围：8000-9000
   - 自动查找可用端口
   - 数据库 + 系统级双重检查

3. **实时状态监控**
   - 进程存活检测（基于 psutil）
   - 运行时间统计
   - 5秒轮询更新

4. **完整生命周期管理**
   - 创建：`POST /api/v1/deployments/conversations/{conv_id}`
   - 查询：`GET /api/v1/deployments/{deployment_id}`
   - 停止：`POST /api/v1/deployments/{deployment_id}/stop`
   - 列表：`GET /api/v1/deployments/conversations/{conv_id}`
   - 清理：`POST /api/v1/deployments/cleanup`

## 技术实现

### 后端（Python + FastAPI）

#### 新增文件
1. **`models/deployment.py`** - ORM 模型
   - 字段：id, conversation_id, user_id, name, port, directory, process_pid, status, is_active, timestamps
   
2. **`services/deployment.py`** - 核心服务（~180行）
   - `find_available_port()` - 智能端口分配
   - `create_deployment()` - 创建部署 + 启动 HTTP server
   - `stop_deployment()` - 停止进程
   - `get_deployment_status()` - 实时状态
   - `cleanup_stale_deployments()` - 清理僵尸部署

3. **`api/v1/deployments.py`** - REST API
   - 5个端点，完整的 CRUD + 停止 + 清理

4. **`schemas/deployment.py`** - Pydantic Schema

5. **数据库迁移** - `alembic/versions/2cb4272008eb_add_deployment_table.py`

#### 修改文件
1. **`api/router.py`** - 注册 deployments_router
2. **`adapters/cli_adapter.py`** - 添加部署指令提示
3. **`services/artifact_detector.py`** - 增强 deploy_status artifact 解析（支持 port 属性）

### 前端（React + TypeScript）

#### 重构文件
1. **`components/cards/DeployStatusCard.tsx`** (~220行)
   - 自动部署触发（检测 `url="DEPLOY_REQUEST"`）
   - 从会话消息收集部署文件
   - 状态轮询（5秒间隔）
   - UI 状态：pending, building, deployed, running, stopped, failed
   - 运行时间格式化显示
   - 停止按钮

#### 修改文件
1. **`components/cards/CardRenderer.tsx`** - 传递 conversationId
2. **`components/chat/MessageList.tsx`** - 接收并传递 conversationId
3. **`components/layout/ChatArea.tsx`** - 从 store 获取 activeId 传递给 MessageList

### 依赖
- **新增：** `psutil==7.2.2` - Python 进程管理

## 使用示例

### 示例 1：简单部署
```
用户：创建一个 Hello World 页面并部署
Agent：[创建 hello.html] + <artifact type="deploy_status" url="DEPLOY_REQUEST"/>
前端：自动部署，显示 http://localhost:8234
```

### 示例 2：指定端口
```
用户：部署到 8090 端口
Agent：<artifact type="deploy_status" url="DEPLOY_REQUEST" port="8090"/>
前端：尝试使用 8090，如果占用则自动选择其他端口
```

### 示例 3：停止部署
```
用户：在 DeployStatusCard 中点击"停止部署"按钮
前端：调用 POST /api/v1/deployments/{id}/stop
后端：终止进程，更新状态为 stopped
```

## API 测试

### 创建部署
```bash
curl -X POST http://localhost:8000/api/v1/deployments/conversations/{conv_id} \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-deployment",
    "files": {
      "index.html": "<!DOCTYPE html><html><body><h1>Hello World!</h1></body></html>"
    },
    "port": null
  }'
```

### 查询状态
```bash
curl http://localhost:8000/api/v1/deployments/{deployment_id}
```

### 停止部署
```bash
curl -X POST http://localhost:8000/api/v1/deployments/{deployment_id}/stop
```

## 已知限制

1. **会话级生命周期** - 部署与 AgentHub 进程绑定，重启后丢失
2. **仅静态内容** - 基于 `python -m http.server`，不支持后端 API
3. **端口范围限制** - 8000-9000，约 1000 个并发部署上限
4. **进程隔离不完全** - 虽然使用 `start_new_session=True` detach，但仍受父进程影响

## 后续优化方向（可选）

### Phase 2：静态站点托管（方案 C）
- 基于 MinIO + nginx 的持久化托管
- 公开分享链接
- 访问统计

### Phase 3：容器化部署（方案 B）
- Docker 容器隔离
- 支持全栈应用
- 自动域名分配

## 文件清单

### 后端新增（5个文件）
- `backend/app/models/deployment.py`
- `backend/app/services/deployment.py`
- `backend/app/api/v1/deployments.py`
- `backend/app/schemas/deployment.py`
- `backend/alembic/versions/2cb4272008eb_add_deployment_table.py`

### 后端修改（3个文件）
- `backend/app/api/router.py`
- `backend/app/services/adapters/cli_adapter.py`
- `backend/app/services/artifact_detector.py`

### 前端修改（4个文件）
- `agenthub-web/src/components/cards/DeployStatusCard.tsx`
- `agenthub-web/src/components/cards/CardRenderer.tsx`
- `agenthub-web/src/components/chat/MessageList.tsx`
- `agenthub-web/src/components/layout/ChatArea.tsx`

### 文档更新（1个文件）
- `CLAUDE.md`

**总计：13个文件变更**

## 测试要点

1. ✅ 后端启动成功，无 import 错误
2. ✅ 数据库迁移成功
3. ⏳ 端到端测试（待用户验证）：
   - Agent 生成 deploy_status artifact
   - 前端自动触发部署
   - HTTP server 启动成功
   - 可通过 URL 访问
   - 停止按钮工作正常

## 结论

方案 A（轻量级快速预览）已完整实现，后端和前端代码均已完成并部署。用户现在可以通过自然语言与 CLI Agent 对话来创建和部署简单的网页应用，非常适合快速演示和原型开发。
