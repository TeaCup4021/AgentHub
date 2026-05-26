import type { Message } from "@/types";

function formatMarkdown(messages: Message[], title: string): string {
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`> 导出时间：${new Date().toLocaleString()}`);
  lines.push("");

  for (const msg of messages) {
    const sender = msg.senderName || (msg.senderType === "user" ? "我" : "Agent");
    const time = new Date(msg.createdAt).toLocaleString();
    lines.push(`### ${sender} — ${time}`);
    lines.push("");
    lines.push(msg.content);
    lines.push("");

    for (const art of msg.artifacts) {
      if (art.artifactType === "code") {
        const c = art.content as { code?: string; language?: string; fileName?: string };
        const lang = c.language || "";
        const fn = c.fileName ? ` (${c.fileName})` : "";
        lines.push(`\`\`\`${lang}${fn}`);
        lines.push(c.code || "");
        lines.push("```");
        lines.push("");
      }
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

export function exportConversation(messages: Message[], title: string): void {
  const md = formatMarkdown(messages, title);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[\\/:*?"<>|]/g, "_")}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
