import { useState, useMemo } from "react";
import { Input, Select, Empty } from "@douyinfe/semi-ui";
import { IconSearch } from "@douyinfe/semi-icons";
import { CardRenderer } from "@/components/cards";
import type { Message } from "@/types";

const TYPE_OPTIONS = [
  { value: "", label: "全部类型" },
  { value: "code", label: "代码" },
  { value: "diff", label: "差异" },
  { value: "preview", label: "预览" },
  { value: "file", label: "文件" },
  { value: "document", label: "文档" },
  { value: "deploy_status", label: "部署" },
];

interface ArtifactWorkbenchProps {
  messages: Message[];
  agents: Array<{ id: string; name: string }>;
}

export function ArtifactWorkbench({ messages, agents }: ArtifactWorkbenchProps) {
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const convId = messages[0]?.conversationId || "";
  const agentOptions = useMemo(() => [
    { value: "", label: "全部 Agent" },
    ...agents.map((a) => ({ value: a.id, label: a.name })),
  ], [agents]);
  const [agentFilter, setAgentFilter] = useState("");

  const artifacts = useMemo(() => {
    const result: Array<{ messageId: string; senderName: string; artifact: Message["artifacts"][0] }> = [];
    for (const msg of messages) {
      if (!msg.artifacts || msg.artifacts.length === 0) continue;
      for (const art of msg.artifacts) {
        result.push({
          messageId: msg.id,
          senderName: msg.senderName || "Agent",
          artifact: art,
        });
      }
    }
    return result;
  }, [messages]);

  const filtered = useMemo(() => {
    let list = artifacts;
    if (typeFilter) list = list.filter((a) => a.artifact.artifactType === typeFilter);
    if (agentFilter) list = list.filter((a) => {
      const msg = messages.find((m) => m.id === a.messageId);
      return msg?.senderId === agentFilter;
    });
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((a) =>
        a.artifact.title?.toLowerCase().includes(q) ||
        a.artifact.artifactType.toLowerCase().includes(q)
      );
    }
    return list;
  }, [artifacts, typeFilter, agentFilter, search, messages]);

  return (
    <>
      {/* 筛选栏 */}
      <div style={{
        display: "flex",
        gap: 8,
        padding: "10px 16px",
        borderBottom: "1px solid var(--color-border-light)",
        background: "var(--color-bg-elevated)",
      }}>
        <Select
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as string)}
          optionList={TYPE_OPTIONS}
          size="small"
          style={{ width: 120 }}
        />
        <Select
          value={agentFilter}
          onChange={(v) => setAgentFilter(v as string)}
          optionList={agentOptions}
          size="small"
          style={{ width: 140 }}
        />
        <Input
          prefix={<IconSearch />}
          placeholder="搜索产物..."
          value={search}
          onChange={setSearch}
          size="small"
          style={{ flex: 1 }}
        />
      </div>

      {/* 产物列表 */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {filtered.length === 0 ? (
          <Empty title={artifacts.length === 0 ? "暂无产物" : "没有匹配的产物"} description={artifacts.length === 0 ? "开始对话后，Agent 生成的代码和文件将在此汇总" : undefined} />
        ) : (
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}>
            {filtered.map(({ artifact }) => (
              <CardRenderer key={artifact.id} artifact={artifact} convId={convId} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
