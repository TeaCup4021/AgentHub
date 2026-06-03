# 图片上传与文件服务 — 前后端 API 协定

日期：2026-06-02 | 状态：前端待后端实现

---

## 背景

当前前端消息类型只支持文本。课题要求消息类型含"图片"和"文件附件"。
前端需要：上传图片/文件 → 拿到 URL → 作为消息 attachment 发送 → 聊天流中渲染。

---

## 1. 图片/文件上传

```
POST /api/v1/files/upload
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

### Request

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | File | 是 | 文件 |
| type | string | 否 | `"image"` / `"file"` / `"artifact"`，默认 `"file"` |

### Response (201)

```json
{
  "code": 201,
  "data": {
    "id": "file-uuid-xxx",
    "url": "/api/v1/files/file-uuid-xxx",
    "filename": "screenshot.png",
    "size": 245760,
    "mime_type": "image/png",
    "width": 1920,
    "height": 1080,
    "created_at": "2026-06-02T10:30:00Z"
  },
  "message": "ok"
}
```

### 约束

- 图片最大 10MB，支持 png/jpg/gif/webp/svg
- 其他文件最大 50MB
- width/height 仅图片类型返回

---

## 2. 文件访问

```
GET /api/v1/files/:id
Authorization: Bearer <token>
```

直接返回文件流，`Content-Type` 为原始 mime_type。
可选 query: `?thumb=true&width=200` 返回缩略图（仅图片）。

---

## 3. 消息 attachment 扩展

### SendMessageRequest 扩展

在现有 `POST /api/v1/conversations/:id/messages` 的 Request Body 中新增：

```json
{
  "content": "看看这个截图",
  "contentType": "text",
  "mentions": [],
  "attachments": [
    {
      "file_id": "file-uuid-xxx",
      "filename": "screenshot.png",
      "mime_type": "image/png",
      "size": 245760,
      "width": 1920,
      "height": 1080
    }
  ]
}
```

### Message 响应中的 attachment

Message 对象新增字段：

```json
{
  "id": "msg-001",
  "content": "看看这个截图",
  "attachments": [
    {
      "id": "att-001",
      "file_id": "file-uuid-xxx",
      "filename": "screenshot.png",
      "mime_type": "image/png",
      "size": 245760,
      "width": 1920,
      "height": 1080,
      "url": "/api/v1/files/file-uuid-xxx"
    }
  ]
}
```

### SSE 事件扩展

新增 SSE 事件类型 `attachment`，在消息流式输出中通知前端有新附件：

```
event: attachment
data: {"message_id": "msg-001", "attachment": {...}}
```

---

## 4. 前端实现计划

### 4.1 发送侧

- ChatInput 粘贴图片时不再拦截，改为上传 → 在输入框中显示缩略图
- 拖拽文件到输入框 → 上传 → 显示文件卡片
- 发送时构造 `attachments[]` 随消息一起 POST

### 4.2 渲染侧

- MessageBubble 检测 `message.attachments`，在文本下方渲染图片/文件卡片
- 图片：点击放大（Semi Image.Preview 或自定义 lightbox）
- 文件：复用 FileCard 组件

### 4.3 Mock 阶段

Mock handler 接收上传返回假 URL（data URL），消息中 rendering 用 mock URL。

---

## 5. 文件管理（可选扩展）

```
GET /api/v1/files?conversation_id=xxx&type=image&page=1&page_size=20
```

按对话聚合文件列表（用于产物工作台的文件类型筛选）。
