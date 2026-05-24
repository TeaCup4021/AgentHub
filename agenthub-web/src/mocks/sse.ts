import type { SSEMessageStart, SSEToken, SSEArtifact, SSEAgentStatus, SSEMessageEnd, Artifact } from "@/types";
import { mockAgents, mockConversations } from "./data";
import { addMockMessage } from "./handlers";
import { generateId } from "@/lib/utils";

interface MockSSEOptions {
  onMessageStart?: (data: SSEMessageStart) => void;
  onToken?: (data: SSEToken) => void;
  onArtifact?: (data: SSEArtifact) => void;
  onAgentStatus?: (data: SSEAgentStatus) => void;
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
  const isGroup = conversation?.type === "group";
  const agentIds = conversation?.agentIds || [];
  const agents = agentIds
    .map((id) => mockAgents.find((a) => a.id === id))
    .filter(Boolean) as typeof mockAgents;

  if (agents.length === 0) {
    agents.push(mockAgents[0]);
  }

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
      case "agent_status":
        callbacks.onAgentStatus?.(data as SSEAgentStatus);
        break;
      case "message_end":
        callbacks.onMessageEnd?.(data as SSEMessageEnd);
        break;
    }
  };

  const emitAgentStatuses = (startDelay: number) => {
    if (!isGroup || agents.length <= 1) return startDelay;

    let delay = startDelay;

    for (const agent of agents) {
      setTimeout(() => {
        if (cancelled) return;
        sendEvent("agent_status", {
          version: "v1",
          event_id: `evt-${generateId()}`,
          conversation_id: conversationId,
          message_id: messageId,
          subtask_id: `sub-${generateId()}`,
          agent: { id: agent.id, name: agent.name },
          status: "queued",
          progress: 0,
          timestamp: new Date().toISOString(),
        });
      }, delay);

      delay += 50;

      setTimeout(() => {
        if (cancelled) return;
        sendEvent("agent_status", {
          version: "v1",
          event_id: `evt-${generateId()}`,
          conversation_id: conversationId,
          message_id: messageId,
          subtask_id: `sub-${generateId()}`,
          agent: { id: agent.id, name: agent.name },
          status: "running",
          progress: 30,
          timestamp: new Date().toISOString(),
        });
      }, delay);

      delay += 80;

      setTimeout(() => {
        if (cancelled) return;
        sendEvent("agent_status", {
          version: "v1",
          event_id: `evt-${generateId()}`,
          conversation_id: conversationId,
          message_id: messageId,
          subtask_id: `sub-${generateId()}`,
          agent: { id: agent.id, name: agent.name },
          status: "running",
          progress: 70,
          timestamp: new Date().toISOString(),
        });
      }, delay);

      delay += 60;

      setTimeout(() => {
        if (cancelled) return;
        sendEvent("agent_status", {
          version: "v1",
          event_id: `evt-${generateId()}`,
          conversation_id: conversationId,
          message_id: messageId,
          subtask_id: `sub-${generateId()}`,
          agent: { id: agent.id, name: agent.name },
          status: "success",
          progress: 100,
          timestamp: new Date().toISOString(),
        });
      }, delay);

      delay += 40;
    }

    return delay;
  };

  const primaryAgent = agents[0];
  const blocks = mockResponseTexts[primaryAgent.id] || mockResponseTexts["agent-claude-code"];
  let accumulatedText = "";
  const accumulatedArtifacts: Artifact[] = [];
  let tokenIndex = 0;

  let baseDelay = 100;
  const minStartDelay = emitAgentStatuses(baseDelay);
  baseDelay = Math.max(baseDelay, minStartDelay);

  setTimeout(() => {
    if (cancelled) return;
    sendEvent("message_start", {
      version: "v1",
      event_id: `evt-${generateId()}`,
      conversation_id: conversationId,
      message_id: messageId,
      sender: {
        type: isGroup ? "orchestrator" : "agent",
        id: isGroup ? "orchestrator" : primaryAgent.id,
        name: isGroup ? "Orchestrator" : primaryAgent.name,
      },
      timestamp: new Date().toISOString(),
    });
  }, baseDelay);

  let delay = baseDelay + 100;
  for (const block of blocks) {
    if (block.code) {
      const artifactId = `art-${generateId()}`;
      const artifact: Artifact = {
        id: artifactId,
        artifactType: "code",
        title: block.fileName,
        content: { fileName: block.fileName, language: block.language || "text", code: block.code },
        storageKey: null,
        mimeType: null,
        version: 1,
        createdAt: new Date().toISOString(),
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
      delay += 200;
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
      delay += 3 + Math.random() * 8;
    }
  }

  const deployArtifact: Artifact = {
    id: `art-${generateId()}`,
    artifactType: "deploy_status",
    title: "部署状态",
    content: { status: "building" },
    storageKey: null,
    mimeType: null,
    version: 1,
    createdAt: new Date().toISOString(),
  };

  setTimeout(() => {
    if (cancelled) return;
    accumulatedArtifacts.push(deployArtifact);
    sendEvent("artifact", {
      version: "v1",
      event_id: `evt-${generateId()}`,
      conversation_id: conversationId,
      message_id: messageId,
      artifact: deployArtifact,
      timestamp: new Date().toISOString(),
    });
  }, delay + 10);

  const deployedArtifact: Artifact = {
    id: `art-${generateId()}`,
    artifactType: "deploy_status",
    title: "部署状态",
    content: { status: "deployed", url: "https://example.com/deployed-app" },
    storageKey: null,
    mimeType: null,
    version: 1,
    createdAt: new Date(Date.now() + 5000).toISOString(),
  };

  setTimeout(() => {
    if (cancelled) return;
    accumulatedArtifacts.push(deployedArtifact);
    sendEvent("artifact", {
      version: "v1",
      event_id: `evt-${generateId()}`,
      conversation_id: conversationId,
      message_id: messageId,
      artifact: deployedArtifact,
      timestamp: new Date().toISOString(),
    });
  }, delay + 30);

  setTimeout(() => {
    if (cancelled) return;
    addMockMessage(conversationId, {
      id: messageId,
      conversationId,
      senderType: isGroup ? "orchestrator" : "agent",
      senderId: isGroup ? "orchestrator" : primaryAgent.id,
      senderName: isGroup ? "Orchestrator" : primaryAgent.name,
      contentType: "text",
      content: accumulatedText,
      artifacts: accumulatedArtifacts,
      status: "done",
      meta: null,
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
  }, delay + 80);

  return () => { cancelled = true; };
}
