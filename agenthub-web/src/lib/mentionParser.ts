import type { Agent } from "@/types";

export type InputSegment =
  | { type: "text"; text: string }
  | { type: "mention"; agentId: string; agentName: string };

interface MentionMatch {
  start: number;
  end: number;
  agent: Agent;
}

export function parseMentions(text: string, agents: Agent[]): InputSegment[] {
  const active = agents.filter((a) => a.isActive);
  const sorted = [...active].sort((a, b) => b.name.length - a.name.length);

  const matches: MentionMatch[] = [];

  for (const agent of sorted) {
    const pattern = `@${agent.name}`;
    let idx = text.indexOf(pattern);
    while (idx !== -1) {
      const overlaps = matches.some(
        (m) => idx >= m.start && idx < m.end,
      );
      if (!overlaps) {
        matches.push({ start: idx, end: idx + pattern.length, agent });
      }
      idx = text.indexOf(pattern, idx + 1);
    }
  }

  matches.sort((a, b) => a.start - b.start);

  const segments: InputSegment[] = [];
  let cursor = 0;

  for (const m of matches) {
    if (m.start > cursor) {
      segments.push({ type: "text", text: text.slice(cursor, m.start) });
    }
    segments.push({
      type: "mention",
      agentId: m.agent.id,
      agentName: m.agent.name,
    });
    cursor = m.end;
  }

  if (cursor < text.length) {
    segments.push({ type: "text", text: text.slice(cursor) });
  }

  return segments;
}

export function mentionsFromText(text: string, agents: Agent[]): string[] {
  const segments = parseMentions(text, agents);
  const ids = new Set<string>();
  for (const seg of segments) {
    if (seg.type === "mention") ids.add(seg.agentId);
  }
  return [...ids];
}
