import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@douyinfe/semi-ui";
import { IconPlus, IconMinus } from "@douyinfe/semi-icons";
import { orchestratorApi } from "@/lib/api";
import type { DagNode, DagEdge } from "@/types";

const STATUS_COLOR: Record<string, string> = {
  completed: "var(--color-success)",
  success: "var(--color-success)",
  running: "var(--color-status-running)",
  failed: "var(--color-danger)",
  timeout: "var(--color-warning)",
  queued: "var(--color-text-disabled)",
  unknown: "var(--color-text-disabled)",
};

const NODE_W = 200;
const NODE_H = 68;
const LAYER_GAP = 90;
const NODE_GAP = 16;

function computeLayout(nodes: DagNode[], edges: DagEdge[]) {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    inDegree.set(n.subtaskId, 0);
    adj.set(n.subtaskId, []);
  }
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }

  const layers: string[][] = [];
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  while (queue.length > 0) {
    layers.push([...queue]);
    const next: string[] = [];
    for (const id of queue) {
      for (const to of adj.get(id) ?? []) {
        const d = (inDegree.get(to) ?? 1) - 1;
        inDegree.set(to, d);
        if (d === 0) next.push(to);
      }
    }
    queue.length = 0;
    queue.push(...next);
  }

  const nodeMap = new Map(nodes.map((n) => [n.subtaskId, n]));
  const positions = new Map<string, { x: number; y: number }>();

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const totalW = layer.length * NODE_W + (layer.length - 1) * NODE_GAP;
    const startX = -totalW / 2 + NODE_W / 2;
    for (let ni = 0; ni < layer.length; ni++) {
      positions.set(layer[ni], {
        x: startX + ni * (NODE_W + NODE_GAP),
        y: li * (NODE_H + LAYER_GAP),
      });
    }
  }

  return { layers, positions, nodeMap };
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

interface Props {
  taskId: string;
  onZoomChange?: (zoom: number) => void;
  zoom?: number;
}

