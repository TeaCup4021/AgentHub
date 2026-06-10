import { describe, it, expect } from "vitest";
import { formatTime, formatFullTime } from "../formatTime";

describe("formatTime", () => {
  it("今天的消息应只显示时间", () => {
    const today = new Date();
    today.setHours(14, 30, 0, 0);
    const result = formatTime(today.toISOString());
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it("昨天的消息应显示 '昨天 HH:mm'", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60_000);
    yesterday.setHours(9, 15, 0, 0);
    const result = formatTime(yesterday.toISOString());
    expect(result).toMatch(/昨天 \d{2}:\d{2}/);
  });

  it("超过一周的消息应显示 'MM-DD HH:mm'", () => {
    const past = new Date(2026, 1, 15, 10, 0);
    const result = formatTime(past.toISOString());
    expect(result).toMatch(/02-15 \d{2}:\d{2}/);
  });

  it("跨越年份的消息同样显示 'MM-DD HH:mm'", () => {
    const past = new Date(2025, 0, 1, 8, 0);
    const result = formatTime(past.toISOString());
    expect(result).toMatch(/01-01 \d{2}:\d{2}/);
  });
});

describe("formatFullTime", () => {
  it("应返回完整的日期时间字符串", () => {
    const result = formatFullTime("2026-05-21T14:00:00Z");
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(5);
  });
});
