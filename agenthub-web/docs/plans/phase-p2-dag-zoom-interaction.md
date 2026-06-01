# Phase: DAG 任务图缩放交互

**日期**: 2026-06-01  
**对应 Spec**: [2026-06-01-dag-zoom-interaction.md](../specs/2026-06-01-dag-zoom-interaction.md)  
**状态**: in_progress

---

## 任务列表

### T1: DagGraph 节点改为纯 SVG

**文件**: `src/components/chat/DagGraph.tsx`  
**依赖**: 无  
**状态**: pending

- [ ] 删除所有 foreignObject，改为 `<rect>` + `<text>` + `<circle>` 渲染
- [ ] Agent 名称、耗时、指令分别用 `<text>` 元素
- [ ] 文字截断：超过节点宽度用省略号
- [ ] 节点 hover 加 `<title>` 显示完整信息

### T2: 滚轮缩放 + 拖拽平移

**文件**: `src/components/chat/DagGraph.tsx`  
**依赖**: T1  
**状态**: pending

- [ ] 新增 `zoom` 和 `pan` 状态
- [ ] SVG 容器加 `transform: scale(${zoom}) translate(${pan.x}, ${pan.y})`
- [ ] `onWheel` 缩放，以鼠标位置为中心点
- [ ] `onMouseDown/Move/Up` 拖拽平移
- [ ] 缩放范围 0.5x ~ 2.0x

### T3: 缩放控件按钮 + 自适应

**文件**: `src/components/chat/DagGraph.tsx`, `src/components/chat/ReActPanel.tsx`  
**依赖**: T2  
**状态**: pending

- [ ] DagGraph 顶部加 +/-/适应 三个小按钮
- [ ] "适应"按钮计算 SVG 实际尺寸，缩放到适合容器宽度
- [ ] ReActPanel 的 DAG 标签栏加同样三个按钮（与 DagGraph 内部按钮联动）

### T4: 类型检查 + 测试

**文件**: 全部  
**依赖**: T1-T3  
**状态**: pending

- [ ] `npx tsc -b --noEmit` 零错误
- [ ] `npx vitest run` 全部通过

---

## 依赖图

```
T1 (节点 SVG 化) → T2 (缩放平移) → T3 (控件按钮) → T4 (验证)
```