export function DagGraph({ taskId, onZoomChange, zoom: externalZoom }: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const svgRef = useRef<HTMLDivElement>(null);

  const currentZoom = externalZoom ?? zoom;

  const { data } = useQuery({
    queryKey: ["orchestrator", "dag", taskId],
    queryFn: async () => {
      const res = await orchestratorApi.dag(taskId);
      return res.data.data;
    },
    enabled: !!taskId,
    refetchInterval: 3000,
  });

  const layout = useMemo(() => {
    if (!data) return null;
    return computeLayout(data.nodes, data.edges);
  }, [data]);

  const setZoomAndNotify = useCallback(
    (z: number) => {
      const clamped = Math.max(0.5, Math.min(2.0, Math.round(z * 10) / 10));
      setZoom(clamped);
      onZoomChange?.(clamped);
    },
    [onZoomChange],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoomAndNotify(currentZoom + delta);
    },
    [currentZoom, setZoomAndNotify],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("rect[data-node]")) return;
      dragging.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY };
      panStart.current = { ...pan };
    },
    [pan],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging.current) return;
      const dx = (e.clientX - dragStart.current.x) / currentZoom;
      const dy = (e.clientY - dragStart.current.y) / currentZoom;
      setPan({ x: panStart.current.x + dx, y: panStart.current.y + dy });
    },
    [currentZoom],
  );

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const handleFitToScreen = useCallback(() => {
    if (!layout || !svgRef.current) return;
    const { positions } = layout;
    const allPos = [...positions.values()];
    if (allPos.length === 0) return;
    const maxX = Math.max(...allPos.map((p) => Math.abs(p.x)));
    const contentW = maxX * 2 + NODE_W + 40;
    const containerW = svgRef.current.clientWidth - 16;
    const fitZoom = Math.round((containerW / contentW) * 10) / 10;
    setZoomAndNotify(Math.max(0.5, Math.min(2.0, fitZoom)));
    setPan({ x: 0, y: 0 });
  }, [layout, setZoomAndNotify]);

  if (!data) return null;
  if (!layout) return null;

  const { positions, nodeMap } = layout;
  const allPos = [...positions.values()];
  const svgH = Math.max(...allPos.map((p) => p.y)) + NODE_H + 40;

  return (
    <div ref={svgRef} style={{ display: "flex", flexDirection: "column" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "4px 8px",
        borderBottom: "1px solid var(--color-border-light)",
      }}>
        <Button size="small" theme="borderless" icon={<IconPlus />} onClick={() => setZoomAndNotify(currentZoom + 0.1)} />
        <Button size="small" theme="borderless" icon={<IconMinus />} onClick={() => setZoomAndNotify(currentZoom - 0.1)} />
        <Button size="small" theme="borderless" onClick={handleFitToScreen}>适应</Button>
        <span style={{ marginLeft: 8, fontSize: 11, color: "var(--color-text-tertiary)" }}>
          {Math.round(currentZoom * 100)}%
        </span>
      </div>
      <div
        style={{ overflow: "hidden", cursor: dragging.current ? "grabbing" : "grab" }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          width="100%"
          height={Math.max(300, svgH * currentZoom + 20)}
          style={{ overflow: "visible", display: "block" }}
        >
          <g transform={`scale(${currentZoom}) translate(${pan.x}, ${pan.y})`}>
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="var(--color-border-medium)" />
              </marker>
            </defs>

            {data.edges.map((e) => {
              const from = positions.get(e.from);
              const to = positions.get(e.to);
              if (!from || !to) return null;
              const startY = from.y + NODE_H / 2;
              const endY = to.y - NODE_H / 2;
              const cpY = (startY + endY) / 2;
              return (
                <g key={`${e.from}->${e.to}`}>
                  <path
                    d={`M ${from.x} ${startY} C ${from.x} ${cpY}, ${to.x} ${cpY}, ${to.x} ${endY}`}
                    fill="none"
                    stroke="var(--color-border-medium)"
                    strokeWidth={1.5}
                    markerEnd="url(#arrowhead)"
                  />
                </g>
              );
            })}

            {[...positions].map(([id, pos]) => {
              const node = nodeMap.get(id);
              if (!node) return null;
              const color = STATUS_COLOR[node.status] ?? STATUS_COLOR.unknown;
              const duration = node.latencyMs != null ? `${(node.latencyMs / 1000).toFixed(1)}s` : "—";
              const x = pos.x - NODE_W / 2;
              const y = pos.y - NODE_H / 2;

              return (
                <g key={id}>
                  <title>{`${node.agentName}\n${node.instruction}\n${duration}`}</title>
                  <rect
                    data-node="true"
                    x={x}
                    y={y}
                    width={NODE_W}
                    height={NODE_H}
                    rx={8}
                    fill="var(--color-bg-elevated)"
                    stroke={color}
                    strokeWidth={1.5}
                  />
                  <circle cx={x + 14} cy={y + 16} r={4} fill={color} />
                  <text
                    x={x + 24}
                    y={y + 20}
                    fontSize={12}
                    fontWeight={600}
                    fill="var(--color-text-primary)"
                  >
                    {truncateText(node.agentName, 12)}
                  </text>
                  <text
                    x={x + NODE_W - 10}
                    y={y + 20}
                    fontSize={10}
                    fill="var(--color-text-tertiary)"
                    textAnchor="end"
                  >
                    {duration}
                  </text>
                  <text
                    x={x + 10}
                    y={y + 42}
                    fontSize={11}
                    fill="var(--color-text-secondary)"
                  >
                    {truncateText(node.instruction, 24)}
                  </text>
                  <text
                    x={x + 10}
                    y={y + 56}
                    fontSize={10}
                    fill={color}
                  >
                    {node.status === "running" ? "执行中..." : node.status === "success" ? "完成" : node.status === "failed" ? "失败" : node.status === "queued" ? "排队中" : node.status}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
