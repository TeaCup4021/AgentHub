import type { SSEMessageStart, SSEToken, SSEArtifact, SSEMessageEnd, Artifact } from "@/types";
import { mockAgents, mockConversations } from "./data";
import { addMockMessage } from "./handlers";
import { generateId } from "@/lib/utils";

interface MockSSEOptions {
  onMessageStart?: (data: SSEMessageStart) => void;
  onToken?: (data: SSEToken) => void;
  onArtifact?: (data: SSEArtifact) => void;
  onMessageEnd?: (data: SSEMessageEnd) => void;
  onConnectionError?: (error: Event) => void;
}

const mockResponseTexts: Record<string, { text: string; fileName?: string; language?: string; code?: string }[]> = {
  "agent-claude-code": [
    { text: "好的，我来帮你处理。\n\n" },
    {
      text: "这是实现代码：\n",
      fileName: "result.tsx",
      language: "tsx",
      code: `export function ExampleComponent() {\n  const [data, setData] = useState(null);\n\n  useEffect(() => {\n    fetchData().then(setData);\n  }, []);\n\n  if (!data) return <Loading />;\n  return <div>{data.title}</div>;\n}`,
    },
    { text: "\n这个组件包含了数据获取和加载状态处理。" },
  ],
  "agent-codex": [
    { text: "审查完成，以下是分析结果：\n\n" },
    {
      text: "重构建议：\n",
      fileName: "refactor.ts",
      language: "typescript",
      code: `// 优化前\nconst result = data.map((x) => x.value).filter(Boolean);\n\n// 优化后：使用 reduce 减少一次遍历\nconst result = data.reduce<string[]>((acc, x) => {\n  if (x.value) acc.push(x.value);\n  return acc;\n}, []);`,
    },
    { text: "\n这样可以将两次遍历合并为一次，对大数据集有明显提升。" },
  ],
  "agent-opencode": [
    { text: "好的，我来设计这个数据库 Schema。\n\n首先分析业务需求..." },
    {
      text: "\n核心表结构如下：\n",
      fileName: "schema.sql",
      language: "sql",
      code: `CREATE TABLE users (\n  id UUID PRIMARY KEY,\n  email VARCHAR(255) UNIQUE NOT NULL,\n  name VARCHAR(100) NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nCREATE INDEX idx_users_email ON users(email);`,
    },
    { text: "\n索引优化已完成，可以支撑百万级数据。" },
  ],
};

export function createMockSSEStream(
  conversationId: string,
  callbacks: MockSSEOptions,
): () => void {
  let cancelled = false;
  const messageId = `msg-${generateId()}`;

  const conversation = mockConversations.find((c) => c.id === conversationId);
  const agentId = conversation?.agentIds?.[0] || "agent-claude-code";
  const agent = mockAgents.find((a) => a.id === agentId) || mockAgents[0];
  const blocks = mockResponseTexts[agentId] || mockResponseTexts["agent-claude-code"];

  let accumulatedText = "";
  const accumulatedArtifacts: Artifact[] = [];

  let tokenIndex = 0;

  const sendEvent = (event: string, data: unknown) => {
    if (cancelled) return;
    switch (event) {
      case "message_start":
        callbacks.onMessageStart?.(data as SSEMessageStart);
        break;
      case "token":
        callbacks.onToken?.(data as SSEToken);
        break;
      case "artifact":
        callbacks.onArtifact?.(data as SSEArtifact);
        break;
      case "message_end":
        callbacks.onMessageEnd?.(data as SSEMessageEnd);
        break;
    }
  };

  setTimeout(() => {
    if (cancelled) return;
    sendEvent("message_start", {
      version: "v1",
      event_id: `evt-${generateId()}`,
      conversation_id: conversationId,
      message_id: messageId,
      sender: { type: "agent", id: agent.id, name: agent.name },
      timestamp: new Date().toISOString(),
    });
  }, 500);

  let delay = 800;
  for (const block of blocks) {
    if (block.code) {
      const artifactId = `art-${generateId()}`;
      const artifact: Artifact = {
        id: artifactId,
        type: "code",
        title: block.fileName,
        content: { fileName: block.fileName, language: block.language || "text", code: block.code },
      };
      accumulatedArtifacts.push(artifact);
      setTimeout(() => {
        if (cancelled) return;
        sendEvent("artifact", {
          version: "v1",
          event_id: `evt-${generateId()}`,
          conversation_id: conversationId,
          message_id: messageId,
          artifact,
          timestamp: new Date().toISOString(),
        });
      }, delay);
      delay += 500;
    }

    if (block.text) {
      accumulatedText += block.text;
    }

    for (let i = 0; i < block.text.length; i++) {
      const char = block.text[i];
      setTimeout(() => {
        if (cancelled) return;
        sendEvent("token", {
          version: "v1",
          event_id: `evt-${generateId()}`,
          conversation_id: conversationId,
          message_id: messageId,
          delta: char,
          index: tokenIndex++,
          timestamp: new Date().toISOString(),
        });
      }, delay);
      delay += 20 + Math.random() * 30;
    }
  }

  setTimeout(() => {
    if (cancelled) return;
    addMockMessage(conversationId, {
      id: messageId,
      conversationId,
      senderType: "agent",
      senderId: agent.id,
      senderName: agent.name,
      contentType: "text",
      content: accumulatedText,
      artifacts: accumulatedArtifacts,
      status: "done",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    sendEvent("message_end", {
      version: "v1",
      event_id: `evt-${generateId()}`,
      conversation_id: conversationId,
      message_id: messageId,
      finish_reason: "completed",
      usage: { input_tokens: 1200, output_tokens: 480 },
      timestamp: new Date().toISOString(),
    });
  }, delay + 200);

  return () => { cancelled = true; };
}
