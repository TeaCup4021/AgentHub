import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

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

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { data: { status: "building", logs: [] } } })),
    post: vi.fn(() => Promise.resolve({ data: { data: { status: "running", logs: [] } } })),
  },
}));

import { CardRenderer } from "../CardRenderer";
import type { Artifact } from "@/types";

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "art-1",
    artifactType: "code",
    title: "test.ts",
    content: { language: "ts", code: "const x = 1;" },
    version: 1,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderCard(element: ReactElement) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      {element}
    </QueryClientProvider>,
  );
}

describe("CardRenderer", () => {
  it("renders code artifacts", () => {
    const { container } = renderCard(<CardRenderer artifact={makeArtifact({ artifactType: "code" })} />);
    expect(container.querySelector('[class*="rounded-md"]')).toBeTruthy();
  });

  it("updates code card content when the artifact prop version changes", () => {
    const queryClient = new QueryClient();
    const first = makeArtifact({
      artifactType: "code",
      version: 1,
      content: { language: "ts", code: "const value = 'v1';", fileName: "demo.ts" },
    });
    const second = makeArtifact({
      artifactType: "code",
      version: 2,
      content: { language: "ts", code: "const value = 'v2';", fileName: "demo.ts" },
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <CardRenderer artifact={first} conversationId="conv-1" />
      </QueryClientProvider>,
    );

    expect(document.body.textContent).toContain("v1");
    rerender(
      <QueryClientProvider client={queryClient}>
        <CardRenderer artifact={second} conversationId="conv-1" />
      </QueryClientProvider>,
    );

    expect(document.body.textContent).toContain("v2");
    expect(document.body.textContent).not.toContain("v1");
  });

  it("renders diff artifacts", () => {
    const artifact = makeArtifact({
      artifactType: "diff",
      content: { language: "ts", oldCode: "a", newCode: "b" },
    });
    renderCard(<CardRenderer artifact={artifact} />);
    expect(screen.getByText("ts")).toBeInTheDocument();
  });

  it("renders deploy status artifacts", () => {
    renderCard(<CardRenderer artifact={makeArtifact({
      artifactType: "deploy_status",
      content: { status: "building", deploymentId: "dep-1" },
    })} />);
    expect(screen.getByText("部署中")).toBeInTheDocument();
  });

  it("renders pptx document artifacts as a download card", () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      headers: { get: () => "application/pdf" },
      blob: () => Promise.resolve(new Blob(["%PDF-1.4"], { type: "application/pdf" })),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = renderCard(<CardRenderer artifact={makeArtifact({
      artifactType: "document",
      title: "AgentHub_Presentation.pptx",
      content: {
        fileName: "AgentHub_Presentation.pptx",
        fileUrl: "/api/v1/files/demo/download",
        fileType: "pptx",
        fileSize: 56739,
        previewUrl: "/api/v1/files/demo/preview",
      },
    })} />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector("iframe")).not.toBeInTheDocument();
    expect(screen.getByTestId("document-download-fallback")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下载" })).toBeInTheDocument();
    expect(screen.getAllByText("AgentHub_Presentation.pptx").length).toBeGreaterThan(0);
  });

  it("previews pdf document artifacts inline", () => {
    const { container } = renderCard(<CardRenderer artifact={makeArtifact({
      artifactType: "document",
      title: "AgentHub_Presentation.pdf",
      content: {
        fileName: "AgentHub_Presentation.pdf",
        fileUrl: "/api/v1/files/demo/download",
        fileType: "pdf",
        fileSize: 56739,
      },
    })} />);

    expect(container.querySelector("iframe")).toHaveAttribute("src", "/api/v1/files/demo/download");
    expect(screen.queryByTestId("document-download-fallback")).not.toBeInTheDocument();
    expect(screen.getByLabelText("下载文档")).toBeInTheDocument();
    expect(screen.getByLabelText("放大预览")).toBeInTheDocument();
  });

  it("returns empty output for unknown artifact types", () => {
    const { container } = renderCard(<CardRenderer artifact={makeArtifact({
      artifactType: "unknown_type" as "code",
    })} />);
    expect(container.querySelector('[class*="card"]')).toBeFalsy();
  });
});
