import { describe, expect, it } from "vitest";
import { redactSensitiveText } from "../redactSensitiveText";

describe("redactSensitiveText", () => {
  it("redacts apiKey assignment while keeping surrounding config", () => {
    const text = "apiKey is demo-api-key-84ae07b4c0324962b85239e478f67d12, baseUrl is https://api.deepseek.com/anthropic";
    expect(redactSensitiveText(text)).toBe(
      "apiKey is demo-ap...7d12, baseUrl is https://api.deepseek.com/anthropic",
    );
  });

  it("redacts short apiKey assignment", () => {
    expect(redactSensitiveText("apiKey is demo-api-key-1234567890abcdef")).toBe("apiKey is demo-ap...cdef");
  });
});
