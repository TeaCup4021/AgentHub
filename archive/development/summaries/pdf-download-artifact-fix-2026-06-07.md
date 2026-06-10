# PDF 下载链接产物修复 - 2026-06-07 进度总结

## 1. 环境变更与基础设施
- **依赖引用**：未新增 Python / Node 依赖。PDF 生成使用后端内置轻量 PDF writer，避免依赖 `reportlab` / `fpdf`。
- **项目结构**：未新增业务目录。新增/扩展测试覆盖：
  - `backend/tests/services/test_artifact_detector.py`
  - `backend/tests/services/adapters/test_rich_media_artifacts.py`
  - `agenthub-web/src/stores/__tests__/chatStore.test.ts`

## 2. 当前项目进度与测试结果
- **问题根因**:
  - 普通 ADK / LiteLLM agent 的 `create_file` 只能写 UTF-8 文本，遇到 PDF 请求时模型容易退化成 HTML 替代方案。
  - ADK FunctionTool 返回的 `download_url` 未被 SSE translator 自动转换为 artifact，导致日志出现 `artifacts_found=0`。
  - artifact XML 规范中旧写法 `<artifact type="file" ... type="application/pdf" />` 存在重复 `type` 属性，通用解析会覆盖真实 artifact 类型。
- **完成的修复**:
  - `backend/app/services/adk/cli_tools.py`
    - `create_file` 支持 `.pdf` 路径，生成真实 PDF 字节并以 `application/pdf` 上传。
    - 工具 docstring 明确提示 PDF 下载请求应使用 `.pdf`。
  - `backend/app/services/adapters/adk_to_sse.py`
    - 从 ADK FunctionResponse 中提取工具返回的 `download_url`，自动发出 `document` / `file` artifact SSE。
  - `backend/app/services/artifact_detector.py`
    - 兼容旧 XML 重复 `type` 属性，将 MIME 转为 `mime`。
    - 支持 `document` artifact 和本地 `/api/v1/files/{id}/download` 下载链接兜底检测。
    - 为下载 artifact 生成稳定 `download-{hash}` id，减少重复渲染。
  - `backend/app/services/artifact_format.py`
    - 将文件 artifact 规范改为 `mime="mime/type"`。
    - 增加 PDF 请求必须生成真实 PDF 的系统提示。
  - `agenthub-web/src/components/agent/CreateAgentModal.tsx`
    - Agent 工具列表补齐 `upload_file` / `preview_publish`，并标注 `create_file` 支持 PDF。
  - `agenthub-web/src/stores/chatStore.ts`
    - 流式 artifact 追加改为同 id 覆盖，避免工具返回和最终文本检测同时命中时重复显示卡片。
- **测试结果**:
  - `python -m pytest backend/tests/services/test_artifact_detector.py backend/tests/services/adapters/test_rich_media_artifacts.py`：14 passed。
  - `python -m py_compile backend/app/services/adk/cli_tools.py backend/app/services/artifact_detector.py backend/app/services/adapters/adk_to_sse.py backend/app/services/artifact_format.py`：通过。
  - `_make_simple_pdf()` 直接校验：输出以 `%PDF-1.4` 开头并包含 `%%EOF`。
  - `npm.cmd run test -- src/stores/__tests__/chatStore.test.ts`：1 file / 18 tests passed。

## 3. 下一步工作计划与要点分析
- **数据库同步**：无需 migration。
- **依赖分析与配置补全**：无需新增依赖；依赖现有 MinIO 文件下载接口。
- **下阶段开发**：
  - 建议在真实 UI 中用“我需要一个示例文件，可以帮我生成一个 PDF 文档的下载链接吗？”做端到端回归。
  - 若后续需要复杂版式 PDF，可再接入服务端 PDF 模板引擎；当前修复优先保证“真实 PDF 可下载链接”这个核心路径稳定。
