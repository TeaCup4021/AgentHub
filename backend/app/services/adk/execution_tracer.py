"""ExecutionTracer — collects per-agent timing and status during workflow/coordinator runs.

Wire into WorkflowBuilder or CoordinatorBuilder so every LlmAgent records
start/end times via before_agent_callback / after_agent_callback.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class ExecutionRecord:
    agent_name: str
    invocation_id: str
    start_time: float = 0.0
    end_time: float = 0.0
    status: str = "pending"
    error: Optional[str] = None
    output_message_id: Optional[str] = None


class ExecutionTracer:
    """Shared tracer that records per-agent execution metrics.

    Usage::

        tracer = ExecutionTracer()
        builder = WorkflowBuilder()
        workflow = builder.build(plan, agent_models, execution_tracer=tracer)
        # ... run workflow ...
        dag = tracer.get_dag_data(edges=[...])
        metrics = tracer.get_subtask_metrics()
    """

    def __init__(self) -> None:
        self.records: dict[str, ExecutionRecord] = {}
        self._edges: list[dict] = []

    # -- adk callbacks (sync) ------------------------------------------------

    @staticmethod
    def _record_key(inv_id: Any, agent_name: str) -> str:
        """Key records by (invocation, agent). An ADK Workflow runs every
        sub-agent under ONE invocation_id, so keying on invocation alone would
        let agents overwrite each other (only the last would survive)."""
        return f"{inv_id}|{agent_name}"

    def before_agent(self, callback_context: Any) -> None:
        inv_id = getattr(callback_context, "invocation_id", None)
        agent_name = getattr(callback_context, "agent_name", "unknown")
        if inv_id:
            key = self._record_key(inv_id, agent_name)
            self.records[key] = ExecutionRecord(
                agent_name=agent_name,
                invocation_id=str(inv_id),
                start_time=time.time(),
                status="running",
            )

    def after_agent(self, callback_context: Any) -> None:
        inv_id = getattr(callback_context, "invocation_id", None)
        agent_name = getattr(callback_context, "agent_name", "unknown")
        if inv_id:
            key = self._record_key(inv_id, agent_name)
            rec = self.records.get(key)
            if rec:
                rec.end_time = time.time()
                rec.status = "success"

    def record_error(self, invocation_id: str, error: str) -> None:
        if invocation_id in self.records:
            self.records[invocation_id].status = "failed"
            self.records[invocation_id].error = error

    def set_output_message(self, agent_name: str, message_id: str) -> None:
        """Link an agent's output message_id by agent_name (best-effort)."""
        for rec in self.records.values():
            if rec.agent_name == agent_name and not rec.output_message_id:
                rec.output_message_id = message_id
                break

    # -- edge capture ---------------------------------------------------------

    def capture_edges(self, edges: list) -> None:
        """Capture ADK Workflow.edges as native DAG topology."""
        self._edges = []
        for edge in edges:
            from_node = getattr(edge, "from_node", None)
            to_node = getattr(edge, "to_node", None)
            if from_node is None or to_node is None:
                continue
            from_name = getattr(from_node, "name", str(from_node))
            to_name = getattr(to_node, "name", str(to_node))
            self._edges.append({"from_node": from_name, "to_node": to_name})

    # -- data export ---------------------------------------------------------

    def get_dag_data(self, edges: list | None = None) -> dict:
        _edges = edges or self._edges
        # Convert ADK Edge objects to dicts if needed
        edge_dicts: list[dict] = []
        for e in _edges:
            if isinstance(e, dict):
                edge_dicts.append(e)
            else:
                from_node = getattr(e, "from_node", None)
                to_node = getattr(e, "to_node", None)
                if from_node is not None and to_node is not None:
                    from_name = getattr(from_node, "name", str(from_node))
                    to_name = getattr(to_node, "name", str(to_node))
                    edge_dicts.append({"from_node": from_name, "to_node": to_name})

        nodes = []
        for rec in self.records.values():
            latency = None
            if rec.end_time and rec.start_time:
                latency = int((rec.end_time - rec.start_time) * 1000)
            nodes.append({
                "invocation_id": rec.invocation_id,
                "agent_name": rec.agent_name,
                "status": rec.status,
                "latency_ms": latency,
                "error": rec.error,
                "output_message_id": rec.output_message_id,
            })
        return {"nodes": nodes, "edges": edge_dicts}

    def get_subtask_metrics(self) -> dict[str, dict]:
        return {
            rec.invocation_id: {
                "agent_name": rec.agent_name,
                "latency_ms": (
                    int((rec.end_time - rec.start_time) * 1000)
                    if rec.end_time and rec.start_time
                    else None
                ),
                "status": rec.status,
                "error": rec.error,
                "output_message_id": rec.output_message_id,
            }
            for rec in self.records.values()
        }
