import { describe, it, expect } from "vitest";
import { applySnippet, findApplyTarget, type CodeCandidate } from "../diffApply";

const QS = `def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)`;

function makeCandidate(over: Partial<CodeCandidate> = {}): CodeCandidate {
  return {
    id: "art-1",
    fileName: "quicksort.py",
    language: "python",
    code: QS,
    persistable: true,
    ...over,
  };
}

describe("applySnippet", () => {
  it("替换精确匹配的子串", () => {
    const out = applySnippet("a\nb\nc", "b", "B");
    expect(out).toBe("a\nB\nc");
  });

  it("空白容错：忽略首行缩进/行尾空格做整行匹配", () => {
    const old = "left = [x for x in arr if x < pivot]"; // 无前导缩进
    const next = "left = [y for y in arr if y < pivot]";
    const out = applySnippet(QS, old, next);
    expect(out).not.toBeNull();
    expect(out).toContain("[y for y in arr if y < pivot]");
    // 其余行保持不变
    expect(out).toContain("def quicksort(arr):");
    expect(out).toContain("right = [x for x in arr if x > pivot]");
  });

  it("CRLF 归一化后仍能匹配", () => {
    const src = "x = 1\r\ny = 2";
    const out = applySnippet(src, "y = 2", "y = 3");
    expect(out).toBe("x = 1\ny = 3");
  });

  it("片段不存在时返回 null", () => {
    expect(applySnippet(QS, "no_such_line()", "x")).toBeNull();
  });

  it("空片段返回 null", () => {
    expect(applySnippet(QS, "   ", "x")).toBeNull();
  });
});

describe("findApplyTarget", () => {
  it("无候选卡 → no-candidates", () => {
    const r = findApplyTarget({ oldCode: "a", newCode: "b" }, []);
    expect(r).toEqual({ error: "no-candidates" });
  });

  it("按内容匹配（无文件名）→ content-snippet", () => {
    const cand = makeCandidate({ fileName: undefined });
    const r = findApplyTarget(
      {
        oldCode: "    pivot = arr[len(arr) // 2]",
        newCode: "    pivot = arr[0]",
      },
      [cand],
    );
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.matchType).toBe("content-snippet");
      expect(r.target.id).toBe("art-1");
      expect(r.newFullCode).toContain("pivot = arr[0]");
      expect(r.newFullCode).not.toContain("arr[len(arr) // 2]");
    }
  });

  it("文件名匹配 + 片段定位 → filename-snippet", () => {
    const r = findApplyTarget(
      {
        fileName: "quicksort.py",
        oldCode: "    return arr",
        newCode: "    return list(arr)",
      },
      [makeCandidate()],
    );
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.matchType).toBe("filename-snippet");
      expect(r.newFullCode).toContain("return list(arr)");
    }
  });

  it("文件名匹配但片段定位不到 → filename-full（整体替换）", () => {
    const r = findApplyTarget(
      {
        fileName: "quicksort.py",
        oldCode: "完全对不上的旧片段",
        newCode: "def quicksort(arr):\n    return sorted(arr)",
      },
      [makeCandidate()],
    );
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.matchType).toBe("filename-full");
      expect(r.newFullCode).toBe("def quicksort(arr):\n    return sorted(arr)");
    }
  });

  it("文件名与片段都对不上 → no-match", () => {
    const r = findApplyTarget(
      { fileName: "other.py", oldCode: "对不上", newCode: "" },
      [makeCandidate()],
    );
    expect(r).toEqual({ error: "no-match" });
  });

  it("多张同名卡时，最新（数组靠前）优先命中", () => {
    const newer = makeCandidate({ id: "art-new", code: QS.replace("return arr", "return arr  # newer") });
    const older = makeCandidate({ id: "art-old" });
    const r = findApplyTarget(
      { fileName: "quicksort.py", oldCode: "    pivot = arr[len(arr) // 2]", newCode: "    pivot = arr[-1]" },
      [newer, older], // newest-first
    );
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.target.id).toBe("art-new");
    }
  });
});
