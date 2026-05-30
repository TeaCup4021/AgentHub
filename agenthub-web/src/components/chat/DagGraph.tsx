import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { orchestratorApi } from "@/lib/api";
import type { DagNode, DagEdge } from "@/types";

const STATUS_COLOR: Record<string, string> = {
  completed: "var(--color-success)",
  success: "var(--color-success)",
  running: "#3b82f6",
  failed: "var(--color-danger)",
  timeout: "var(--color-warning)",
  queued: "var(--color-text-disabled)",
  unknown: "var(--color-text-disabled)",
};

const NODE_W = 200;
const NODE_H = 72;
const LAYER_GAP = 100;
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

interface Props {
  taskId: string;
}

export function DagGraph({ taskId }: Props) {
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

  if (!data) return null;
  if (!layout) return null;

  const { positions, nodeMap } = layout;
  const allPos = [...positions.values()];
  const svgW = Math.max(...allPos.map((p) => Math.abs(p.x))) * 2 + 80;
  const svgH = Math.max(...allPos.map((p) => p.y)) + NODE_H + 40;

  return (
    <div style={{ overflow: "auto", padding: "12px 0", display: "flex", justifyContent: "center" }}>
      <svg width={svgW} height={svgH} style={{ overflow: "visible" }}>
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
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="var(--color-border-medium)" />
          </marker>
        </defs>
        {[...positions].map(([id, pos]) => {
          const node = nodeMap.get(id);
          if (!node) return null;
          const color = STATUS_COLOR[node.status] ?? STATUS_COLOR.unknown;
          const duration = node.latencyMs != null ? `${(node.latencyMs / 1000).toFixed(1)}s` : "—";
          return (
            <foreignObject
              key={id}
              x={pos.x - NODE_W / 2}
              y={pos.y - NODE_H / 2}
              width={NODE_W}
              height={NODE_H}
            >
              <div style={{
                width: NODE_W,
                height: NODE_H,
                border: `1.5px solid ${color}`,
                borderRadius: "var(--radius-md)",
                background: "var(--color-bg-elevated)",
                padding: "8px 10px",
                display: "flex",
                flexDirection: "column",
                gap: 2,
                boxShadow: "var(--shadow-sm)",
                boxSizing: "border-box",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {node.agentName}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 9, color: "var(--color-text-tertiary)", flexShrink: 0 }}>
                    {duration}
                  </span>
                </div>
                <span style={{ fontSize: 10, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {node.instruction}
                </span>
              </div>
            </foreignObject>
          );
        })}
      </svg>
    </div>
  );
}
