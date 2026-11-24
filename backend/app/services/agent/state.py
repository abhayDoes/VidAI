from typing import TypedDict, List, Dict, Any, Optional


class AgentState(TypedDict):
    user_prompt: str
    video_id: str
    video_metadata: Dict[str, Any]
    analysis_data: Dict[str, Any]
    history: List[Dict[str, Any]]
    
    # Decisions & Output
    route: str  # "path_a" or "path_b"
    explanation: str
    plan: List[Dict[str, Any]]
    is_valid: bool
    validation_errors: List[str]

