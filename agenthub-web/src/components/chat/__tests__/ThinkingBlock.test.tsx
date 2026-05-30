import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ThinkingBlock } from "../ThinkingBlock";
import type { ThinkingStep } from "@/types";

describe("ThinkingBlock", () => {
  it("非空步骤列表应渲染容器", () => {
    const steps: ThinkingStep[] = [
      { phase: "thought", text: "分析需求", status: "done" },
      { phase: "action", text: "生成代码", toolName: "code_generator", status: "running" },
    ];
    const { container } = render(<ThinkingBlock steps={steps} />);
    expect(container.querySelector('[class*="semi-collapse"]')).toBeTruthy();
  });

  it("空步骤数组应正常渲染不崩溃", () => {
    const { container } = render(<ThinkingBlock steps={[]} />);
    expect(container).toBeTruthy();
  });

  it("isStreaming 时应正常渲染", () => {
    const steps: ThinkingStep[] = [
      { phase: "thought", text: "思考中", status: "running" },
    ];
    const { container } = render(<ThinkingBlock steps={steps} isStreaming />);
    expect(container.querySelector('[class*="semi-collapse"]')).toBeTruthy();
  });
});
