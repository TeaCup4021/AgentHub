# 前端实现清单

**日期**: 2026-05-27

---

## Spec 索引

| # | Spec 文档 | 内容 | 新增文件 | 修改文件 | 后端依赖 |
|---|----------|------|---------|---------|---------|
| 1 | `2026-05-27-design-token-refactor.md` | Design Token 对齐 Semi + 飞书双主题 | 0 | 15+ | 无 |
| 2 | `2026-05-27-interaction-experience.md` | 三层交互升级 + 补充点 | 2 | 12 | 无 |
| 3 | `2026-05-27-project-workspace.md` | 多项目文件夹分组 | 3 | 5 | projects 表 + 4 端点 |
| 4 | `2026-05-27-diff-card-upgrade.md` | Diff 卡片语法高亮 + 行级差异 | 0 | 2 | 无 |
| 5 | `2026-05-27-onboarding-wizard.md` | 首次使用 3 步引导 | 3 | 2 | 无 |

---

## 新增文件清单

```
src/
  components/
    ErrorBoundary.tsx              ← 已实现
    onboarding/
      OnboardingWizard.tsx         ← 待实现 (spec 5)
      WelcomeStep.tsx              ← 待实现 (spec 5)
      ConfigStep.tsx               ← 待实现 (spec 5)
      TryStep.tsx                  ← 待实现 (spec 5)
    project/
      CreateProjectModal.tsx       ← 待实现 (spec 3)
      ProjectSettingsModal.tsx     ← 待实现 (spec 3)
    CommandPalette.tsx             ← 待实现 (spec 2)
  hooks/
    useKeyboardShortcut.ts         ← 已实现
    useProjects.ts                 ← 待实现 (spec 3)
  stores/
    notificationStore.ts           ← 待实现 (spec 2)
    projectStore.ts                ← 待实现 (spec 3)
```

## 修改文件清单

```
src/
  App.tsx                          ← spec 1,2,5
  main.tsx                         ← 已实现
  index.css                        ← spec 1,2
  vite-env.d.ts                    ← 已实现
  types/
    chat.ts                        ← spec 3
  stores/
    chatStore.ts                   ← spec 2,3
    uiStore.ts                     ← spec 2,3,5
  hooks/
    index.ts                       ← 已实现
  lib/
    api.ts                         ← spec 3
    sse.ts                          ← 已实现
  mocks/
    data.ts                        ← spec 3
  components/
    cards/
      CardRenderer.tsx             ← 已实现
      DiffCard.tsx                 ← spec 4
    chat/
      ChatHeader.tsx               ← spec 1,2
      ChatInput.tsx                ← spec 2
      MessageList.tsx              ← spec 1,2
      MessageActions.tsx           ← 已实现
      MarkdownBubble.tsx           ← 已实现
    layout/
      AppLayout.tsx                ← spec 1,2,3
      ChatArea.tsx                 ← spec 1,2,3
      ConversationList.tsx         ← spec 1,2,3
      IconSidebar.tsx              ← spec 1,2
    settings/
      SettingsPage.tsx             ← spec 1,2,5
      LLMConfigSection.tsx         ← spec 2
    ErrorBoundary.tsx              ← 已实现
```

---

## 实现顺序建议

1. **Spec 5 — Onboarding 引导流程**（纯前端、无依赖、改动少、见效快）
2. **Spec 1 — Design Token 重构**（全局 CSS 改动、影响所有组件）
3. **Spec 4 — Diff 卡片升级**（单文件重写、复用已有组件）
4. **Spec 2 — 交互体验三层**（功能多、跨文件多）
5. **Spec 3 — 项目工作区**（依赖后端、先做前端 UI + Mock）

---

## 各 Spec 间冲突关系

- Spec 1（Token 重构）会影响所有组件的 CSS 变量引用 → 建议最先做
- Spec 2 的 CommandPalette 依赖 Spec 1 的 UI 一致性
- Spec 3 的项目切换器在 ConversationList 顶部，不和其他 spec 冲突
- Spec 4 独立，随时可做
- Spec 5 独立，随时可做
