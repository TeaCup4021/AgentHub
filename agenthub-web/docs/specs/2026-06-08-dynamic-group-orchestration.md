# Spec: Dynamic Group Orchestration

Date: 2026-06-08
Status: implementation
Scope: backend orchestration flow plus frontend plan/assignment display

## Goal

Refactor group chat from fixed agent-in-plan execution to a dynamic orchestration model:

- If the user mentions exactly one agent, that agent is the Orchestrator.
- If the user mentions zero or multiple agents, the default DeepSeek Orchestrator is used.
- A mentioned Orchestrator only coordinates and is excluded from execution candidates.
- The plan shown to the user describes stages, capability needs, dependencies, and acceptance criteria. It does not assign concrete agents.
- After confirmation, the Orchestrator assigns stages to current group agents using their system prompts and capability tags.
- Execution can run in parallel behind the scenes, while the frontend emits agent replies in a deterministic stage order.
- A failed subtask gets one automatic fallback attempt with another matching group agent when available.
- Agent outputs appear as normal group-chat member messages, followed by an Orchestrator summary.

## User Flow

1. User sends a message in a group conversation.
2. Backend saves the user message and creates an `OrchestratorTask(status="planning")`.
3. The stream endpoint generates a stage plan and returns it as `finish_reason="plan_draft"`.
4. The frontend renders a plan card. The user can edit, refine by chat, or confirm.
5. On confirmation, backend stores the stage plan as `OrchestratorTask.plan.subtasks`.
6. The stream endpoint loads current group agents, excludes the selected Orchestrator if any, and generates execution assignments.
7. Backend persists a visible Orchestrator assignment message.
8. Backend executes assigned subtasks through ADK Workflow. Independent subtasks may execute concurrently; SSE output is sequentialized for display.
9. Failed subtasks are retried once with a fallback agent when possible.
10. The Orchestrator aggregates outputs, conflict notes, failures, and fallback results into the final chat message.

## Plan Shape

The user-confirmed plan uses `subtasks` for backward compatibility, but each item means an execution stage:

```json
{
  "subtasks": [
    {
      "subtask_id": "s1",
      "instruction": "Describe the stage goal and deliverable",
      "recommended_capabilities": ["frontend", "testing"],
      "acceptance_criteria": ["Clear deliverable", "Matches user request"],
      "depends_on": [],
      "can_parallel": true,
      "mode": "single_turn",
      "output_key": "stage_s1"
    }
  ],
  "planner_agent_id": null,
  "planner_agent_name": "Orchestrator"
}
```

Concrete execution assignments are generated only after confirmation:

```json
{
  "assignments": [
    {
      "stage_id": "s1",
      "subtask_id": "s1__agent_a",
      "agent_id": "<uuid>",
      "agent_name": "Frontend Agent",
      "instruction": "Concrete executable instruction for this agent",
      "depends_on": [],
      "fallback_agent_ids": ["<uuid>"],
      "output_key": "stage_s1"
    }
  ]
}
```

## Orchestrator Selection

- Exactly one `@Agent`: that agent becomes `planner_agent_id`.
- Zero or multiple mentions: `planner_agent_id = null`, so the default DeepSeek Orchestrator is used.
- Execution candidates are the conversation's active agent participants.
- If `planner_agent_id` is set, that agent is removed from execution candidates even if it is also a conversation participant.

## Fallback Policy

- A failed subtask may be retried once.
- The fallback agent must be a current group participant and must not be the selected Orchestrator.
- Prefer assignment-provided `fallback_agent_ids`; otherwise choose another eligible agent.
- If no fallback is available or the fallback also fails, keep the failure and let the final Orchestrator summary explain impact and next steps.

## Conflict Policy

This phase reports conflicts rather than performing irreversible automatic merges:

- The aggregator checks code/diff artifacts with the same file name.
- If multiple agents produce different content for the same file, the summary artifact marks `has_conflict=true` and includes details.
- Existing `DiffCard` and conflict UI can be used by later phases for manual resolution.

## Compatibility

- Existing `plan_draft`, `refine_plan`, and `confirm_plan` modes remain.
- Existing `orchestrator_subtasks` remains the execution-level table; rows are created after assignment, not at confirmation.
- Existing ADK Workflow execution and SSE translator are reused.
