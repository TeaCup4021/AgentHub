# Spec: DAG 任务图缩放交互

**日期**: 2026-06-01  
**状态**: review  
**关联**: 任务图缩放、平移、节点 SVG 化

---

## 动机

当前 DagGraph 用 SVG + foreignObject 渲染，固定尺寸、无缩放、超出面板只能滚动条查看，用户体验差。

## 设计方案

### 节点改为纯 SVG

`foreignObject`（内嵌 HTML div）→ 纯 SVG `<rect>` + `<text>` + `<circle>`，确保 CSS transform scale 后文字清晰。

每个节点结构：
```svg
<rect x y w h rx fill stroke />       ← 节点背景
<circle cx cy r fill />               ← 状态指示圆点
<text>Agent 名称</text>               ← 名称 + 耗时
<text>指令描述</text>                  ← 指令文字
```

### 缩放交互

- **鼠标滚轮**：在 SVG 区域滚轮缩放（0.5x ~ 2.0x），以鼠标位置为中心
- **拖拽平移**：鼠标按住空白区可拖拽平移
- **标题栏按钮**：+（放大）、-（缩小）、⊡（适应面板宽度）
- **默认缩放**：有 2+ 节点时自动缩放至适合 ReActPanel 宽度

### 交互边界

- 缩放范围：0.5x ~ 2.0x，步进 0.1x
- 拖拽节点时：不触发平移（节点区域区分点击和拖拽）
- 节点 hover：保留状态提示（原生 SVG title 或 tooltip）

## 文件变更

| 文件 | 改动 |
|------|------|
| `DagGraph.tsx` | foreignObject → 纯 SVG；加 zoom/pan 状态；加滚轮+拖拽事件；加缩放控件 |
| `ReActPanel.tsx` | DAG 标签标题栏加 +/-/适应 三个小按钮 |

## 非目标

- 不改 DAG 数据源和轮询逻辑
- 不改变节点间的拓扑布局算法
- 不做节点拖拽排序

## 验收标准

1. 鼠标滚轮可以缩放任务图（0.5x ~ 2.0x）
2. 拖拽空白区可以平移任务图
3. +/- 按钮和适应按钮正常工作
4. 节点 hover 能查看完整信息（tooltip）
5. `npx tsc -b --noEmit` 零错误
6. `npx vitest run` 全部通过
