"""Operations registry for video editor."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, Type

from pydantic import BaseModel

from ..timeline import Timeline

MIN_SEGMENT_DURATION = 0.05


def format_timestamp(seconds: float) -> str:
    """Format seconds into MM:SS or HH:MM:SS string."""
    s = max(0.0, float(seconds))
    hrs = int(s // 3600)
    mins = int((s % 3600) // 60)
    secs = s % 60
    if hrs > 0:
        return f"{hrs:02d}:{mins:02d}:{secs:04.1f}"
    return f"{mins:02d}:{secs:04.1f}"


@dataclass
class OperationSpec:
    name: str
    description: str
    params_model: Type[BaseModel]
    apply: Callable[[Timeline, Any], Timeline]
    describe: Callable[[Any], str]


OPERATIONS: Dict[str, OperationSpec] = {}


def register_operation(
    name: str,
    description: str,
    params_model: Type[BaseModel],
    describe: Callable[[Any], str],
):
    """Decorator to register a new timeline operation."""

    def decorator(func: Callable[[Timeline, Any], Timeline]):
        spec = OperationSpec(
            name=name,
            description=description,
            params_model=params_model,
            apply=func,
            describe=describe,
        )
        OPERATIONS[name] = spec
        return func

    return decorator


def get_operation(name: str) -> OperationSpec:
    """Retrieve an operation spec by name or raise KeyError."""
    if name not in OPERATIONS:
        raise KeyError(f"Operation '{name}' is not registered. Available: {list(OPERATIONS.keys())}")
    return OPERATIONS[name]
