# Plan: Dynamic Group Orchestration

Date: 2026-06-08

## Steps

- [x] Define behavior and compatibility spec.
- [x] Update backend plan schema so plan items can omit concrete agents and include capability needs.
- [x] Change Orchestrator selection: one mention selects that agent, zero or multiple mentions use default DeepSeek.
- [x] Change confirmation flow to persist stage plans without creating execution subtasks.
- [x] Add dynamic assignment generation after confirmation using current group agents.
- [x] Execute assignments through ADK Workflow with sequentialized SSE display.
- [x] Add one best-effort fallback attempt for failed subtasks.
- [x] Extend aggregation to understand dynamic assignments and report code conflicts.
- [x] Update frontend plan types and plan card to show recommended capabilities instead of fixed agents.
- [x] Run targeted backend syntax checks and frontend type checks where available.

## Implementation Notes

- Do not add a DB migration in this pass. Use `orchestrator_tasks.plan` for stage plans plus generated assignments.
- Keep old DAG/Coordinator helpers for compatibility, but route confirmed group tasks through the new dynamic execution stream.
- Keep frontend confirmation payload compact: `subtask_id`, `instruction`, `recommended_capabilities`, `acceptance_criteria`, `depends_on`, `can_parallel`, `mode`, `output_key`.
- Treat automatic conflict resolution as a later enhancement; this pass detects and reports code/diff conflicts.

## Verification

- `python -m py_compile backend\app\schemas\orchestrator.py backend\app\services\adk\planner.py backend\app\api\v1\messages.py backend\app\api\v1\conversations.py backend\app\services\adk\merge_aggregator.py`
- `npm.cmd run build`
