# PPT 内联浏览 — 实施计划

> 日期：2026-06-05 | 状态：待评审 | P2

---

## 一、背景

`DocumentCard.tsx` 当前已支持 PDF（iframe）、Word（mammoth → HTML）、Excel（SheetJS → HTML）三种文档内联预览。**PPT（pptx）仍走下载分支**：`c.fileType === "pptx"` 提前退出渲染循环，落到 `<Empty>` 展示 → 下载链接。

```tsx
// DocumentCard.tsx:26-28 — pptx 与 pdf 同走提前退出
if (c.fileType === "pdf" || c.fileType === "pptx") {
  setLoading(false);
  return;
}
// ...
// pdf 单独走 iframe，pptx 落到 else → Empty + 下载（第 119-125 行）
```

---

## 二、方案对比

PPT 浏览器端直接渲染无成熟纯前端库（不同于 mammoth for Word / SheetJS for Excel），三个方向：

| 方案 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| **A — Office Web Viewer iframe** | 把文件 URL 传给 `view.officeapps.live.com`，微软服务器渲染后 iframe 回显 | 零后端改动、零安装依赖、立即可用 | 文件需公网可达（需 MinIO presigned URL 或公开链接）；数据经过微软服务器（隐私风险）；需联网 |
| **B — Google Docs Viewer** | `docs.google.com/viewer?url=...&embedded=true` | 同上 | 同上；国内访问可能不稳定 |
| **C — LibreOffice headless 后端转换** | 后端子进程调 `libreoffice --headless --convert-to pdf`，转完存 MinIO，前端 pdf iframe 预览 | 数据不离开服务器；每页保真度高；PDF 复用现有渲染 | 需服务器装 LibreOffice（~500MB）；首次转换耗时 2-5s；需异步任务防阻塞 |
| **D — 维持现状** | pptx 仅下载 | 零成本 | 用户体验差 |

---

## 三、推荐方案：A（Office Web Viewer）为主，C（LibreOffice）为备

### 选择理由

1. **P2 优先级**，不应投入重型后端改造
2. **零安装依赖** — 方案 A 仅改前端 `DocumentCard.tsx` 一处（pptx 分支从 Empty 改为 iframe + Office Web Viewer URL）
3. **方案 C 作为自部署兜底** — 当用户要求数据不出站或离线部署时启用
4. Office Web Viewer 对 pptx 的渲染保真度远高于任何开源前端库

### URL 构造

```
https://view.officeapps.live.com/op/embed.aspx?src={encodeURIComponent(fileUrl)}
```

其中 `fileUrl` 是 pptx 文件的公网可访问地址：
- 用户上传的本地文件：后端生成 MinIO **presigned URL**（参考已有 `storage.get_presigned_url()`，设 10 分钟有效期），前端用 presigned URL 作为 src
- Agent 引用的外部文件：直接使用原始 URL

---

## 四、实施步骤

### 步骤 1：前端 DocumentCard — pptx 分支改为 Office Web Viewer iframe

**文件** `agenthub-web/src/components/cards/DocumentCard.tsx`

修改逻辑：
1. `useEffect` 中移除 `c.fileType === "pptx"` 的提前退出（让其进入正常 loading→loaded 流程）
2. 渲染区新增 `c.fileType === "pptx"` 分支，输出 iframe：

```tsx
) : c.fileType === "pptx" ? (
  <iframe
    src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(c.fileUrl)}`}
    style={{ width: "100%", height: "100%", border: "none" }}
    title={c.fileName}
    sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
  />
)
```

3. 移除第 26 行 `|| c.fileType === "pptx"` 条件（保留 pdf 提前退出）

**改动量**：约 5 行。

### 步骤 2（可选）：后端 presigned URL 生成

**触发条件**：只有当文件存储在 MinIO 且原始 URL 不可公网访问时才需要。

**文件** `backend/app/services/storage.py`（`get_presigned_url` 已存在）

在 artifact 构建阶段（`artifact_detector.py`）对 MinIO 存储的 pptx 文件生成 presigned URL，替换原始 object path：

```python
# 已有函数，直接调用即可
presigned_url = storage.get_presigned_url(object_name, expires=600)  # 10 分钟
```

**改动量**：约 3 行（artifact 构建时判断文件是否来自 MinIO → 调 presigned）。

### 步骤 3：降级策略

```tsx
// DocumentCard — pptx 分支：双重保障
const pptxViewerUrl =
  `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(c.fileUrl)}`;

// iframe onError → 降级展示下载
const [officeViewerFailed, setOfficeViewerFailed] = useState(false);

if (officeViewerFailed) {
  return <Empty title="PPT 预览不可用" description="Office Web Viewer 无法加载，请下载查看" />;
}

return (
  <iframe src={pptxViewerUrl} onError={() => setOfficeViewerFailed(true)} ... />
);
```

### 步骤 4（远期）：LibreOffice 自部署方案

当需要离线部署或数据不出站时启用：

1. 后端新增 `POST /api/v1/files/{file_id}/convert` 端点
2. 内部调用 `subprocess.run(["libreoffice", "--headless", "--convert-to", "pdf", input_path, "--outdir", output_dir])`
3. 转换后的 PDF 存入 MinIO（`conversions/{file_id}.pdf`）
4. 返回 PDF 的 presigned URL 给前端
5. 前端 pdf 分支已存在，无需改动

---

## 五、涉及文件

| 文件 | 改动 | 复杂度 |
|------|------|--------|
| `agenthub-web/src/components/cards/DocumentCard.tsx` | pptx → Office Web Viewer iframe | 低（~10 行） |
| `backend/app/services/artifact_detector.py` | 可选：MinIO 文件生成 presigned URL | 低（~5 行） |
| `backend/app/services/storage.py` | `get_presigned_url` 已存在，无需改动 | 无 |

---

## 六、验证标准

1. Agent 输出 pptx 链接 → 前端渲染 `DocumentCard`，内嵌 Office Web Viewer iframe
2. iframe 内可正常翻页浏览 PPT 幻灯片
3. 文件来自外网（Agent 引用）→ 直接预览
4. 文件来自 MinIO 上传 → presigned URL 预览（方案 C 备选）
5. Office Web Viewer 加载失败 → 降级为下载链接，不白屏
6. 不改动现有 PDF / Word / Excel 渲染行为

---

## 七、工作量评估

| 阶段 | 工作量 | 风险 |
|------|--------|------|
| 步骤 1：前端改用 Office Web Viewer | 小（30 分钟） | 低 |
| 步骤 2：presigned URL（可选） | 小（15 分钟） | 低 |
| 步骤 3：降级策略 | 小（15 分钟） | 低 |
| 步骤 4：LibreOffice 自部署（远期） | 中（2-3 小时） | 中 |
| **合计（本次）** | **1 小时** | — |

---

## 八、备注

- 本计划仅实现步骤 1-3（Office Web Viewer 路径），步骤 4 作为远期自部署备选
- Office Web Viewer 的隐私风险：文件 URL 会传给微软服务器。对内部敏感文档不可用，届时切方案 C
- 与 PDF iframe 共用一个 resize 容器，无需额外样式调整
- 不新增 npm 依赖
