import { describe, it, expect, vi, afterEach } from "vitest";
import { formatRelativeTime, truncate, generateId, formatFileSize } from "../utils";

describe("formatRelativeTime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("应返回 '刚刚' 对于 30 秒前", () => {
    const thirtySecAgo = new Date(Date.now() - 30_000).toISOString();
    expect(formatRelativeTime(thirtySecAgo)).toBe("刚刚");
  });

  it("应返回 'N分钟前' 对于分钟级别", () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(formatRelativeTime(tenMinAgo)).toBe("10分钟前");
  });

  it("应返回 'N小时前' 对于小时级别", () => {
    const threeHourAgo = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(threeHourAgo)).toBe("3小时前");
  });

  it("应返回 'N天前' 对于天级别", () => {
    const twoDayAgo = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(twoDayAgo)).toBe("2天前");
  });

  it("超过 7 天应返回中文日期格式", () => {
    const tenDayAgo = new Date(Date.now() - 10 * 24 * 60 * 60_000).toISOString();
    const result = formatRelativeTime(tenDayAgo);
    expect(result).toMatch(/^\d{4}\/\d{1,2}\/\d{1,2}$/);
  });
});

describe("truncate", () => {
  it("短于限制长度的字符串原样返回", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("超过限制长度应截断并追加 ...", () => {
    expect(truncate("hello world this is long", 12)).toBe("hello world ...");
  });
});

describe("generateId", () => {
  it("每次调用应生成不同 ID", () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
  });

  it("应返回非空字符串", () => {
    expect(generateId().length).toBeGreaterThan(0);
  });
});

describe("formatFileSize", () => {
  it("小于 1KB 应显示 B", () => {
    expect(formatFileSize(500)).toBe("500B");
  });

  it("1KB-1MB 应显示 KB", () => {
    expect(formatFileSize(1536)).toBe("1.5KB");
  });

  it("超过 1MB 应显示 MB", () => {
    expect(formatFileSize(2_097_152)).toBe("2.0MB");
  });
});
