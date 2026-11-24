from langgraph.graph import StateGraph, END
from .state import AgentState
from .planner import plan_edit
from app.services.tools.validator import validate_plan


def router_and_planner_node(state: AgentState) -> dict:
    """Evaluate request, select Path A or Path B, and construct plan."""
    result = plan_edit(state)
    return {
        "route": result.get("route", "path_a"),
        "explanation": result.get("explanation", ""),
        "plan": result.get("plan", [])
    }


def validator_node(state: AgentState) -> dict:
    """Validate planned tools and parameters against video limits."""
    route = state.get("route", "path_a")
    plan = state.get("plan", [])
    duration = state.get("video_metadata", {}).get("duration", 0.0)

    if route == "path_b":
        return {
            "is_valid": True,
            "validation_errors": []
        }

    is_valid, errors = validate_plan(plan, video_duration=duration)
    return {
        "is_valid": is_valid,
        "validation_errors": errors
    }


# Build LangGraph workflow
workflow = StateGraph(AgentState)

workflow.add_node("planner", router_and_planner_node)
workflow.add_node("validator", validator_node)

workflow.set_entry_point("planner")
workflow.add_edge("planner", "validator")
workflow.add_edge("validator", END)

agent_graph = workflow.compile()


async def run_agent(state: AgentState) -> AgentState:
    """Execute the compiled LangGraph agent graph."""
    final_state = await agent_graph.ainvoke(state)
    return final_state

