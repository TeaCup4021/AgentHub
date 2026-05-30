from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orchestrator_task import OrchestratorTask
from app.models.orchestrator_subtask import OrchestratorSubtask
from app.models.message import Message as MsgModel


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

        output_msg_ids = [
            row.output_message_id for row in subtask_rows
            if row.output_message_id is not None
        ]
        msg_map: dict[UUID, MsgModel] = {}
        if output_msg_ids:
            mr = await db.execute(
                select(MsgModel).where(MsgModel.id.in_(output_msg_ids))
            )
            for m in mr.scalars().all():
                msg_map[m.id] = m

        plan = task.plan or {}
        plan_subtasks = plan.get("subtasks", [])
        instruction_map: dict[str, str] = {}
        for st in plan_subtasks:
            sid = st.get("subtask_id", st.get("subtaskId", ""))
            inst = st.get("instruction", "")
            if sid:
                instruction_map[sid] = inst

        sub_summaries: list[SubAgentSummary] = []
        for row in subtask_rows:
            # resolve instruction from plan
            st_id = None
            for st in plan_subtasks:
                agent_id_in_plan = st.get("agentId", st.get("agent_id", ""))
                if str(agent_id_in_plan) == str(row.agent_id):
                    st_id = st.get("subtask_id", st.get("subtaskId", ""))
                    break
            instruction = instruction_map.get(st_id or "", row.instruction or "")

            msg = msg_map.get(row.output_message_id) if row.output_message_id else None
            if msg:
                summary = msg.content[:300]
            else:
                summary = ""

            sub_summaries.append(SubAgentSummary(
                agent_name=row.mode if row.mode else "Agent",
                subtask_id=st_id or str(row.agent_id)[:12],
                status=row.status or "unknown",
                latency_ms=row.latency_ms,
                summary=summary,
                output_message_id=str(row.output_message_id) if row.output_message_id else None,
                depends_on=row.depends_on or [],
            ))

        # conflict detection: same outputKey, different values
        has_conflict = False
        conflict_detail = ""
        output_key_results: dict[str, list[str]] = {}
        plan_sub_map = {st.get("subtaskId", st.get("subtask_id", "")): st for st in plan_subtasks}
        for row in subtask_rows:
            st_id_found = None
            for st in plan_subtasks:
                if str(st.get("agentId", st.get("agent_id", ""))) == str(row.agent_id):
                    st_id_found = st.get("subtaskId", st.get("subtask_id", ""))
                    break
            st = plan_sub_map.get(st_id_found or "", {})
            ok = st.get("outputKey") or st.get("output_key")
            if ok and row.status == "success":
                msg = msg_map.get(row.output_message_id) if row.output_message_id else None
                if msg:
                    if ok not in output_key_results:
                        output_key_results[ok] = []
                    output_key_results[ok].append(msg.content[:200])

        for ok, results in output_key_results.items():
            if len(results) > 1 and len(set(results)) > 1:
                has_conflict = True
                conflict_detail += f"冲突 key `{ok}`: {len(results)} 个 Agent 输出不一致\n"
                for i, r in enumerate(results, 1):
                    conflict_detail += f"  [{i}] {r[:100]}...\n"

        summary_text = self._build_summary_text(task.status or "completed", sub_summaries, has_conflict, conflict_detail)

        return MergeResult(
            summary_text=summary_text,
            sub_summaries=sub_summaries,
            has_conflict=has_conflict,
            conflict_detail=conflict_detail,
        )

    @staticmethod
    def _build_summary_text(
        task_status: str,
        subs: list[SubAgentSummary],
        has_conflict: bool,
        conflict_detail: str,
    ) -> str:
        total = len(subs)
        success_count = sum(1 for s in subs if s.status == "success")
        failed_count = sum(1 for s in subs if s.status == "failed")
        total_latency = sum(s.latency_ms or 0 for s in subs)

        lines = [
            "## 执行摘要",
            f"- 总耗时: {total_latency}ms | 成功: {success_count} / {total}"
            + (f" | 失败: {failed_count}" if failed_count else ""),
            "",
            "### 各 Agent 输出",
            "| Agent | 状态 | 耗时 | 摘要 |",
            "|-------|------|------|------|",
        ]

        for s in subs:
            status_icon = {"success": "✅", "failed": "❌", "running": "⏳", "queued": "⬜"}.get(s.status, "⬜")
            latency_str = f"{s.latency_ms}ms" if s.latency_ms else "-"
            summary_preview = s.summary[:80].replace("\n", " ").replace("|", "\\|") + ("..." if len(s.summary) > 80 else "")
            lines.append(f"| {s.agent_name} | {status_icon} | {latency_str} | {summary_preview} |")

        # dependency chain
        if any(s.depends_on for s in subs):
            lines.append("")
            lines.append("### 依赖执行链")
            for s in subs:
                if s.depends_on:
                    for dep in s.depends_on:
                        dep_label = dep[:12]
                        target_label = s.subtask_id[:12]
                        lines.append(f"{dep_label} ──> {target_label}")

        if has_conflict and conflict_detail:
            lines.append("")
            lines.append("### 冲突说明")
            lines.append(conflict_detail)

        return "\n".join(lines)
