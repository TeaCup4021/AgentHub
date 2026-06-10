import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Spin, Toast } from "@douyinfe/semi-ui";
import {
  IconBolt,
  IconClear,
  IconDownload,
  IconExternalOpen,
  IconPlayCircle,
  IconStop,
  IconTickCircle,
} from "@douyinfe/semi-icons";
import type { Artifact, DeployStatusArtifactContent } from "@/types";
import { useResizable } from "@/hooks/useResizable";
import api from "@/lib/api";

interface DeployStatusCardProps {
  artifact: Artifact;
  convId?: string;
  conversationId?: string;
}

interface SourceSummary {
  fileCount?: number;
  totalBytes?: number;
  entryFile?: string;
  files?: string[];
}

interface DeployContent extends DeployStatusArtifactContent {
  target?: "preview" | "static_site" | "container" | "source_package";
  downloadUrl?: string;
  sourceSummary?: SourceSummary;
  runtimeMeta?: Record<string, unknown>;
  logs?: string[];
}

interface DeploymentStatusPayload {
  status: string;
  url?: string | null;
  downloadUrl?: string | null;
  download_url?: string | null;
  uptimeSeconds?: number;
  uptime_seconds?: number;
  logs?: string[];
  error?: string | null;
  deployment?: {
    id: string;
    status?: string;
    target?: string;
    url?: string | null;
    downloadUrl?: string | null;
    download_url?: string | null;
    sourceSummary?: SourceSummary;
    source_summary?: SourceSummary;
    runtimeMeta?: Record<string, unknown>;
    runtime_meta?: Record<string, unknown>;
    logs?: string[];
    error?: string | null;
  };
}

const DEFAULT_HEIGHT = 260;

const actionLabels: Record<string, string> = {
  preview: "生成预览",
  static_site: "静态站点",
  container: "容器部署",
  source_package: "源码打包",
};

