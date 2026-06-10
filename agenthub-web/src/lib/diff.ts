export interface DiffLine {
  type: "add" | "del" | "ctx";
  oldLn?: number;
  newLn?: number;
  text: string;
}

export interface DiffTextSegment {
  text: string;
  changed: boolean;
}

export type DiffCellType = "ctx" | "add" | "del" | "mod" | "empty";

export interface DiffCell {
  type: DiffCellType;
  lineNumber?: number;
  marker: "" | "+" | "-";
  text: string;
  segments: DiffTextSegment[];
}

export interface SideBySideDiffRow {
  kind: "ctx" | "add" | "del" | "mod";
  old: DiffCell;
  new: DiffCell;
}

export interface FoldedDiffContextRow {
  kind: "fold";
  skipped: number;
  oldStart?: number;
  newStart?: number;
}

export type DiffDisplayRow = SideBySideDiffRow | FoldedDiffContextRow;

export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: "ctx", oldLn: i, newLn: j, text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "add", newLn: j, text: newLines[j - 1] });
      j--;
    } else {
      result.push({ type: "del", oldLn: i, text: oldLines[i - 1] });
      i--;
    }
  }

  result.reverse();
  return result;
}

export function countDiffStats(diff: DiffLine[]) {
  let added = 0;
  let removed = 0;
  for (const line of diff) {
    if (line.type === "add") added++;
    else if (line.type === "del") removed++;
  }
  return { added, removed };
}

function unchangedSegments(text: string): DiffTextSegment[] {
  return text ? [{ text, changed: false }] : [];
}

function changedSegments(text: string): DiffTextSegment[] {
  return text ? [{ text, changed: true }] : [];
}

function buildInlineSegments(oldText: string, newText: string) {
  if (oldText === newText) {
    return {
      oldSegments: unchangedSegments(oldText),
      newSegments: unchangedSegments(newText),
    };
  }

  let prefix = 0;
  while (
    prefix < oldText.length &&
    prefix < newText.length &&
    oldText[prefix] === newText[prefix]
  ) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < oldText.length - prefix &&
    suffix < newText.length - prefix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix++;
  }

  const oldMiddleEnd = oldText.length - suffix;
  const newMiddleEnd = newText.length - suffix;

  const oldSegments: DiffTextSegment[] = [];
  const newSegments: DiffTextSegment[] = [];

  if (prefix > 0) {
    oldSegments.push({ text: oldText.slice(0, prefix), changed: false });
    newSegments.push({ text: newText.slice(0, prefix), changed: false });
  }

  const oldChanged = oldText.slice(prefix, oldMiddleEnd);
  const newChanged = newText.slice(prefix, newMiddleEnd);
  if (oldChanged) oldSegments.push({ text: oldChanged, changed: true });
  if (newChanged) newSegments.push({ text: newChanged, changed: true });

  if (suffix > 0) {
    oldSegments.push({ text: oldText.slice(oldMiddleEnd), changed: false });
    newSegments.push({ text: newText.slice(newMiddleEnd), changed: false });
  }

  return { oldSegments, newSegments };
}

function emptyCell(): DiffCell {
  return {
    type: "empty",
    marker: "",
    text: "",
    segments: [],
  };
}

function contextCell(line: DiffLine): DiffCell {
  return {
    type: "ctx",
    lineNumber: line.oldLn ?? line.newLn,
    marker: "",
    text: line.text,
    segments: unchangedSegments(line.text),
  };
}

function changedCell(type: "add" | "del", line: DiffLine): DiffCell {
  return {
    type,
    lineNumber: type === "add" ? line.newLn : line.oldLn,
    marker: type === "add" ? "+" : "-",
    text: line.text,
    segments: changedSegments(line.text),
  };
}

function modifiedCells(oldLine: DiffLine, newLine: DiffLine) {
  const { oldSegments, newSegments } = buildInlineSegments(oldLine.text, newLine.text);
  return {
    old: {
      type: "mod" as const,
      lineNumber: oldLine.oldLn,
      marker: "-" as const,
      text: oldLine.text,
      segments: oldSegments,
    },
    new: {
      type: "mod" as const,
      lineNumber: newLine.newLn,
      marker: "+" as const,
      text: newLine.text,
      segments: newSegments,
    },
  };
}

export function computeSideBySideDiff(oldText: string, newText: string): SideBySideDiffRow[] {
  const diff = computeDiff(oldText, newText);
  const rows: SideBySideDiffRow[] = [];

  for (let i = 0; i < diff.length;) {
    const current = diff[i];

    if (current.type === "ctx") {
      const oldCell = contextCell(current);
      rows.push({
        kind: "ctx",
        old: oldCell,
        new: { ...oldCell, lineNumber: current.newLn },
      });
      i++;
      continue;
    }

    if (current.type === "del") {
      const deleted: DiffLine[] = [];
      const added: DiffLine[] = [];
      while (diff[i]?.type === "del") {
        deleted.push(diff[i]);
        i++;
      }
      while (diff[i]?.type === "add") {
        added.push(diff[i]);
        i++;
      }

      const pairCount = Math.max(deleted.length, added.length);
      for (let j = 0; j < pairCount; j++) {
        const oldLine = deleted[j];
        const newLine = added[j];
        if (oldLine && newLine) {
          const cells = modifiedCells(oldLine, newLine);
          rows.push({ kind: "mod", old: cells.old, new: cells.new });
        } else if (oldLine) {
          rows.push({ kind: "del", old: changedCell("del", oldLine), new: emptyCell() });
        } else if (newLine) {
          rows.push({ kind: "add", old: emptyCell(), new: changedCell("add", newLine) });
        }
      }
      continue;
    }

    const added: DiffLine[] = [];
    while (diff[i]?.type === "add") {
      added.push(diff[i]);
      i++;
    }
    for (const line of added) {
      rows.push({ kind: "add", old: emptyCell(), new: changedCell("add", line) });
    }
  }

  return rows;
}

export function compactDiffRows(rows: SideBySideDiffRow[], contextLines = 4): DiffDisplayRow[] {
  const minFoldSize = contextLines * 2 + 5;
  const out: DiffDisplayRow[] = [];

  for (let i = 0; i < rows.length;) {
    if (rows[i].kind !== "ctx") {
      out.push(rows[i]);
      i++;
      continue;
    }

    const start = i;
    while (i < rows.length && rows[i].kind === "ctx") i++;
    const run = rows.slice(start, i);

    if (run.length < minFoldSize) {
      out.push(...run);
      continue;
    }

    out.push(...run.slice(0, contextLines));
    out.push({
      kind: "fold",
      skipped: run.length - contextLines * 2,
      oldStart: run[contextLines].old.lineNumber,
      newStart: run[contextLines].new.lineNumber,
    });
    out.push(...run.slice(-contextLines));
  }

  return out;
}
