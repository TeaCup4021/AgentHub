from google.adk.agents import LlmAgent
from google.adk.workflow import Workflow, Edge
from google.adk.workflow._graph import START

from app.schemas.orchestrator import OrchestratorPlan
from app.services.adk.models import get_anthropic_llm


class WorkflowBuilder:

    def build(self, plan: OrchestratorPlan) -> Workflow:
        agents: list[LlmAgent] = []
        for st in plan.subtasks:
            agent_name = "agent_" + str(st.agent_id).replace("-", "_")
            agent = LlmAgent(
                name=agent_name,
                model=get_anthropic_llm(),
                instruction=st.instruction,
            )
            agents.append(agent)

        edges: list[Edge] = [
            Edge(from_node=START, to_node=a) for a in agents
        ]

        return Workflow(
            name="orchestrator_plan",
            edges=edges,
            max_concurrency=min(len(agents), 2) if agents else 1,
        )
