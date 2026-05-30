import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("shiki/core", () => ({
  createHighlighterCore: () => Promise.resolve({
    getLoadedLanguages: () => ["ts", "tsx", "js", "python", "sql"],
    codeToHtml: (code: string) => `<pre><code>${code}</code></pre>`,
  }),
}));

vi.mock("shiki/themes/dark-plus.mjs", () => ({ default: {} }));
vi.mock("shiki/engine/javascript", () => ({
  createJavaScriptRegexEngine: () => ({}),
}));

vi.mock("shiki/langs/typescript.mjs", () => ({ default: {} }));
vi.mock("shiki/langs/tsx.mjs", () => ({ default: {} }));
vi.mock("shiki/langs/javascript.mjs", () => ({ default: {} }));
vi.mock("shiki/langs/jsx.mjs", () => ({ default: {} }));
vi.mock("shiki/langs/python.mjs", () => ({ default: {} }));
vi.mock("shiki/langs/rust.mjs", () => ({ default: {} }));
vi.mock("shiki/langs/go.mjs", () => ({ default: {} }));
vi.mock("shiki/langs/java.mjs", () => ({ default: {} }));
vi.mock("shiki/langs/css.mjs", () => ({ default: {} }));
vi.mock("shiki/langs/html.mjs", () => ({ default: {} }));
vi.mock("shiki/langs/json.mjs", () => ({ default: {} }));
vi.mock("shiki/langs/yaml.mjs", () => ({ default: {} }));
vi.mock("shiki/langs/bash.mjs", () => ({ default: {} }));
vi.mock("shiki/langs/markdown.mjs", () => ({ default: {} }));
vi.mock("shiki/langs/sql.mjs", () => ({ default: {} }));
vi.mock("shiki/langs/diff.mjs", () => ({ default: {} }));

import { CardRenderer } from "../CardRenderer";
import type { Artifact } from "@/types";

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "art-1", artifactType: "code", title: "test.ts",
    content: { language: "ts", code: "const x=1;" },
    version: 1, createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("CardRenderer", () => {
  it("code artifactType 应渲染代码块", async () => {
    const { container } = render(<CardRenderer artifact={makeArtifact({ artifactType: "code" })} />);
    expect(container.querySelector('[class*="rounded-md"]')).toBeTruthy();
  });

  it("diff artifactType 应渲染差异卡片", () => {
    const artifact = makeArtifact({
      artifactType: "diff",
      content: { language: "ts", oldCode: "a", newCode: "b" },
    });
    render(<CardRenderer artifact={artifact} />);
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.getByText("−1")).toBeInTheDocument();
  });

  it("deploy_status building 应显示构建中", () => {
    render(<CardRenderer artifact={makeArtifact({
      artifactType: "deploy_status",
      content: { status: "building" },
    })} />);
    expect(screen.getByText("构建中...")).toBeInTheDocument();
  });

  it("未知 artifactType 应返回空", () => {
    const { container } = render(<CardRenderer artifact={makeArtifact({
      artifactType: "unknown_type" as "code",
    })} />);
    expect(container.querySelector('[class*="card"]')).toBeFalsy();
  });
});
