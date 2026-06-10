from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orchestrator_task import OrchestratorTask
from app.models.orchestrator_subtask import OrchestratorSubtask
from app.models.message import Message as MsgModel
from app.models.agent import Agent as AgentModel
from app.models.artifact import Artifact


@dataclass
class SubAgentSummary:
    agent_name: str
    subtask_id: str
    status: str
    latency_ms: Optional[int] = None
    summary: str = ""
    output_message_id: Optional[str] = None
    depends_on: list[str] = field(default_factory=list)


@dataclass
class MergeResult:
    summary_text: str
    sub_summaries: list[SubAgentSummary]
    has_conflict: bool = False
    conflict_detail: str = ""


class MergeAggregator:

    async def aggregate(
        self,
        db: AsyncSession,
        orch_task_id: UUID,
    ) -> MergeResult:
        task = await db.get(OrchestratorTask, orch_task_id)
        if not task:
            return MergeResult(summary_text="", sub_summaries=[], has_conflict=False, conflict_detail="")

        r = await db.execute(
            select(OrchestratorSubtask).where(OrchestratorSubtask.task_id == orch_task_id)
        )
        subtask_rows = list(r.scalars().all())
        subtask_rows.sort(key=lambda row: row.execution_order or 0)

        output_msg_ids = [
            row.output_message_id for row in subtask_rows
            if row.output_message_id is not None
        ]
        msg_map: dict[UUID, MsgModel] = {}
        if output_msg_ids:
            mr = await db.execute(select(MsgModel).where(MsgModel.id.in_(output_msg_ids)))
            for m in mr.scalars().all():
                msg_map[m.id] = m

        plan = task.plan or {}
        assignments = plan.get("assignments", [])
        assignment_by_stage_agent: dict[tuple[str, str], dict] = {}
        for item in assignments:
            stage_id = str(item.get("stage_id") or item.get("stageId") or "")
            agent_id = str(item.get("agent_id") or item.get("agentId") or "")
            if stage_id and agent_id:
                assignment_by_stage_agent[(stage_id, agent_id)] = item

        agent_ids = list({row.agent_id for row in subtask_rows if row.agent_id})
        agent_name_map: dict[UUID, str] = {}
        if agent_ids:
            ar = await db.execute(select(AgentModel).where(AgentModel.id.in_(agent_ids)))
            agent_name_map = {agent.id: agent.name for agent in ar.scalars().all()}

        sub_summaries: list[SubAgentSummary] = []
        for row in subtask_rows:
            stage_id = str((row.depends_on or [None])[0] or "")
            assignment = assignment_by_stage_agent.get((stage_id, str(row.agent_id)))
            if assignment is None:
                for item in assignments:
                    if (
                        str(item.get("agent_id", item.get("agentId", ""))) == str(row.agent_id)
                        and item.get("instruction") == row.instruction
                    ):
                        assignment = item
                        stage_id = str(item.get("stage_id", item.get("stageId", "")))
                        break

            msg = msg_map.get(row.output_message_id) if row.output_message_id else None
            summary = msg.content[:500] if msg else ""
            resolved_agent_name = (
                agent_name_map.get(row.agent_id)
                or (assignment or {}).get("agent_name")
                or (assignment or {}).get("agentName")
                or str(row.agent_id)[:12]
            )

            sub_summaries.append(SubAgentSummary(
                agent_name=resolved_agent_name,
                subtask_id=stage_id or (assignment or {}).get("subtask_id") or str(row.id),
                status=row.status or "unknown",
                latency_ms=row.latency_ms,
                summary=summary,
                output_message_id=str(row.output_message_id) if row.output_message_id else None,
                depends_on=row.depends_on or [],
            ))

        has_conflict = False
        conflict_detail = ""
        file_outputs: dict[str, list[tuple[str, str]]] = {}
        if output_msg_ids:
            artifact_result = await db.execute(select(Artifact).where(Artifact.message_id.in_(output_msg_ids)))
            for artifact in artifact_result.scalars().all():
                content = artifact.content if isinstance(artifact.content, dict) else {}
                file_name = content.get("fileName") or content.get("file_name") or artifact.title
                if not file_name:
                    continue
                body = None
                if artifact.artifact_type == "code":
                    body = content.get("code")
                elif artifact.artifact_type == "diff":
                    body = content.get("newCode") or content.get("new_code")
                if not isinstance(body, str) or not body:
                    continue
                owner = "unknown"
                for summary in sub_summaries:
                    if summary.output_message_id == str(artifact.message_id):
                        owner = summary.agent_name
                        break
                file_outputs.setdefault(str(file_name), []).append((owner, body))

        for file_name, outputs in file_outputs.items():
            unique_bodies = {body for _, body in outputs}
            if len(outputs) > 1 and len(unique_bodies) > 1:
                has_conflict = True
                agents = ", ".join(owner for owner, _ in outputs)
                conflict_detail += (
                    f"File `{file_name}` has different outputs from {len(outputs)} agents: {agents}.\n"
                )

        summary_text = self._build_summary_text(
            task.status or "completed",
            sub_summaries,
            has_conflict,
            conflict_detail,
        )
        return MergeResult(
            summary_text=summary_text,
            sub_summaries=sub_summaries,
            has_conflict=has_conflict,
            conflict_detail=conflict_detail,
        )
    async def summarize_with_llm(
        self,
        db: AsyncSession,
        orch_task_id: UUID,
        sub_summaries: list[SubAgentSummary],
        user_request: str = "",
    ) -> str:
        """Generate a natural-language summary via the selected Orchestrator model."""
        try:
            from app.services.adk.models import get_deepseek_llm, resolve_agent_model
            from app.services.adk.runner import AgentHubRunner
            from google.adk.agents import LlmAgent

            task = await db.get(OrchestratorTask, orch_task_id)
            model = None
            if task and task.planner_agent_id:
                planner = await db.get(AgentModel, task.planner_agent_id)
                if planner:
                    model = resolve_agent_model(
                        provider=planner.provider or "",
                        model=planner.model or "",
                        api_key=planner.api_key or None,
                        base_url=planner.base_url or None,
                    )
            if model is None:
                model = get_deepseek_llm()

            agent_blocks = []
            for s in sub_summaries:
                summary_text = s.summary or "(no output)"
                agent_blocks.append(f"### {s.agent_name} (status: {s.status})\n{summary_text}")
            outputs_text = "\n\n".join(agent_blocks) if agent_blocks else "(no agent output)"
            use_chinese = any(
                "\u4e00" <= ch <= "\u9fff"
                for ch in (user_request + "\n" + outputs_text)
            )
            language_rule = (
                "Use Chinese for the final summary. Do not include an English preamble."
                if use_chinese
                else "Use the same language as the original user request."
            )

            instruction = (
                "You are the Orchestrator summarizing a multi-agent group-chat run. "
                "Read the agents' outputs and answer the user directly. Mention what was completed, "
                "which agents contributed, any failures or conflicts, and the recommended next step. "
                f"{language_rule} Return only the final summary."
            )
            user_message = (
                f"Original user request:\n{user_request or '(not provided)'}\n\n"
                f"Agent outputs:\n{outputs_text}\n\n"
                "Summarize the collaboration result."
            )

            agent = LlmAgent(name="orchestrator_summary", model=model, instruction=instruction)
            runner = AgentHubRunner(agent=agent, app_name="agenthub_summary")
            events = await runner.run_single_turn(
                user_id="summary",
                session_id=f"summary-{orch_task_id}",
                message=user_message,
            )
            parts: list[str] = []
            for ev in events:
                content = getattr(ev, "content", None)
                for part in getattr(content, "parts", None) or []:
                    t = getattr(part, "text", None)
                    if t:
                        parts.append(t)
            return "".join(parts).strip()
        except Exception:
            return ""
    @staticmethod
    def _build_summary_text(
        task_status: str,
        subs: list[SubAgentSummary],
        has_conflict: bool,
        conflict_detail: str,
    ) -> str:
        use_chinese = any(
            "\u4e00" <= ch <= "\u9fff"
            for s in subs
            for ch in (s.summary + s.agent_name + s.subtask_id)
        )
        total = len(subs)
        success_count = sum(1 for s in subs if s.status in {"success", "done", "completed"})
        failed_count = sum(1 for s in subs if s.status in {"failed", "timeout"})
        total_latency = sum(s.latency_ms or 0 for s in subs)

        if use_chinese:
            lines = [
                "## 执行总结",
                f"- 总耗时：{total_latency}ms | 成功：{success_count} / {total}"
                + (f" | 失败：{failed_count}" if failed_count else ""),
                "",
                "### 智能体输出",
                "| 智能体 | 状态 | 耗时 | 摘要 |",
                "|-------|------|------|------|",
            ]

            for s in subs:
                latency_str = f"{s.latency_ms}ms" if s.latency_ms else "-"
                summary_preview = s.summary[:120].replace("\n", " ").replace("|", "\\|")
                if len(s.summary) > 120:
                    summary_preview += "..."
                lines.append(f"| {s.agent_name} | {s.status} | {latency_str} | {summary_preview} |")

            if any(s.depends_on for s in subs):
                lines.append("")
                lines.append("### 依赖关系")
                for s in subs:
                    if s.depends_on:
                        for dep in s.depends_on:
                            lines.append(f"{dep[:12]} -> {s.subtask_id[:12]}")

            if has_conflict and conflict_detail:
                lines.append("")
                lines.append("### 冲突说明")
                lines.append(conflict_detail)

            return "\n".join(lines)

        lines = [
            "## Execution Summary",
            f"- Total latency: {total_latency}ms | Success: {success_count} / {total}"
            + (f" | Failed: {failed_count}" if failed_count else ""),
            "",
            "### Agent Outputs",
            "| Agent | Status | Latency | Summary |",
            "|-------|--------|---------|---------|",
        ]

        for s in subs:
            latency_str = f"{s.latency_ms}ms" if s.latency_ms else "-"
            summary_preview = s.summary[:120].replace("\n", " ").replace("|", "\\|")
            if len(s.summary) > 120:
                summary_preview += "..."
            lines.append(f"| {s.agent_name} | {s.status} | {latency_str} | {summary_preview} |")

        if any(s.depends_on for s in subs):
            lines.append("")
            lines.append("### Dependency Notes")
            for s in subs:
                if s.depends_on:
                    for dep in s.depends_on:
                        lines.append(f"{dep[:12]} -> {s.subtask_id[:12]}")

        if has_conflict and conflict_detail:
            lines.append("")
            lines.append("### Conflict Notes")
            lines.append(conflict_detail)

        return "\n".join(lines)
