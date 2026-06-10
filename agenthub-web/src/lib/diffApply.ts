/**
 * Apply a diff artifact back onto its source code card.
 *
 * Selection-level rewrites produce a `diff` artifact whose `oldCode` is the
 * snippet the user selected and `newCode` is the agent's revision. To "apply"
 * it we must (1) figure out which existing code card it came from, then
 * (2) splice the new snippet into that card's full code. The diff carries no
 * source artifact id (the agent never sees ours), so matching is heuristic:
 *
 *   1. By file name — when the diff has a `fileName`, prefer code cards with
 *      the same name.
 *   2. By snippet content — find a card whose code actually contains `oldCode`
 *      (exact, then whitespace-tolerant). This is the strongest signal and the
 *      only one available for snippet diffs with no file name.
 *
 * Everything here is pure so it can be unit-tested without React/the cache.
 */

/** A code artifact in the conversation that a diff could be applied to. */
export interface CodeCandidate {
  id: string;
  fileName?: string;
  language?: string;
  code: string;
  /** Whether this card has a DB row (only persistable cards can be written back). */
  persistable: boolean;
}

export interface DiffApplyInput {
  fileName?: string;
  oldCode: string;
  newCode: string;
}

export type DiffMatchType =
  | "filename-snippet" // matched by file name, spliced a snippet
  | "filename-full" // matched by file name, replaced whole file (snippet not located)
  | "content-snippet"; // matched purely by snippet content

export interface DiffApplyResult {
  target: CodeCandidate;
  newFullCode: string;
  matchType: DiffMatchType;
}

export interface DiffDisplayResolution {
  oldCode: string;
  newCode: string;
  target?: CodeCandidate;
  expanded: boolean;
  matchType?: DiffMatchType | "reverse-snippet";
}

export type DiffApplyFailure =
  | "no-candidates" // conversation has no code cards at all
  | "no-match"; // no code card matches by name or snippet content

function normalize(s: string): string {
  return (s ?? "").replace(/\r\n/g, "\n");
}

/** Drop blank leading/trailing lines and trailing whitespace per line. */
function trimSnippetLines(lines: string[]): string[] {
  const out = lines.map((l) => l.replace(/\s+$/, ""));
  while (out.length && out[0] === "") out.shift();
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

/**
 * Splice `newSnippet` in place of `oldSnippet` inside `source`. Tries an exact
 * substring match first, then falls back to a whitespace-tolerant line match
 * (the DOM selection that produced the snippet can lose the first line's
 * indentation or trailing spaces). Returns null when the snippet isn't found.
 */
export function applySnippet(
  source: string,
  oldSnippet: string,
  newSnippet: string,
): string | null {
  const src = normalize(source);
  const oldN = normalize(oldSnippet);
  const newN = normalize(newSnippet);

  if (!oldN.trim()) return null;

  // 1. Exact substring.
  const idx = src.indexOf(oldN);
  if (idx >= 0) {
    return src.slice(0, idx) + newN + src.slice(idx + oldN.length);
  }

  // 2. Whitespace-tolerant contiguous line match.
  const srcLines = src.split("\n");
  const oldLines = trimSnippetLines(oldN.split("\n"));
  if (oldLines.length === 0) return null;

  const oldKeys = oldLines.map((l) => l.trim());
  for (let i = 0; i + oldLines.length <= srcLines.length; i++) {
    let hit = true;
    for (let j = 0; j < oldLines.length; j++) {
      if (srcLines[i + j].trim() !== oldKeys[j]) {
        hit = false;
        break;
      }
    }
    if (hit) {
      const before = srcLines.slice(0, i);
      const after = srcLines.slice(i + oldLines.length);
      return [...before, ...newN.split("\n"), ...after].join("\n");
    }
  }

  return null;
}

/**
 * Pick the code card a diff should apply to and compute its new full content.
 *
 * `candidates` should be ordered newest-first; among equally-valid matches the
 * first (most recent) wins.
 */
export function findApplyTarget(
  diff: DiffApplyInput,
  candidates: CodeCandidate[],
): DiffApplyResult | { error: DiffApplyFailure } {
  if (candidates.length === 0) return { error: "no-candidates" };

  const oldCode = diff.oldCode ?? "";
  const newCode = diff.newCode ?? "";
  const fileName = (diff.fileName ?? "").trim();

  // Narrow to same-named cards when the diff names a file; otherwise consider all.
  const named = fileName
    ? candidates.filter((c) => (c.fileName ?? "").trim() === fileName)
    : [];
  const pool = named.length > 0 ? named : candidates;

  // Strongest signal: a card whose code actually contains the old snippet.
  for (const cand of pool) {
    const applied = applySnippet(cand.code, oldCode, newCode);
    if (applied !== null) {
      return {
        target: cand,
        newFullCode: applied,
        matchType: named.length > 0 ? "filename-snippet" : "content-snippet",
      };
    }
  }

  // File name matched but snippet not located — treat as a whole-file diff and
  // replace the named card's content outright.
  if (named.length > 0 && newCode.trim()) {
    return {
      target: named[0],
      newFullCode: newCode,
      matchType: "filename-full",
    };
  }

  return { error: "no-match" };
}

export function resolveDiffDisplay(
  diff: DiffApplyInput,
  candidates: CodeCandidate[],
): DiffDisplayResolution {
  const oldCode = diff.oldCode ?? "";
  const newCode = diff.newCode ?? "";
  const fileName = (diff.fileName ?? "").trim();

  if (candidates.length === 0) {
    return { oldCode, newCode, expanded: false };
  }

  const named = fileName
    ? candidates.filter((c) => (c.fileName ?? "").trim() === fileName)
    : [];
  const pool = named.length > 0 ? named : candidates;

  for (const cand of pool) {
    const newFullCode = applySnippet(cand.code, oldCode, newCode);
    if (newFullCode !== null) {
      return {
        oldCode: cand.code,
        newCode: newFullCode,
        target: cand,
        expanded: true,
        matchType: named.length > 0 ? "filename-snippet" : "content-snippet",
      };
    }
  }

  for (const cand of pool) {
    if (normalize(cand.code).trim() === normalize(newCode).trim()) continue;
    const oldFullCode = applySnippet(cand.code, newCode, oldCode);
    if (oldFullCode !== null) {
      return {
        oldCode: oldFullCode,
        newCode: cand.code,
        target: cand,
        expanded: true,
        matchType: "reverse-snippet",
      };
    }
  }

  if (named.length > 0 && newCode.trim()) {
    return {
      oldCode: named[0].code,
      newCode,
      target: named[0],
      expanded: normalize(named[0].code).trim() !== normalize(oldCode).trim(),
      matchType: "filename-full",
    };
  }

  return { oldCode, newCode, expanded: false };
}
