/**
 * 格式化时间为相对时间描述
 */
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;
  return date.toLocaleDateString("zh-CN");
}

/**
 * 截断字符串
 */
export function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len) + "...";
}

/**
 * 生成唯一 ID（用于乐观更新）
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Agent 头像柔和色盘 — 按名称 hash 分配固定颜色
 */
const AGENT_COLORS = [
  "#5b7aad",
  "#6b9b7a",
  "#b08968",
  "#8b7eac",
  "#c47e6e",
  "#788c9e",
];

/**
 * Normalize REST API artifact from snake_case to camelCase.
 * SSE artifacts pass through unchanged (already camelCase).
 */
export function normalizeArtifact(raw: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    normalized[camelKey] = value;
  }

  if (!normalized.id) {
    normalized.id = `artifact-${normalized.createdAt || Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  return normalized;
}

export function getAgentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
}
