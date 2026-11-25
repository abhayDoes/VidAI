"""Unit tests for Timeline model, coordinate mappings, and Phase 1 operations."""

import tempfile
from pathlib import Path
import pytest
from pydantic import ValidationError

from backend.editor.ops.cut_range import CutRangeParams, apply_cut_range
from backend.editor.ops.registry import OPERATIONS, get_operation
from backend.editor.ops.reset import ResetParams, apply_reset
from backend.editor.ops.trim_keep import TrimKeepParams, apply_trim_keep
from backend.editor.timeline import (
    Segment,
    Timeline,
    create_initial_timeline,
    list_timeline_versions,
    load_timeline,
    load_timeline_version,
    output_to_source_time,
    save_timeline,
    source_to_output_time,
    total_duration,
)


def test_fresh_timeline_trim():
    """Trim on a fresh timeline: keep only [start, end]."""
    tl = create_initial_timeline("vid_1", 30.0)
    assert total_duration(tl) == 30.0
    assert len(tl.segments) == 1

    params = TrimKeepParams(start=5.0, end=15.0)
    new_tl = apply_trim_keep(tl, params)

    assert new_tl.version == 2
    assert len(new_tl.segments) == 1
    seg = new_tl.segments[0]
    assert seg.src_start == 5.0
    assert seg.src_end == 15.0
    assert total_duration(new_tl) == 10.0


def test_cut_in_the_middle():
    """Cut in the middle of a segment splits it into two segments and closes the gap."""
    tl = create_initial_timeline("vid_1", 20.0)
    params = CutRangeParams(start=5.0, end=10.0)
    new_tl = apply_cut_range(tl, params)

    assert new_tl.version == 2
    assert len(new_tl.segments) == 2
    assert new_tl.segments[0].src_start == 0.0
    assert new_tl.segments[0].src_end == 5.0
    assert new_tl.segments[1].src_start == 10.0
    assert new_tl.segments[1].src_end == 20.0
    assert total_duration(new_tl) == 15.0


def test_cut_spanning_two_segments():
    """Cut that starts in one segment and ends in a subsequent segment."""
    tl = Timeline(
        video_id="vid_1",
        source_duration=30.0,
        segments=[
            Segment(id="s1", src_start=0.0, src_end=10.0),   # output: [0.0, 10.0]
            Segment(id="s2", src_start=20.0, src_end=30.0),  # output: [10.0, 20.0]
        ],
        version=1,
    )
    assert total_duration(tl) == 20.0

    # Cut output [7.0, 14.0] (duration 7.0)
    # Seg 1 keeps [0.0, 7.0] (src [0.0, 7.0])
    # Seg 2 keeps [14.0, 20.0] -> offset 4.0 in seg 2 -> src [24.0, 30.0]
    params = CutRangeParams(start=7.0, end=14.0)
    new_tl = apply_cut_range(tl, params)

    assert len(new_tl.segments) == 2
    assert new_tl.segments[0].src_start == 0.0
    assert new_tl.segments[0].src_end == 7.0
    assert new_tl.segments[1].src_start == 24.0
    assert new_tl.segments[1].src_end == 30.0
    assert total_duration(new_tl) == 13.0


def test_cut_at_start_and_end():
    """Cut at start [0, start] and cut at end [end, duration]."""
    tl = create_initial_timeline("vid_1", 10.0)

    # Cut at start
    cut_start_tl = apply_cut_range(tl, CutRangeParams(start=0.0, end=3.0))
    assert len(cut_start_tl.segments) == 1
    assert cut_start_tl.segments[0].src_start == 3.0
    assert cut_start_tl.segments[0].src_end == 10.0
    assert total_duration(cut_start_tl) == 7.0

    # Cut at end
    cut_end_tl = apply_cut_range(tl, CutRangeParams(start=7.0, end=10.0))
    assert len(cut_end_tl.segments) == 1
    assert cut_end_tl.segments[0].src_start == 0.0
    assert cut_end_tl.segments[0].src_end == 7.0
    assert total_duration(cut_end_tl) == 7.0


def test_trim_after_a_cut():
    """Applying a trim after a cut on multi-segment timeline."""
    tl = create_initial_timeline("vid_1", 30.0)

    # Cut out [10.0, 20.0] -> 2 segments: [0, 10] and [20, 30], output total = 20.0
    tl_cut = apply_cut_range(tl, CutRangeParams(start=10.0, end=20.0))
    assert len(tl_cut.segments) == 2
    assert total_duration(tl_cut) == 20.0

    # Output timeline: Seg 1 is [0, 10], Seg 2 is [10, 20]
    # Trim keep output [5.0, 15.0]
    # Seg 1 keeps output [5, 10] -> src [5, 10]
    # Seg 2 keeps output [10, 15] -> src [20, 25]
    tl_trimmed = apply_trim_keep(tl_cut, TrimKeepParams(start=5.0, end=15.0))
    assert len(tl_trimmed.segments) == 2
    assert tl_trimmed.segments[0].src_start == 5.0
    assert tl_trimmed.segments[0].src_end == 10.0
    assert tl_trimmed.segments[1].src_start == 20.0
    assert tl_trimmed.segments[1].src_end == 25.0
    assert total_duration(tl_trimmed) == 10.0