export function DeployStatusCard({ artifact }: DeployStatusCardProps) {
  const c = artifact.content as unknown as DeployContent;
  const { cardRef, resizeRef, sizeLabelRef, resetSize } = useResizable({ defaultHeight: DEFAULT_HEIGHT });

  const [deploymentId] = useState<string | null>(
    typeof c.deploymentId === "string" ? c.deploymentId : null,
  );
  const [status, setStatus] = useState<string>(c.status || "ready");
  const [target, setTarget] = useState<string>(c.target || "preview");
  const [url, setUrl] = useState<string>(c.url || "");
  const [downloadUrl, setDownloadUrl] = useState<string>(c.downloadUrl || "");
  const [logs, setLogs] = useState<string[]>(Array.isArray(c.logs) ? c.logs : []);
  const [error, setError] = useState<string>(c.error || "");
  const [uptime, setUptime] = useState<number>(0);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [sourceSummary, setSourceSummary] = useState<SourceSummary | undefined>(c.sourceSummary);
  const [runtimeMeta, setRuntimeMeta] = useState<Record<string, unknown>>(c.runtimeMeta || {});

  const cfg = useMemo(() => {
    const configs = {
      ready: {
        icon: <IconPlayCircle style={{ color: "var(--color-primary)" }} />,
        text: "准备部署",
        badge: "READY",
        badgeColor: "blue" as const,
      },
      building: {
        icon: <Spin size="small" />,
        text: "部署中",
        badge: "BUILDING",
        badgeColor: "orange" as const,
      },
      packaged: {
        icon: <IconTickCircle style={{ color: "var(--color-success)" }} />,
        text: "源码包已生成",
        badge: "PACKAGED",
        badgeColor: "green" as const,
      },
      deployed: {
        icon: <IconTickCircle style={{ color: "var(--color-success)" }} />,
        text: "部署成功",
        badge: "LIVE",
        badgeColor: "green" as const,
      },
      running: {
        icon: <IconTickCircle style={{ color: "var(--color-success)" }} />,
        text: "运行中",
        badge: "RUNNING",
        badgeColor: "green" as const,
      },
      stopped: {
        icon: <IconClear style={{ color: "var(--color-text-tertiary)" }} />,
        text: "已停止",
        badge: "STOPPED",
        badgeColor: "grey" as const,
      },
      failed: {
        icon: <IconClear style={{ color: "var(--color-danger)" }} />,
        text: "部署失败",
        badge: "FAILED",
        badgeColor: "red" as const,
      },
    };
    return configs[status as keyof typeof configs] ?? configs.ready;
  }, [status]);

  const badgeStyle = useMemo(() => {
    const colors = {
      green: ["rgba(31,191,117,0.1)", "var(--color-success)"],
      red: ["rgba(245,79,79,0.1)", "var(--color-danger)"],
      orange: ["rgba(240,160,48,0.1)", "var(--color-warning)"],
      blue: ["rgba(64,158,255,0.1)", "var(--color-primary)"],
      grey: ["rgba(128,128,128,0.1)", "var(--color-text-tertiary)"],
    }[cfg.badgeColor];
    return {
      background: colors[0],
      color: colors[1],
    };
  }, [cfg.badgeColor]);

  const applyStatus = useCallback((payload: DeploymentStatusPayload) => {
    const deployment = payload.deployment;
    setStatus(payload.status || deployment?.status || "ready");
    setTarget((current) => deployment?.target || current);
    setUrl((payload.url || deployment?.url || "") ?? "");
    setDownloadUrl(
      (payload.downloadUrl || payload.download_url || deployment?.downloadUrl || deployment?.download_url || "") ?? "",
    );
    setLogs(payload.logs || deployment?.logs || []);
    setError((payload.error || deployment?.error || "") ?? "");
    setUptime(payload.uptimeSeconds ?? payload.uptime_seconds ?? 0);
    setSourceSummary((current) => deployment?.sourceSummary || deployment?.source_summary || current);
    setRuntimeMeta((current) => deployment?.runtimeMeta || deployment?.runtime_meta || current);
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!deploymentId) return;
    const resp = await api.get(`/deployments/${deploymentId}`);
    applyStatus(resp.data.data);
  }, [applyStatus, deploymentId]);

  useEffect(() => {
    void fetchStatus();
    if (!deploymentId) return;
    const interval = setInterval(() => void fetchStatus(), 5000);
    return () => clearInterval(interval);
  }, [deploymentId, fetchStatus]);

  const runAction = useCallback(async (nextTarget: string) => {
    if (!deploymentId || runningAction) return;
    setRunningAction(nextTarget);
    setStatus("building");
    setTarget(nextTarget);
    try {
      const resp = await api.post(`/deployments/${deploymentId}/actions/${nextTarget}`, {});
      const deployment = resp.data.data;
      applyStatus({
        status: deployment.status,
        url: deployment.url,
        downloadUrl: deployment.downloadUrl ?? deployment.download_url,
        logs: deployment.logs,
        error: deployment.error,
        deployment,
      });
      if (deployment.status === "failed") {
        Toast.error(deployment.error || `${actionLabels[nextTarget] || "部署动作"}失败`);
      } else {
        Toast.success(`${actionLabels[nextTarget] || "部署动作"}完成`);
      }
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || "部署动作失败";
      setStatus("failed");
      setError(message);
      Toast.error(message);
    } finally {
      setRunningAction(null);
    }
  }, [applyStatus, deploymentId, runningAction]);

  const stopDeployment = useCallback(async () => {
    if (!deploymentId) return;
    try {
      await api.post(`/deployments/${deploymentId}/stop`);
      setStatus("stopped");
      Toast.success("部署已停止");
    } catch (err: any) {
      Toast.error(err.response?.data?.message || "停止失败");
    }
  }, [deploymentId]);

  const formatUptime = (seconds: number) => {
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    return `${hours}小时 ${minutes % 60}分钟`;
  };

  const fileCount = sourceSummary?.fileCount ?? sourceSummary?.files?.length ?? 0;
  const latestLogs = logs.slice(-3);
  const runtimeText = [
    runtimeMeta.mode ? String(runtimeMeta.mode) : null,
    runtimeMeta.imageTag ? `image: ${String(runtimeMeta.imageTag)}` : null,
    runtimeMeta.hostPort ? `port: ${String(runtimeMeta.hostPort)}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div ref={cardRef} className="artifact-card" style={{ height: DEFAULT_HEIGHT }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px", borderBottom: "1px solid var(--color-card-border)",
          flexShrink: 0, background: "var(--color-bg-elevated)",
        }}
      >
        <IconBolt style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
        <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)" }}>
          部署状态
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "1.5px 7px", borderRadius: 10, textTransform: "uppercase",
          ...badgeStyle,
        }}>
          {cfg.badge}
        </span>
        <div style={{ flex: 1 }} />
        <span ref={sizeLabelRef} className="artifact-card__size-label" />
        <button className="artifact-card__reset" onClick={resetSize} title="恢复默认大小">
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </button>
      </div>

      <div className="artifact-card__body" style={{
        flex: 1, display: "flex", flexDirection: "column", padding: 16, gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 24, lineHeight: 1 }}>{cfg.icon}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{cfg.text}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>
              {fileCount > 0 ? `${fileCount} 个文件` : "等待源码"} · {actionLabels[target] || target}
              {uptime > 0 && (status === "running" || status === "deployed") ? ` · ${formatUptime(uptime)}` : ""}
            </div>
            {runtimeText && (
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                {runtimeText}
              </div>
            )}
          </div>
        </div>

        {(url || downloadUrl) && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {url && (
              <Button
                icon={<IconExternalOpen />}
                theme="solid"
                size="small"
                onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
                style={{ fontSize: 12 }}
              >
                打开预览
              </Button>
            )}
            {downloadUrl && (
              <Button
                icon={<IconDownload />}
                size="small"
                onClick={() => window.open(downloadUrl, "_blank", "noopener,noreferrer")}
                style={{ fontSize: 12 }}
              >
                下载源码包
              </Button>
            )}
          </div>
        )}

        {error && status === "failed" && (
          <div style={{ fontSize: 11, color: "var(--color-danger)" }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
          <Button size="small" loading={runningAction === "preview"} onClick={() => runAction("preview")}>
            预览 URL
          </Button>
          <Button size="small" loading={runningAction === "static_site"} onClick={() => runAction("static_site")}>
            静态站点
          </Button>
          <Button size="small" loading={runningAction === "container"} onClick={() => runAction("container")}>
            容器化
          </Button>
          <Button size="small" loading={runningAction === "source_package"} onClick={() => runAction("source_package")}>
            源码包
          </Button>
          {(status === "running" || status === "deployed") && (
            <Button icon={<IconStop />} theme="borderless" type="danger" size="small" onClick={stopDeployment}>
              停止
            </Button>
          )}
        </div>

        {latestLogs.length > 0 && (
          <div style={{
            marginTop: "auto", fontSize: 11, color: "var(--color-text-tertiary)",
            borderTop: "1px solid var(--color-card-border)", paddingTop: 8,
          }}>
            {latestLogs.map((line, index) => (
              <div key={`${line}-${index}`} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      <div ref={resizeRef} className="artifact-card__resize" title="拖拽调整大小">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round">
          <line x1={19} y1={5} x2={5} y2={19} /><line x1={19} y1={11} x2={11} y2={19} /><line x1={19} y1={17} x2={17} y2={19} />
        </svg>
      </div>
    </div>
  );
}
