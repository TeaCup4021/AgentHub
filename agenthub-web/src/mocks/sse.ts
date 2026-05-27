import type { SSEMessageStart, SSEToken, SSEArtifact, SSEAgentStatus, SSEThinking, SSEMessageEnd, Artifact, Message } from "@/types";
import { mockAgents, mockConversations } from "./data";
import { addMockMessage, getLastUserMessage, getMockAgents } from "./handlers";
import { generateId } from "@/lib/utils";

interface MockSSEOptions {
  onMessageStart?: (data: SSEMessageStart) => void;
  onToken?: (data: SSEToken) => void;
  onArtifact?: (data: SSEArtifact) => void;
  onAgentStatus?: (data: SSEAgentStatus) => void;
  onThinking?: (data: SSEThinking) => void;
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

const mockThinkingSteps: Array<{ phase: "thought" | "action" | "observation"; text: string; tool_name?: string }> = [
  { phase: "thought", text: "我先分析一下用户的需求，理解他想要达成的目标。" },
  { phase: "action", text: "根据需求分析结果，调用相应的工具来生成代码。", tool_name: "code_generator" },
  { phase: "observation", text: "工具返回了可用的代码模板，现在基于模板为用户定制实现。" },
];

export function createMockSSEStream(
  conversationId: string,
  callbacks: MockSSEOptions,
): () => void {
  let cancelled = false;
  const messageId = `msg-${generateId()}`;

  const conversation = mockConversations.find((c) => c.id === conversationId);
  const isGroup = conversation?.type === "group";
  const agentIds = conversation?.agentIds || [];
  const liveAgents = getMockAgents();
  const agents = agentIds
    .map((id) => liveAgents.find((a) => a.id === id) || mockAgents.find((a) => a.id === id))
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
      case "thinking":
        callbacks.onThinking?.(data as SSEThinking);
        break;
      case "message_end":
        callbacks.onMessageEnd?.(data as SSEMessageEnd);
        break;
    }
  };

  const primaryAgent = agents[0];

  let blocks = mockResponseTexts[primaryAgent.id];
  if (!blocks) {
    const lastMsg = getLastUserMessage(conversationId);
    const userContent = lastMsg?.content || "帮我处理";
    blocks = [
      { text: `好的，我来处理你的请求：「${userContent}」\n\n` },
      { text: "分析结果如下：\n\n" },
      {
        text: "这是一个示例实现：\n",
        fileName: "result.ts",
        language: "typescript",
        code: `// 针对请求 "${userContent.slice(0, 40)}" 的处理方案\n\ninterface Input {\n  raw: string;\n}\n\ninterface Result {\n  processed: string;\n  length: number;\n}\n\nfunction process(input: Input): Result {\n  const processed = input.raw.trim();\n  return {\n    processed,\n    length: processed.length,\n  };\n}\n\n// 用法示例\nconst output = process({ raw: "${userContent.slice(0, 20)}" });\nconsole.log(output);`,
      },
      { text: "\n\n以上是基于你输入内容的处理方案。实际业务逻辑可根据具体需求进一步扩展。" },
    ];
  }
  let accumulatedText = "";
  const accumulatedArtifacts: Artifact[] = [];
  let tokenIndex = 0;

  const baseDelay = 100;

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

  // Concurrent agent status: fire alongside thinking + text for visibility
  if (isGroup && agents.length > 1) {
    let agentDelay = delay + 100;
    // Stagger each agent's lifecycle over ~1.5s, overlapping with text streaming
    agents.forEach((agent, i) => {
      const lifeStart = agentDelay + i * 600;
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
      }, lifeStart);
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
      }, lifeStart + 200);
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
      }, lifeStart + 600);
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
      }, lifeStart + 1000);
    });
  }

  const accumulatedThinkingSteps: Array<{ phase: "thought" | "action" | "observation"; text: string; tool_name?: string; status: "done" }> = [];

  for (const step of mockThinkingSteps) {
    const stepIndex = mockThinkingSteps.indexOf(step);
    setTimeout(() => {
      if (cancelled) return;
      sendEvent("thinking", {
        version: "v1",
        event_id: `evt-${generateId()}`,
        conversation_id: conversationId,
        message_id: messageId,
        phase: step.phase,
        text: step.text,
        tool_name: step.tool_name,
        status: "running",
        step_index: stepIndex,
        timestamp: new Date().toISOString(),
      });
    }, delay);
    delay += 120;
    setTimeout(() => {
      if (cancelled) return;
      accumulatedThinkingSteps.push({ ...step, status: "done" });
      sendEvent("thinking", {
        version: "v1",
        event_id: `evt-${generateId()}`,
        conversation_id: conversationId,
        message_id: messageId,
        phase: step.phase,
        text: step.text,
        tool_name: step.tool_name,
        status: "done",
        step_index: stepIndex,
        timestamp: new Date().toISOString(),
      });
    }, delay);
    delay += 50;
  }

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

  const shouldDisconnect = localStorage.getItem("mock_fail_mode") === "sse_disconnect";
  if (shouldDisconnect) {
    localStorage.removeItem("mock_fail_mode");
    const disconnectAt = baseDelay + Math.min(delay - baseDelay, 800);
    setTimeout(() => {
      if (cancelled) return;
      callbacks.onConnectionError?.(new Event("mock_disconnect"));
      const msg: Message = {
        id: messageId,
        conversationId,
        senderType: isGroup ? "orchestrator" : "agent",
        senderId: isGroup ? "orchestrator" : primaryAgent.id,
        senderName: isGroup ? "Orchestrator" : primaryAgent.name,
        contentType: "text",
        content: accumulatedText + "（响应中断）",
        artifacts: accumulatedArtifacts,
        status: "failed",
        meta: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      addMockMessage(conversationId, msg);
    }, disconnectAt);
    return () => { cancelled = true; };
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
      meta: { thinking_steps: accumulatedThinkingSteps },
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
