# AgentHub Backend Notes

This folder contains the FastAPI backend, plus a small ADK runner demo and mock SSE stream.

## Mock SSE stream
- Endpoint: `GET /api/v1/conversations/{conversation_id}/stream`
- Purpose: emits 6 SSE events for UI integration testing.

## ADK runner demo
- Script: `adk_runner_demo.py`
- Modes:
  - `--mode mock` (default): no external calls
  - `--mode live`: runs `Runner.run_async()` using `ADK_DEMO_MODEL` (defaults to `gemini-1.5-flash`)

