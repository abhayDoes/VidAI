import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.captions.settings import caption_settings
from app.captions.storage import (
    ensure_video_dir,
    write_status,
    read_status,
    recover_interrupted_jobs,
    read_json_file
)
from app.captions.pipeline import _process_pipeline_job


class TestStep5Hardening(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.original_upload_dir = caption_settings.UPLOAD_DIR
        self.original_max_mb = caption_settings.MAX_UPLOAD_MB
        caption_settings.UPLOAD_DIR = self.temp_dir
        self.client = TestClient(app)

    def tearDown(self):
        caption_settings.UPLOAD_DIR = self.original_upload_dir
        caption_settings.MAX_UPLOAD_MB = self.original_max_mb
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_no_audio_track_finishes_gracefully(self):
        """Video without audio completes with state 'done', empty captions, and clear message."""
        video_id = "11112222333344445555666677778888"
        vdir = ensure_video_dir(video_id)
        (vdir / "original.mp4").write_bytes(b"dummy silent video content")

        mock_meta = {
            "duration": 15.5,
            "width": 1920,
            "height": 1080,
            "fps": 30.0,
            "has_audio": False,
            "size_bytes": 1024
        }

        import asyncio
        with patch("app.captions.pipeline.probe_video", return_value=mock_meta):
            asyncio.run(_process_pipeline_job(video_id))

        status = read_status(video_id)
        self.assertIsNotNone(status)
        self.assertEqual(status["state"], "done")
        self.assertEqual(status["progress"], 100.0)
        self.assertEqual(status["message"], "No audio track found")

        captions_data = read_json_file(vdir / "captions.json")
        self.assertIsNotNone(captions_data)
        self.assertEqual(captions_data["captions"], [])
        self.assertEqual(captions_data["language"], "none")

        # Subtitle files should be valid empty structures
        srt_content = (vdir / "captions.srt").read_text(encoding="utf-8")
        vtt_content = (vdir / "captions.vtt").read_text(encoding="utf-8")
        self.assertEqual(srt_content, "")
        self.assertTrue(vtt_content.startswith("WEBVTT"))

    def test_huge_file_rejected_with_413(self):
        """Upload exceeding MAX_UPLOAD_MB is rejected with 413 and cleaned up."""
        caption_settings.MAX_UPLOAD_MB = 1  # 1MB limit for test
        large_payload = b"x" * (2 * 1024 * 1024)  # 2MB payload

        response = self.client.post(
            "/videos",
            files={"file": ("large_video.mp4", io.BytesIO(large_payload), "video/mp4")}
        )
        self.assertEqual(response.status_code, 413)
        self.assertIn("exceeds maximum allowed size", response.json()["detail"])

        # Check that no leftover files remain in temp_dir
        subdirs = list(Path(self.temp_dir).iterdir())
        for sd in subdirs:
            original_files = list(sd.glob("original*"))
            self.assertEqual(len(original_files), 0, "Partial large file should be deleted")

    def test_wrong_format_rejected_with_400(self):
        """Non-allowed extensions (.txt, .exe, .pdf, .mp3) rejected with 400."""
        for invalid_name in ["test.txt", "audio.mp3", "doc.pdf", "app.exe"]:
            response = self.client.post(
                "/videos",
                files={"file": (invalid_name, io.BytesIO(b"content"), "application/octet-stream")}
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn("Unsupported file format", response.json()["detail"])

    def test_corrupted_video_marks_pipeline_failed(self):
        """Corrupt video streams cause ffprobe error and set pipeline status to failed."""
        video_id = "22223333444455556666777788889999"
        vdir = ensure_video_dir(video_id)
        (vdir / "original.mp4").write_bytes(b"corrupted header data")

        import asyncio
        with patch("app.captions.pipeline.probe_video", side_effect=ValueError("Invalid video file or corrupted stream")):
            asyncio.run(_process_pipeline_job(video_id))

        status = read_status(video_id)
        self.assertIsNotNone(status)
        self.assertEqual(status["state"], "failed")
        self.assertEqual(status["message"], "Caption pipeline failed")
        self.assertIn("Invalid video file or corrupted stream", status["error"])

    def test_server_restart_recovery(self):
        """Interrupted jobs across all non-final stages become 'failed: interrupted'."""
        in_progress_stages = ["uploaded", "probing", "extracting_audio", "transcribing", "building_captions"]
        video_ids = []

        for i, stage in enumerate(in_progress_stages):
            vid = f"{i:x}" * 32
            video_ids.append(vid)
            write_status(vid, stage, progress=float(i * 10), message=f"Running {stage}")

        # Also add a completed and an already failed job
        done_id = "a" * 32
        failed_id = "b" * 32
        write_status(done_id, "done", progress=100.0, message="Already done")
        write_status(failed_id, "failed", progress=20.0, message="Already failed", error="Original error")

        recovered = recover_interrupted_jobs()
        self.assertEqual(recovered, len(in_progress_stages))

        for vid in video_ids:
            st = read_status(vid)
            self.assertEqual(st["state"], "failed")
            self.assertEqual(st["error"], "failed: interrupted")
            self.assertIn("interrupted", st["message"])

        # Done and previously failed jobs must remain unchanged
        self.assertEqual(read_status(done_id)["state"], "done")
        self.assertEqual(read_status(failed_id)["state"], "failed")
        self.assertEqual(read_status(failed_id)["error"], "Original error")

    def test_path_traversal_protection(self):
        """Malicious or invalid video_id parameters are blocked (400 or 404)."""
        malicious_ids = [
            "../etc/passwd",
            "..\\..\\Windows\\System32",
            "1234",
            "3333444455556666777788889999000z",  # contains non-hex 'z'
            "333344445555666677778888999900001",  # 33 chars
        ]
        for bad_id in malicious_ids:
            res_status = self.client.get(f"/videos/{bad_id}/status")
            self.assertIn(res_status.status_code, [400, 404])

            res_captions = self.client.get(f"/videos/{bad_id}/captions")
            self.assertIn(res_captions.status_code, [400, 404])

            res_file = self.client.get(f"/videos/{bad_id}/file")
            self.assertIn(res_file.status_code, [400, 404])

        # Explicitly verify 400 validation error for a non-traversal invalid hex id
        res = self.client.get("/videos/1234567890abcdef1234567890abcdeg/status")
        self.assertEqual(res.status_code, 400)
        self.assertIn("Invalid video_id", res.json()["detail"])


if __name__ == "__main__":
    unittest.main()
