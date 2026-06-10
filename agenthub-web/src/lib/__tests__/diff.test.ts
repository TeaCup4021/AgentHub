import { describe, expect, it } from "vitest";
import { compactDiffRows, computeSideBySideDiff, countDiffStats, computeDiff } from "../diff";

describe("computeSideBySideDiff", () => {
  it("pairs changed lines as modifications", () => {
    const rows = computeSideBySideDiff("const name = oldName;", "const name = newName;");

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("mod");
    expect(rows[0].old.type).toBe("mod");
    expect(rows[0].new.type).toBe("mod");
    expect(rows[0].old.segments.some((segment) => segment.changed && segment.text === "old")).toBe(true);
    expect(rows[0].new.segments.some((segment) => segment.changed && segment.text === "new")).toBe(true);
  });

  it("renders pure additions on the modified side", () => {
    const rows = computeSideBySideDiff("a", "a\nb");

    expect(rows.at(-1)?.kind).toBe("add");
    expect(rows.at(-1)?.old.type).toBe("empty");
    expect(rows.at(-1)?.new.text).toBe("b");
  });
});

describe("countDiffStats", () => {
  it("counts real added and removed lines", () => {
    const stats = countDiffStats(computeDiff("a\nb\nc", "a\nB\nc\nd"));

    expect(stats).toEqual({ added: 2, removed: 1 });
  });
});

describe("compactDiffRows", () => {
  it("folds long unchanged context runs", () => {
    const oldCode = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n");
    const newCode = oldCode;
    const rows = compactDiffRows(computeSideBySideDiff(oldCode, newCode), 3);

    expect(rows.some((row) => row.kind === "fold")).toBe(true);
  });
});
