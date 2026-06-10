import { useMemo } from "react";
import {
  compactDiffRows,
  computeSideBySideDiff,
  countDiffStats,
  computeDiff,
  type DiffCell,
  type DiffDisplayRow,
} from "@/lib/diff";

interface SideBySideDiffViewerProps {
  oldCode: string;
  newCode: string;
  contextLines?: number;
  compact?: boolean;
}

export function getDiffStats(oldCode: string, newCode: string) {
  return countDiffStats(computeDiff(oldCode, newCode));
}

function cellClassName(side: "old" | "new", cell: DiffCell) {
  return [
    "side-by-side-diff__cell",
    `side-by-side-diff__cell--${side}`,
    `side-by-side-diff__cell--${cell.type}`,
  ].join(" ");
}

function renderCell(side: "old" | "new", cell: DiffCell) {
  const changedClass = side === "old"
    ? "side-by-side-diff__segment--removed"
    : "side-by-side-diff__segment--added";

  return (
    <div className={cellClassName(side, cell)}>
      <span className="side-by-side-diff__line-number">
        {cell.lineNumber ?? ""}
      </span>
      <span className="side-by-side-diff__marker">{cell.marker}</span>
      <code className="side-by-side-diff__code">
        {cell.segments.length > 0
          ? cell.segments.map((segment, index) => (
              <span
                key={`${index}-${segment.text}`}
                className={segment.changed ? changedClass : undefined}
              >
                {segment.text}
              </span>
            ))
          : "\u00a0"}
      </code>
    </div>
  );
}

function renderRow(row: DiffDisplayRow, index: number) {
  if (row.kind === "fold") {
    return (
      <div
        key={`fold-${index}-${row.oldStart ?? 0}-${row.newStart ?? 0}`}
        className="side-by-side-diff__fold"
      >
        <span>{`... skipped ${row.skipped} unchanged lines ...`}</span>
      </div>
    );
  }

  return (
    <div key={`row-${index}-${row.old.lineNumber ?? "x"}-${row.new.lineNumber ?? "x"}`} className="side-by-side-diff__row">
      {renderCell("old", row.old)}
      {renderCell("new", row.new)}
    </div>
  );
}

export function SideBySideDiffViewer({
  oldCode,
  newCode,
  contextLines = 4,
  compact = true,
}: SideBySideDiffViewerProps) {
  const rows = useMemo(() => {
    const nextRows = computeSideBySideDiff(oldCode, newCode);
    return compact ? compactDiffRows(nextRows, contextLines) : nextRows;
  }, [oldCode, newCode, compact, contextLines]);

  return (
    <div className="side-by-side-diff" data-testid="side-by-side-diff-viewer">
      <div className="side-by-side-diff__header">
        <div className="side-by-side-diff__pane-title side-by-side-diff__pane-title--old">
          源代码
        </div>
        <div className="side-by-side-diff__pane-title side-by-side-diff__pane-title--new">
          修改后
        </div>
      </div>
      <div className="side-by-side-diff__rows">
        {rows.length > 0 ? renderRowList(rows) : (
          <div className="side-by-side-diff__empty">No code to compare</div>
        )}
      </div>
    </div>
  );
}

function renderRowList(rows: DiffDisplayRow[]) {
  return rows.map(renderRow);
}
