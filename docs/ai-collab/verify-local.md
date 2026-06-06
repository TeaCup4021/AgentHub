# 本地全量验证 Playbook

改完代码后，按本清单跑验证。**关键坑：bash 工作目录在多次调用间会保持**——前端测试必须从 `agenthub-web/` 跑、后端从 `backend/`（或仓库根用 `--app-dir`）跑，目录漂移会让 vitest 报 `No test files found` 这类**假错误**（看着像测试丢了，其实是 cwd 不对）。每条命令都用绝对/显式目录，别依赖"上一条命令切过去了"。

## 前端（agenthub-web）

```bash
# 类型检查（不依赖 cwd，-p 指定）
npx tsc -b agenthub-web/tsconfig.json
# 或显式进目录
( cd agenthub-web && npx tsc -b )

# 全量单测 —— 必须在 agenthub-web 下，否则 vitest 找不到测试
( cd agenthub-web && npm run test )

# 单文件
( cd agenthub-web && npx vitest run src/lib/__tests__/diffApply.test.ts )
```

> 用 `( cd X && ... )` 子shell 包裹，命令结束后 cwd 自动还原，避免污染后续调用。

## 后端（backend）

```bash
# 用项目 .venv 的解释器，别用系统 PATH 的 python（会缺 python-multipart 等依赖报假错）
.venv/Scripts/python -m pytest backend/tests/services/ -q

# 单文件
.venv/Scripts/python -m pytest backend/tests/services/test_artifact_format.py -q
```

> 已知：`backend/tests/api/` 与 `test_stream_sequentializer.py` 的 async 用例本机报
> `async def functions are not natively supported`（未装/未启用 pytest-asyncio）。这是**预存环境问题**，
> 非回归——判断"有没有引入新红测"时排除这批。

## 判定"是不是我引入的回归"

跑出红测先别急着改，确认它是不是本次引入：

```bash
# 列出本次会话改了哪些文件
git status --short
# 红测涉及的文件若不在改动列表里，且失败信息是环境类（No test files / async not supported / No QueryClient set 等），
# 多半是预存问题或 cwd/依赖配置问题，不是你的逻辑回归
```

常见"假回归"对照：

| 现象 | 真因 | 处理 |
|------|------|------|
| vitest `No test files found` | cwd 漂到非 `agenthub-web` 目录 | `( cd agenthub-web && ... )` |
| pytest `No module named python-multipart` 等 | 用了系统 python 而非 `.venv` | 改用 `.venv/Scripts/python -m pytest` |
| `No QueryClient set` | 深埋组件用了 `useQueryClient()` hook，孤立单测无 Provider | 改用 `@/lib/queryClient` 单例（见 CLAUDE.md 规则） |
| `async def functions are not natively supported` | 本机未启用 pytest-asyncio | 预存环境问题，排除该批 |