def test_out_of_range_values():
    """Validation of invalid inputs and bounds."""
    # Negative start
    with pytest.raises(ValidationError):
        TrimKeepParams(start=-1.0, end=5.0)

    # start >= end
    with pytest.raises(ValidationError):
        TrimKeepParams(start=10.0, end=5.0)
    with pytest.raises(ValidationError):
        TrimKeepParams(start=5.0, end=5.0)
    with pytest.raises(ValidationError):
        CutRangeParams(start=10.0, end=5.0)

    tl = create_initial_timeline("vid_1", 10.0)

    # Cut completely outside the timeline range leaves timeline intact
    tl_cut = apply_cut_range(tl, CutRangeParams(start=15.0, end=20.0))
    assert len(tl_cut.segments) == 1
    assert total_duration(tl_cut) == 10.0

    # Trim completely outside yields empty segments list
    tl_trim = apply_trim_keep(tl, TrimKeepParams(start=15.0, end=20.0))
    assert len(tl_trim.segments) == 0
    assert total_duration(tl_trim) == 0.0


def test_reset():
    """Reset restores the full original timeline with 1 segment."""
    tl = create_initial_timeline("vid_1", 60.0)
    tl_cut1 = apply_cut_range(tl, CutRangeParams(start=10.0, end=20.0))
    tl_cut2 = apply_cut_range(tl_cut1, CutRangeParams(start=20.0, end=30.0))
    assert len(tl_cut2.segments) == 3

    tl_reset = apply_reset(tl_cut2, ResetParams())
    assert tl_reset.version == tl_cut2.version + 1
    assert len(tl_reset.segments) == 1
    assert tl_reset.segments[0].src_start == 0.0
    assert tl_reset.segments[0].src_end == 60.0
    assert total_duration(tl_reset) == 60.0


def test_drop_tiny_segments():
    """Segments smaller than 0.05s are dropped."""
    tl = create_initial_timeline("vid_1", 10.0)
    # Cut [0.0, 9.97] leaves 0.03s (< 0.05s) at the end
    tl_cut = apply_cut_range(tl, CutRangeParams(start=0.0, end=9.97))
    assert len(tl_cut.segments) == 0


def test_operations_registry():
    """Operations registry contains all Phase 1 operations with proper specs."""
    assert "trim_keep" in OPERATIONS
    assert "cut_range" in OPERATIONS
    assert "reset" in OPERATIONS

    trim_spec = get_operation("trim_keep")
    assert trim_spec.name == "trim_keep"
    assert trim_spec.describe(TrimKeepParams(start=1.0, end=5.0)) == "Keep 00:01.0–00:05.0"

    cut_spec = get_operation("cut_range")
    assert cut_spec.name == "cut_range"
    assert cut_spec.describe(CutRangeParams(start=65.0, end=75.0)) == "Cut 01:05.0–01:15.0"

    reset_spec = get_operation("reset")
    assert reset_spec.name == "reset"
    assert reset_spec.describe(ResetParams()) == "Reset timeline to original"


def test_coordinate_mapping():
    """Mapping between output time and source time."""
    tl = Timeline(
        video_id="vid_1",
        source_duration=50.0,
        segments=[
            Segment(id="s1", src_start=5.0, src_end=15.0),   # output: [0.0, 10.0]
            Segment(id="s2", src_start=30.0, src_end=40.0),  # output: [10.0, 20.0]
        ],
        version=1,
    )

    # Output to source
    assert output_to_source_time(tl, 0.0) == 5.0
    assert output_to_source_time(tl, 5.0) == 10.0
    assert output_to_source_time(tl, 10.0) == 15.0  # boundary of seg 1
    assert output_to_source_time(tl, 12.0) == 32.0  # 2.0s into seg 2
    assert output_to_source_time(tl, 20.0) == 40.0
    assert output_to_source_time(tl, 25.0) is None  # beyond total duration

    # Source to output
    assert source_to_output_time(tl, 5.0) == 0.0
    assert source_to_output_time(tl, 10.0) == 5.0
    assert source_to_output_time(tl, 15.0) == 10.0
    assert source_to_output_time(tl, 20.0) is None  # in cut region [15, 30]
    assert source_to_output_time(tl, 30.0) == 10.0
    assert source_to_output_time(tl, 35.0) == 15.0
    assert source_to_output_time(tl, 40.0) == 20.0
    assert source_to_output_time(tl, 45.0) is None  # beyond seg 2


def test_timeline_persistence():
    """Timeline save, load, history snapshots, and version listing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        base_dir = Path(tmpdir)
        vid_id = "test_vid_123"

        tl_v1 = create_initial_timeline(vid_id, 45.0)
        save_timeline(tl_v1, base_dir=base_dir)

        # Verify main timeline file exists and loads
        loaded_v1 = load_timeline(vid_id, base_dir=base_dir)
        assert loaded_v1 is not None
        assert loaded_v1.video_id == vid_id
        assert loaded_v1.version == 1
        assert total_duration(loaded_v1) == 45.0

        # Perform edit and save v2
        tl_v2 = apply_cut_range(loaded_v1, CutRangeParams(start=10.0, end=20.0))
        save_timeline(tl_v2, base_dir=base_dir)

        # Current is now v2
        loaded_current = load_timeline(vid_id, base_dir=base_dir)
        assert loaded_current.version == 2
        assert total_duration(loaded_current) == 35.0

        # Check version listing
        versions = list_timeline_versions(vid_id, base_dir=base_dir)
        assert versions == [1, 2]

        # Load specific history version
        v1_from_hist = load_timeline_version(vid_id, 1, base_dir=base_dir)
        assert v1_from_hist is not None
        assert v1_from_hist.version == 1
        assert total_duration(v1_from_hist) == 45.0
