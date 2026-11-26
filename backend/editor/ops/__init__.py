"""Operations package - exports registry and registers built-in operations."""

from .registry import (
    MIN_SEGMENT_DURATION,
    OPERATIONS,
    OperationSpec,
    format_timestamp,
    get_operation,
    register_operation,
)
from .trim_keep import TrimKeepParams, apply_trim_keep, describe_trim_keep
from .cut_range import CutRangeParams, apply_cut_range, describe_cut_range
from .reset import ResetParams, apply_reset, describe_reset
from .remove_silence import RemoveSilenceParams, apply_remove_silence, describe_remove_silence

__all__ = [
    "MIN_SEGMENT_DURATION",
    "OPERATIONS",
    "OperationSpec",
    "format_timestamp",
    "get_operation",
    "register_operation",
    "TrimKeepParams",
    "apply_trim_keep",
    "describe_trim_keep",
    "CutRangeParams",
    "apply_cut_range",
    "describe_cut_range",
    "ResetParams",
    "apply_reset",
    "describe_reset",
    "RemoveSilenceParams",
    "apply_remove_silence",
    "describe_remove_silence",
]
