# Spec: Diff 卡片升级

**日期**: 2026-05-27 | **状态**: 待实现

---

## 目标

将 DiffCard 从纯文本并排展示升级为带语法高亮、行级差异标记、统计栏和操作按钮的专业 diff 视图。

---

## UI 设计

```
┌─ middleware.ts  [typescript]  +8行 -4行 修改3处 ─┐
│  旧版本                         新版本              │
│  1  export function auth...    1  export function  │
│  2  const token = req.headers  2  const token =    │
│  3    .get("token");           3    .get("Auth..")│
│  4  if (token === "admin")     4    ?.replace(...)│
│  5    return true;             5  if (!token)      │
│  6    return false;            6    throw new Error│
│  7  }                          7  const payload =  │
│                                8    (token);       │
│                                9    return payload;│
│                               10  }                │
│  [应用修改] [复制]                        [展开]   │
└────────────────────────────────────────────────────┘
```

红底行 = 删除/修改，绿底行 = 新增/修改，不变行 = 正常背景

---

## 实现

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/components/cards/DiffCard.tsx` | 重写：用 Shiki 做语法高亮，加统计栏，加行级着色，加操作按钮 |
| `src/components/chat/HighlightedCode.tsx` | 复用其 Shiki 渲染逻辑，提取公共 hook |
| `src/index.css` | diff 行相关 CSS |

### 技术要点

- 复用 `HighlightedCode` 的 Shiki 初始化逻辑
- 调用 `codeToHtml` 时传入 `transformers` 做行号
- 差异行通过对比 `oldCode` 和 `newCode` 逐行判断
- 统计栏数据从 diff 计算中提取
- "应用修改"按钮触发事件，后端未就绪时 toast 提示

### 后端依赖

无。纯前端展示升级。
