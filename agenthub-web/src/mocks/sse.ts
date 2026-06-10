import type { SSEMessageStart, SSEToken, SSEArtifact, SSEAgentStatus, SSEThinking, SSEMessageEnd, SSEError, Artifact, Message, PlanSubtask } from "@/types";
import { mockAgents, mockConversations } from "./data";
import { addMockMessage, getLastUserMessage, getMockAgents, getMockConversation, getOrchestratorPhase, getOrchestratorPlan, setOrchestratorPhase } from "./handlers";
import { generateId } from "@/lib/utils";

interface MockSSEOptions {
  onMessageStart?: (data: SSEMessageStart) => void;
  onToken?: (data: SSEToken) => void;
  onArtifact?: (data: SSEArtifact) => void;
  onAgentStatus?: (data: SSEAgentStatus) => void;
  onThinking?: (data: SSEThinking) => void;
  onMessageEnd?: (data: SSEMessageEnd) => void;
  onError?: (data: SSEError) => void;
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

const planningThinkingSteps: Array<{ phase: "thought" | "action" | "observation"; text: string; tool_name?: string }> = [
  { phase: "thought", text: "正在分析用户需求，拆解为可执行的子任务..." },
  { phase: "action", text: "评估各 Agent 的能力匹配度，分配子任务。", tool_name: "planner" },
  { phase: "observation", text: "计划生成完毕，等待用户确认。" },
];

function buildOrchestratorPlanText(plan: PlanSubtask[]): string {
  const lines = plan.map((t, i) => {
    const caps = t.recommended_capabilities?.length
      ? ` [needs: ${t.recommended_capabilities.join(", ")}]`
      : "";
    return `${i + 1}. **${t.instruction}**${caps}`;
  });
  return `Draft execution plan:\n\n${lines.join("\n")}\n\nConfirm the plan to let the Orchestrator assign agents dynamically.`;
}

export function createMockSSEStream(
  conversationId: string,
  callbacks: MockSSEOptions,
): () => void {
  let cancelled = false;
  const messageId = `msg-${generateId()}`;
  const taskId = `task-${generateId()}`;

  const liveAgents = getMockAgents();
  const allKnownAgents = [...mockAgents, ...liveAgents];
  const conv = getMockConversation(conversationId) ?? mockConversations.find((c) => c.id === conversationId);
  const isGroup = conv?.type === "group";
  const agentIds: string[] = conv?.agentIds || [];
  const agents = agentIds
    .map((id: string) => allKnownAgents.find((a) => a.id === id))
    .filter(Boolean) as typeof mockAgents;

  if (agents.length === 0) {
    agents.push(mockAgents[0]);
  }

  const phase = getOrchestratorPhase();
  const plan = getOrchestratorPlan();

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
      case "error":
        callbacks.onError?.(data as SSEError);
        break;
    }
  };

  const primaryAgent = agents[0];
  const planText = isGroup ? buildOrchestratorPlanText(plan) : "";
  let accumulatedText = "";
  const accumulatedArtifacts: Artifact[] = [];
  let tokenIndex = 0;
  const accumulatedThinkingSteps: Array<{ phase: "thought" | "action" | "observation"; text: string; tool_name?: string; status: "done" }> = [];

  const baseDelay = 100;

  if (conv?.purpose === "agent_builder") {
    const lastMsg = getLastUserMessage(conversationId);
    const userContent = lastMsg?.content || "创建一个代码助手";
    const text = "我整理了一个 Agent 配置草案。你可以继续调整，也可以直接确认创建。";
    const artifact: Artifact = {
      id: `art-${generateId()}`,
      artifactType: "agent_config",
      title: "Agent 配置草案",
      content: {
        name: userContent.includes("前端") ? "前端代码助手" : "自定义 Agent",
        provider: userContent.toLowerCase().includes("claude") ? "claude-code-cli" : "codex-cli",
        model: "cli-default",
        baseUrl: "",
        apiKey: "",
        systemPrompt: "你是 AgentHub 中的专业协作 Agent。请优先给出可执行、可验证的结果，回复语言与用户保持一致。",
        capabilities: userContent.includes("前端") ? ["frontend", "code-editing"] : ["code-editing"],
        toolConfig: {
          tools: [
            { type: "builtin", name: "read_file" },
            { type: "builtin", name: "edit_file" },
            { type: "builtin", name: "execute_command" },
          ],
        },
      },
      storageKey: null,
      mimeType: null,
      version: 1,
      createdAt: new Date().toISOString(),
    };

    setTimeout(() => {
      if (cancelled) return;
      sendEvent("message_start", {
        version: "v1",
        event_id: `evt-${generateId()}`,
        conversation_id: conversationId,
        message_id: messageId,
        sender: { type: "orchestrator", id: "agent_builder", name: "Agent Builder" },
        timestamp: new Date().toISOString(),
      });
    }, baseDelay);

    let draftDelay = baseDelay + 100;
    for (let i = 0; i < text.length; i++) {
      setTimeout(() => {
        if (cancelled) return;
        sendEvent("token", {
          version: "v1",
          event_id: `evt-${generateId()}`,
          conversation_id: conversationId,
          message_id: messageId,
          delta: text[i],
          index: i,
          timestamp: new Date().toISOString(),
        });
      }, draftDelay);
      draftDelay += 4;
    }

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
    }, draftDelay + 20);

    setTimeout(() => {
      if (cancelled) return;
      addMockMessage(conversationId, {
        id: messageId,
        conversationId,
        senderType: "orchestrator",
        senderId: "agent_builder",
        senderName: "Agent Builder",
        contentType: "text",
        content: text,
        artifacts: [artifact],
        status: "done",
        isPinned: false,
        meta: { builder: "agent_builder" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      sendEvent("message_end", {
        version: "v1",
        event_id: `evt-${generateId()}`,
        conversation_id: conversationId,
        message_id: messageId,
        finish_reason: "agent_config_draft",
        timestamp: new Date().toISOString(),
      });
    }, draftDelay + 80);

    return () => { cancelled = true; };
  }

  // ── Phase: planning (auto_orchestrate 或 refine_plan) ──
  if (isGroup && phase === "planning" && plan.length > 0) {
    setTimeout(() => {
      if (cancelled) return;
      sendEvent("message_start", {
        version: "v1",
        event_id: `evt-${generateId()}`,
        conversation_id: conversationId,
        message_id: messageId,
        sender: { type: "orchestrator", id: "orchestrator", name: "Orchestrator" },
        meta: {
          plan,
          plan_id: taskId,
          planner_agent_id: null,
          planner_agent_name: null,
        },
        timestamp: new Date().toISOString(),
      });
    }, baseDelay);

    // Planning thinking steps
    let pDelay = baseDelay + 100;
    for (const step of planningThinkingSteps) {
      const stepIndex = planningThinkingSteps.indexOf(step);
      const startOrder = stepIndex;

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
          step_index: startOrder,
          timestamp: new Date().toISOString(),
        });
      }, pDelay);
      pDelay += 300;

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
          step_index: startOrder,
          timestamp: new Date().toISOString(),
        });
      }, pDelay);
      pDelay += 50;
    }

    // Token events for plan text
    for (let i = 0; i < planText.length; i++) {
      setTimeout(() => {
        if (cancelled) return;
        sendEvent("token", {
          version: "v1",
          event_id: `evt-${generateId()}`,
          conversation_id: conversationId,
          message_id: messageId,
          delta: planText[i],
          index: tokenIndex++,
          timestamp: new Date().toISOString(),
        });
      }, pDelay);
      pDelay += 2 + Math.random() * 5;
    }
    accumulatedText = planText;

    // message_end with plan_draft
    setTimeout(() => {
      if (cancelled) return;
      addMockMessage(conversationId, {
        id: messageId,
        conversationId,
        senderType: "orchestrator",
        senderId: "orchestrator",
        senderName: "Orchestrator",
        contentType: "text",
        content: accumulatedText,
        artifacts: accumulatedArtifacts,
        status: "done",
        isPinned: false,
        meta: { thinking_steps: accumulatedThinkingSteps, plan },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      sendEvent("message_end", {
        version: "v1",
        event_id: `evt-${generateId()}`,
        conversation_id: conversationId,
        message_id: messageId,
        finish_reason: "plan_draft",
        timestamp: new Date().toISOString(),
      });
    }, pDelay + 80);

    return () => { cancelled = true; };
  }

  // ── Phase: executing (confirm_plan) ──
  if (isGroup && phase === "executing" && plan.length > 0) {
    setTimeout(() => {
      if (cancelled) return;
      sendEvent("message_start", {
        version: "v1",
        event_id: `evt-${generateId()}`,
        conversation_id: conversationId,
        message_id: messageId,
        sender: { type: "orchestrator", id: "orchestrator", name: "Orchestrator" },
        meta: { plan_id: taskId },
        timestamp: new Date().toISOString(),
      });
    }, baseDelay);

    let eDelay = baseDelay + 100;

    // Exec summary text
    const execText = "计划已确认，开始执行...\n\n";
    for (let i = 0; i < execText.length; i++) {
      setTimeout(() => {
        if (cancelled) return;
        sendEvent("token", {
          version: "v1",
          event_id: `evt-${generateId()}`,
          conversation_id: conversationId,
          message_id: messageId,
          delta: execText[i],
          index: tokenIndex++,
          timestamp: new Date().toISOString(),
        });
      }, eDelay);
      eDelay += 2 + Math.random() * 5;
    }
    accumulatedText = execText;

    // Multi-agent concurrent execution with agent_status events
    plan.forEach((subtask, i) => {
      const lifeStart = eDelay + i * 800;
      const subtaskId = subtask.subtask_id;
      const assignedAgent = agents[i % agents.length] ?? primaryAgent;

      setTimeout(() => {
        if (cancelled) return;
        sendEvent("agent_status", {
          version: "v1",
          event_id: `evt-${generateId()}`,
          conversation_id: conversationId,
          message_id: messageId,
          task_id: taskId,
          subtask_id: subtaskId,
          agent: { id: assignedAgent.id, name: assignedAgent.name },
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
          task_id: taskId,
          subtask_id: subtaskId,
          agent: { id: assignedAgent.id, name: assignedAgent.name },
          status: "running",
          progress: 30,
          timestamp: new Date().toISOString(),
        });
      }, lifeStart + 300);

      // Sub-task progress text
      const subText = `\n@${assignedAgent.name} is executing: ${subtask.instruction}...\n`;
      setTimeout(() => {
        if (cancelled) return;
        for (let j = 0; j < subText.length; j++) {
          setTimeout(() => {
            if (cancelled) return;
            sendEvent("token", {
              version: "v1",
              event_id: `evt-${generateId()}`,
              conversation_id: conversationId,
              message_id: messageId,
              delta: subText[j],
              index: tokenIndex++,
              timestamp: new Date().toISOString(),
            });
          }, j * 3);
        }
        accumulatedText += subText;
      }, lifeStart + 400);

      setTimeout(() => {
        if (cancelled) return;
        sendEvent("agent_status", {
          version: "v1",
          event_id: `evt-${generateId()}`,
          conversation_id: conversationId,
          message_id: messageId,
          task_id: taskId,
          subtask_id: subtaskId,
          agent: { id: assignedAgent.id, name: assignedAgent.name },
          status: "running",
          progress: 70,
          timestamp: new Date().toISOString(),
        });
      }, lifeStart + 800);

      setTimeout(() => {
        if (cancelled) return;
        sendEvent("agent_status", {
          version: "v1",
          event_id: `evt-${generateId()}`,
          conversation_id: conversationId,
          message_id: messageId,
          task_id: taskId,
          subtask_id: subtaskId,
          agent: { id: assignedAgent.id, name: assignedAgent.name },
          status: "success",
          progress: 100,
          timestamp: new Date().toISOString(),
        });

        const doneText = `@${assignedAgent.name} completed\n`;
        accumulatedText += doneText;
        for (let j = 0; j < doneText.length; j++) {
          setTimeout(() => {
            if (cancelled) return;
            sendEvent("token", {
              version: "v1",
              event_id: `evt-${generateId()}`,
              conversation_id: conversationId,
              message_id: messageId,
              delta: doneText[j],
              index: tokenIndex++,
              timestamp: new Date().toISOString(),
            });
          }, j * 3);
        }
      }, lifeStart + 1500);
    });

    const summaryText = "\n---\n所有子任务执行完毕，计划完成。";
    const totalDelay = eDelay + plan.length * 800 + 2000;

    setTimeout(() => {
      if (cancelled) return;
      for (let j = 0; j < summaryText.length; j++) {
        setTimeout(() => {
          if (cancelled) return;
          sendEvent("token", {
            version: "v1",
            event_id: `evt-${generateId()}`,
            conversation_id: conversationId,
            message_id: messageId,
            delta: summaryText[j],
            index: tokenIndex++,
            timestamp: new Date().toISOString(),
          });
        }, j * 3);
      }
    }, totalDelay);

    setTimeout(() => {
      if (cancelled) return;
      setOrchestratorPhase("idle");
      addMockMessage(conversationId, {
        id: messageId,
        conversationId,
        senderType: "orchestrator",
        senderId: "orchestrator",
        senderName: "Orchestrator",
        contentType: "text",
        content: accumulatedText + summaryText,
        artifacts: accumulatedArtifacts,
        status: "done",
        isPinned: false,
        meta: {
          thinking_steps: accumulatedThinkingSteps,
          plan_id: taskId,
          summary: {
            total: plan.length,
            success: plan.length,
            failed: 0,
            results: plan.map((t) => ({
              subtask_id: t.subtask_id,
              status: "success" as const,
              message_id: `msg-${generateId()}`,
            })),
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      sendEvent("message_end", {
        version: "v1",
        event_id: `evt-${generateId()}`,
        conversation_id: conversationId,
        message_id: messageId,
        finish_reason: "completed",
        usage: { input_tokens: 2500, output_tokens: 1200 },
        timestamp: new Date().toISOString(),
      });
    }, totalDelay + 500);

    return () => { cancelled = true; };
  }

  // ── Default: single-chat or idle group (existing behavior) ──
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

  if (isGroup && agents.length > 1) {
    let agentDelay = delay + 100;
    agents.forEach((agent, i) => {
      const lifeStart = agentDelay + i * 600;
      const subtaskId = `sub-${generateId()}`;
      setTimeout(() => {
        if (cancelled) return;
        sendEvent("agent_status", {
          version: "v1",
          event_id: `evt-${generateId()}`,
          conversation_id: conversationId,
          message_id: messageId,
          task_id: taskId,
          subtask_id: subtaskId,
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
          task_id: taskId,
          subtask_id: subtaskId,
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
          task_id: taskId,
          subtask_id: subtaskId,
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
          task_id: taskId,
          subtask_id: subtaskId,
          agent: { id: agent.id, name: agent.name },
          status: "success",
          progress: 100,
          timestamp: new Date().toISOString(),
        });
      }, lifeStart + 1000);
    });
  }

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

  const shouldDisconnect = sessionStorage.getItem("mock_fail_mode") === "sse_disconnect";
  if (shouldDisconnect) {
    sessionStorage.removeItem("mock_fail_mode");
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
        isPinned: false,
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
      isPinned: false,
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
