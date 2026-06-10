# 文档预览与 Pin 消息 — 前后端 API 协定

日期：2026-06-02 | 状态：部分已有 API，部分待扩展

---

## 1. 文档内联预览

课题要求产物支持"文档渲染"（PDF/Word/PPT）。

### 方案

- PDF：前端用 `react-pdf` 或 iframe 嵌入 `/api/v1/files/:id?inline=true`
- Office 文档：后端转 PDF 或前端用 Office Web Viewer iframe
- PPT：P2 需求，暂缓

### 需要后端支持

```
GET /api/v1/files/:id?inline=true
```

对 PDF/Office 文件返回 `Content-Disposition: inline`（而非 `attachment`），允许浏览器内嵌预览。

对 Office 文件，可考虑返回转换后的 PDF 流：

```
GET /api/v1/files/:id/preview
```

后端将 docx/xlsx/pptx 转为 PDF 后返回。

### 前端实现

- 新增 `DocumentCard` 组件（或扩展 PreviewCard）
- PDF：react-pdf 逐页渲染 + 缩略图导航
- Word/PPT：iframe 嵌入 Office Web Viewer（`https://view.officeapps.live.com/op/embed.aspx?src=<url>`）
- 全屏模式下提供下载按钮

---

## 2. Pin 消息 UI

### 现有 API（前端已定义，无需新增）

```
POST   /api/v1/conversations/:id/pins          # 置顶消息
DELETE /api/v1/conversations/:id/pins/:msgId   # 取消置顶
```

### 需要补充的 API

获取对话中所有已 pin 消息：

```
GET /api/v1/conversations/:id/pins
Authorization: Bearer <token>
```

Response:

```json
{
  "code": 200,
  "data": {
    "pins": [
      {
        "message_id": "msg-001",
        "pinned_at": "2026-06-02T10:00:00Z",
        "pinned_by": "user-uuid",
        "content_preview": "这是被 pin 的消息前 100 字..."
      }
    ]
  }
}
```

### 前端 UI 计划

- 消息操作栏增加"Pin"按钮（图钉图标）
- ChatHeader 旁边增加"已固定消息 (N)"按钮 → 点击弹出 PinnedMessages 面板
- PinnedMessages 面板：消息列表 + 点击跳转到对应位置 + 取消 pin
- 被 pin 的消息在 MessageList 中有视觉标记（右侧图钉图标或左侧色条）
- 发送消息时把 pinned message IDs 作为 context 传给后端（如果后端支持）
