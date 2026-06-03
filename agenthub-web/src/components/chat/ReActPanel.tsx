import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Tooltip } from "@douyinfe/semi-ui";
import { IconClose, IconChevronDown, IconChevronUp } from "@douyinfe/semi-icons";
import { useChatStore } from "@/stores/chatStore";
import { DagGraph } from "./DagGraph";
import type { ThinkingStep } from "@/types";

const PHASE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  thought: { label: "思考", color: "#8b5cf6", bg: "rgba(139,92,246,0.08)" },
  action: { label: "行动", color: "#f5a623", bg: "rgba(245,166,35,0.08)" },
  observation: { label: "观察", color: "#00b578", bg: "rgba(0,181,120,0.08)" },
};

const STATUS_DOT: Record<string, string> = {
  pending: "var(--color-text-disabled)",
  running: "var(--color-warning)",
  done: "var(--color-success)",
  error: "var(--color-danger)",
};

function StepItem({ step, isLast }: { step: ThinkingStep; isLast: boolean }) {
  const cfg = PHASE_CONFIG[step.phase] ?? PHASE_CONFIG.thought;
  const dotColor = STATUS_DOT[step.status ?? "pending"];

  return (
    <div style={{ display: "flex", gap: 8, opacity: step.status === "done" ? 0.8 : 1 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: dotColor,
          boxShadow: step.status === "running" ? `0 0 6px ${dotColor}` : "none",
          transition: "box-shadow 0.3s ease",
          marginTop: 4,
        }} />
        {!isLast && <div style={{ width: 1, flex: 1, background: "var(--color-border-light)", marginTop: 4 }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            color: cfg.color,
            background: cfg.bg,
            borderRadius: 4,
            padding: "1px 6px",
            textTransform: "uppercase",
          }}>
            {cfg.label}
          </span>
          {step.toolName && (
            <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", fontFamily: "monospace" }}>
              {step.toolName}
            </span>
          )}
          {step.status === "running" && (
            <span style={{ fontSize: 10, color: "var(--color-warning)" }}>●</span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", lineHeight: 1.4 }}>
          {step.text}
        </p>
      </div>
    </div>
  );
}

export function ReActPanel() {
  const [pinned, setPinned] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<"react" | "dag">("react");
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const initialized = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const dagTaskId = useChatStore((s) => s.dagTaskId);

  const allSteps = useMemo(() => {
    const entries = Object.values(streamingContent);
    const steps: ThinkingStep[] = [];
    for (const entry of entries) {
      steps.push(...entry.thinkingSteps);
    }
    return steps;
  }, [streamingContent]);

  useEffect(() => {
    if (!initialized.current && panelRef.current) {
      requestAnimationFrame(() => {
        if (panelRef.current) {
          const rect = panelRef.current.getBoundingClientRect();
          setPos({ x: window.innerWidth - rect.width - 32, y: window.innerHeight - rect.height - 200 });
          initialized.current = true;
        }
      });
    }
  }, [allSteps.length > 0]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    if (!dragging.current) return;
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const visible = (allSteps.length > 0 || dagTaskId) && (pinned || isStreaming);
  const runningCount = allSteps.filter((s) => s.status === "running").length;

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        ref={panelRef}
        initial={false}
        animate={{ x: pos.x, y: pos.y, opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 340,
          maxHeight: collapsed ? 40 : 400,
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border-light)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          zIndex: 1000,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* 标题栏 */}
        <div
          onMouseDown={onMouseDown}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            cursor: "move",
            userSelect: "none",
            borderBottom: collapsed ? "none" : "1px solid var(--color-border-light)",
            background: "var(--color-bg-sidebar)",
          }}
        >
          <div style={{ display: "flex", gap: 0 }}>
            <div
              onClick={(e) => { e.stopPropagation(); setTab("react"); }}
              style={{
                fontSize: "var(--font-size-sm)",
                fontWeight: tab === "react" ? 600 : 400,
                color: tab === "react" ? "var(--color-primary)" : "var(--color-text-tertiary)",
                padding: "2px 8px",
                cursor: "pointer",
                borderRadius: "4px 0 0 4px",
                border: "1px solid var(--color-border-light)",
                borderRight: "none",
                background: tab === "react" ? "var(--color-primary-light)" : "transparent",
              }}
            >
              ReAct
            </div>
            {dagTaskId && (
              <div
                onClick={(e) => { e.stopPropagation(); setTab("dag"); }}
                style={{
                  fontSize: "var(--font-size-sm)",
                  fontWeight: tab === "dag" ? 600 : 400,
                  color: tab === "dag" ? "var(--color-primary)" : "var(--color-text-tertiary)",
                  padding: "2px 8px",
                  cursor: "pointer",
                  borderRadius: "0 4px 4px 0",
                  border: "1px solid var(--color-border-light)",
                  background: tab === "dag" ? "var(--color-primary-light)" : "transparent",
                }}
              >
                任务图
              </div>
            )}
          </div>
          {tab === "react" && runningCount > 0 && (
            <span style={{ fontSize: 10, color: "var(--color-warning)" }}>运行中 ({runningCount})</span>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
            <Tooltip content={collapsed ? "展开" : "收起"}>
              <Button
                size="small"
                theme="borderless"
                icon={collapsed ? <IconChevronDown /> : <IconChevronUp />}
                onClick={() => setCollapsed(!collapsed)}
              />
            </Tooltip>
            <Tooltip content={pinned ? "取消固定" : "固定面板"}>
              <Button
                size="small"
                theme="borderless"
                type={pinned ? "primary" : "tertiary"}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="17" x2="12" y2="22" />
                    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                  </svg>
                }
                onClick={() => setPinned(!pinned)}
              />
            </Tooltip>
            <Tooltip content="关闭">
              <Button
                size="small"
                theme="borderless"
                icon={<IconClose />}
                onClick={() => { setPinned(false); setCollapsed(false); }}
              />
            </Tooltip>
          </div>
        </div>

        {/* 内容区 */}
        {!collapsed && (
          <div style={{ flex: 1, overflowY: "auto", padding: tab === "dag" ? 0 : "10px 14px" }}>
            {tab === "dag" && dagTaskId ? (
              <DagGraph taskId={dagTaskId} />
            ) : (
              allSteps.map((step, i) => (
                <StepItem key={i} step={step} isLast={i === allSteps.length - 1} />
              ))
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
