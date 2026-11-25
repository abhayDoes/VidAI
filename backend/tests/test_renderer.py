"""Unit and integration tests for FFmpeg timeline renderer."""

import json
import subprocess
import tempfile
from pathlib import Path
import pytest

from backend.editor.renderer import (
    build_filter_complex,
    execute_render_job,
    find_original_video,
    get_render_job,
    has_audio_stream,
)
from backend.editor.timeline import Segment, Timeline, save_timeline


def test_build_filter_complex():
    """Verify filter complex construction for audio and video streams."""
    segs = [
        Segment(id="s1", src_start=0.0, src_end=5.0),
        Segment(id="s2", src_start=10.0, src_end=15.0),
    ]

    # With audio
    fc_with_a, maps_with_a = build_filter_complex(segs, has_audio=True)
    assert "[0:v]trim=start=0.000:end=5.000" in fc_with_a
    assert "[0:a]atrim=start=10.000:end=15.000" in fc_with_a
    assert "concat=n=2:v=1:a=1[concat_v][concat_a]" in fc_with_a
    assert maps_with_a == ["-map", "[concat_v]", "-map", "[concat_a]"]

    # Without audio
    fc_no_a, maps_no_a = build_filter_complex(segs, has_audio=False)
    assert "[0:v]trim=start=0.000:end=5.000" in fc_no_a
    assert "atrim" not in fc_no_a
    assert "concat=n=2:v=1:a=0[concat_v]" in fc_no_a
    assert maps_no_a == ["-map", "[concat_v]"]


def test_render_sample_two_segments():
    """Render a 10-second sample video with 2 segments and verify duration within 0.1s using ffprobe."""
    with tempfile.TemporaryDirectory() as tmpdir:
        base_dir = Path(tmpdir)
        vid_id = "sample_test_vid"
        v_dir = base_dir / vid_id
        v_dir.mkdir(parents=True, exist_ok=True)
        orig_file = v_dir / "original.mp4"

        # Generate a 10-second synthetic test video with audio using ffmpeg
        gen_cmd = [
            "ffmpeg",
            "-y",
            "-f", "lavfi",
            "-i", "testsrc=duration=10:size=160x120:rate=10",
            "-f", "lavfi",
            "-i", "sine=frequency=440:duration=10",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-tune", "zerolatency",
            "-c:a", "aac",
            "-t", "10",
            str(orig_file),
        ]
        res = subprocess.run(gen_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        assert res.returncode == 0, f"Failed to generate test video: {res.stderr}"
        assert orig_file.exists()
        assert has_audio_stream(orig_file) is True

        # Build timeline with 2 segments: [1.0 - 4.0] (3s) and [6.0 - 9.0] (3s) -> Total = 6.0s
        tl = Timeline(
            video_id=vid_id,
            source_duration=10.0,
            segments=[
                Segment(id="seg1", src_start=1.0, src_end=4.0),
                Segment(id="seg2", src_start=6.0, src_end=9.0),
            ],
            version=1,
        )
        save_timeline(tl, base_dir=base_dir)

        # Execute render job synchronously
        job_id = "test_job_123"
        execute_render_job(job_id, vid_id, tl, base_dir=base_dir)

        job = get_render_job(job_id, video_id=vid_id, base_dir=base_dir)
        assert job is not None
        assert job.status == "done", f"Render failed: {job.error}"
        assert job.progress == 100.0
        assert job.output_path is not None
        assert Path(job.output_path).exists()

        # Probe the rendered video duration using ffprobe
        probe_cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            job.output_path,
        ]
        probe_res = subprocess.run(probe_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        assert probe_res.returncode == 0, f"ffprobe error: {probe_res.stderr}"

        actual_duration = float(probe_res.stdout.strip())
        expected_duration = 6.0

        # Verify duration is within 0.1s of expected 6.0s
        assert abs(actual_duration - expected_duration) < 0.1, (
            f"Expected duration {expected_duration}s (+-0.1s), but got {actual_duration}s"
        )
