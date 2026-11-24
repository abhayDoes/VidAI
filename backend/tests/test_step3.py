import shutil
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from app.main import app
from app.captions.settings import caption_settings
from app.captions.storage import (
    get_video_dir,
    write_status,
    write_meta,
    write_json_file
)
from app.captions.captions import (
    format_timestamp_srt,
    format_timestamp_vtt,
    build_caption_lines,
    generate_srt,
    generate_vtt,
    validate_captions_input
)


class TestStep3Captions(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.temp_dir = tempfile.mkdtemp()
        self.orig_upload_dir = caption_settings.UPLOAD_DIR
        caption_settings.UPLOAD_DIR = self.temp_dir

    def tearDown(self):
        caption_settings.UPLOAD_DIR = self.orig_upload_dir
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_timestamp_formatting_srt(self):
        self.assertEqual(format_timestamp_srt(0.0), "00:00:00,000")
        self.assertEqual(format_timestamp_srt(1.5), "00:00:01,500")
        self.assertEqual(format_timestamp_srt(65.123), "00:01:05,123")
        self.assertEqual(format_timestamp_srt(3661.050), "01:01:01,050")

    def test_timestamp_formatting_vtt(self):
        self.assertEqual(format_timestamp_vtt(0.0), "00:00:00.000")
        self.assertEqual(format_timestamp_vtt(1.5), "00:00:01.500")
        self.assertEqual(format_timestamp_vtt(65.123), "00:01:05.123")
        self.assertEqual(format_timestamp_vtt(3661.050), "01:01:01.050")

    def test_caption_building_empty(self):
        self.assertEqual(build_caption_lines([]), [])

    def test_caption_building_rules(self):
        # Sample word timestamps spanning ~12 seconds
        words = [
            {"word": "Hello", "start": 0.5, "end": 0.9},
            {"word": "everyone,", "start": 1.0, "end": 1.5},
            {"word": "welcome", "start": 1.6, "end": 2.0},
            {"word": "to", "start": 2.1, "end": 2.2},
            {"word": "my", "start": 2.3, "end": 2.5},
            {"word": "channel.", "start": 2.6, "end": 3.1},
            {"word": "Today", "start": 4.5, "end": 4.9},
            {"word": "we", "start": 5.0, "end": 5.2},
            {"word": "are", "start": 5.3, "end": 5.5},
            {"word": "building", "start": 5.6, "end": 6.1},
            {"word": "an", "start": 6.2, "end": 6.4},
            {"word": "AI", "start": 6.5, "end": 6.8},
            {"word": "video", "start": 6.9, "end": 7.3},
            {"word": "editor", "start": 7.4, "end": 7.9},
            {"word": "with", "start": 8.0, "end": 8.3},
            {"word": "offline", "start": 8.4, "end": 8.9},
            {"word": "captions.", "start": 9.0, "end": 9.6},
        ]

        captions = build_caption_lines(words, video_duration=12.0)
        self.assertGreater(len(captions), 0)

        prev_end = 0.0
        for c in captions:
            # Check duration limits
            duration = c["end"] - c["start"]
            self.assertGreaterEqual(duration, caption_settings.MIN_DURATION_SECONDS - 0.01)
            self.assertLessEqual(duration, caption_settings.MAX_DURATION_SECONDS + 0.1)

            # Check no overlap
            self.assertGreaterEqual(c["start"], prev_end - 0.01)
            prev_end = c["end"]

            # Check lines count
            lines = c["text"].split("\n")
            self.assertLessEqual(len(lines), caption_settings.MAX_LINES_PER_CAPTION)

            # Check max line length
            for line in lines:
                self.assertLessEqual(len(line), caption_settings.MAX_CHARS_PER_LINE)

    def test_generate_srt_and_vtt(self):
        sample_caps = [
            {"id": 1, "start": 0.52, "end": 3.10, "text": "Hello everyone,\nwelcome to my channel."},
            {"id": 2, "start": 4.50, "end": 9.60, "text": "Today we are building VidAI."}
        ]

        srt = generate_srt(sample_caps)
        self.assertIn("1\n00:00:00,520 --> 00:00:03,100\nHello everyone,\nwelcome to my channel.", srt)
        self.assertIn("2\n00:00:04,500 --> 00:00:09,600\nToday we are building VidAI.", srt)

        vtt = generate_vtt(sample_caps)
        self.assertTrue(vtt.startswith("WEBVTT\n"))
        self.assertIn("00:00:00.520 --> 00:00:03.100", vtt)
        self.assertIn("00:00:04.500 --> 00:00:09.600", vtt)

    def test_validate_captions_input(self):
        # Valid
        valid = [
            {"id": 1, "start": 0.0, "end": 2.0, "text": "First"},
            {"id": 2, "start": 2.5, "end": 5.0, "text": "Second"}
        ]
        validate_captions_input(valid, video_duration=10.0)

        # Non-list
        with self.assertRaises(ValueError):
            validate_captions_input("not a list")

        # Missing keys
        with self.assertRaises(ValueError):
            validate_captions_input([{"start": 1.0, "text": "No end"}])

        # Negative start
        with self.assertRaises(ValueError):
            validate_captions_input([{"start": -1.0, "end": 2.0, "text": "Negative"}])

        # End <= start
        with self.assertRaises(ValueError):
            validate_captions_input([{"start": 3.0, "end": 2.0, "text": "Backwards"}])

        # Overlapping
        with self.assertRaises(ValueError):
            validate_captions_input([
                {"start": 1.0, "end": 4.0, "text": "A"},
                {"start": 3.0, "end": 5.0, "text": "Overlaps with A"}
            ])

        # Exceeds duration
        with self.assertRaises(ValueError):
            validate_captions_input([{"start": 1.0, "end": 15.0, "text": "Exceeds"}], video_duration=10.0)

    def test_get_captions_not_ready_409(self):
        test_id = "22223333444455556666777788889999"
        write_status(test_id, "transcribing", 50.0, "Processing audio")

        res = self.client.get(f"/videos/{test_id}/captions")
        self.assertEqual(res.status_code, 409)
        self.assertIn("Captions not ready yet", res.json()["detail"])

    def test_get_captions_failed_500(self):
        test_id = "33333333444455556666777788889999"
        write_status(test_id, "failed", 0.0, "Fatal error", error="Corrupted audio track")

        res = self.client.get(f"/videos/{test_id}/captions")
        self.assertEqual(res.status_code, 500)
        self.assertIn("Corrupted audio track", res.json()["detail"])

    def test_get_and_put_captions_success(self):
        test_id = "44444444444455556666777788889999"
        v_dir = get_video_dir(test_id)
        v_dir.mkdir(parents=True, exist_ok=True)
        write_status(test_id, "done", 100.0, "Completed")
        write_meta(test_id, {"duration": 10.0, "width": 1920, "height": 1080, "fps": 30.0, "has_audio": True})

        initial_caps = {
            "video_id": test_id,
            "language": "en",
            "duration": 10.0,
            "captions": [{"id": 1, "start": 0.5, "end": 3.0, "text": "Original text"}]
        }
        write_json_file(v_dir / "captions.json", initial_caps)
        (v_dir / "captions.srt").write_text(generate_srt(initial_caps["captions"]), encoding="utf-8")
        (v_dir / "captions.vtt").write_text(generate_vtt(initial_caps["captions"]), encoding="utf-8")

        # 1. GET /captions
        res_get = self.client.get(f"/videos/{test_id}/captions")
        self.assertEqual(res_get.status_code, 200)
        self.assertEqual(res_get.json()["captions"][0]["text"], "Original text")

        # 2. PUT /captions with edited text
        edited_caps = [
            {"start": 0.5, "end": 3.0, "text": "Edited text"},
            {"start": 4.0, "end": 7.5, "text": "Second line"}
        ]
        res_put = self.client.put(f"/videos/{test_id}/captions", json={"captions": edited_caps})
        self.assertEqual(res_put.status_code, 200)
        self.assertEqual(len(res_put.json()["captions"]), 2)
        self.assertEqual(res_put.json()["captions"][0]["text"], "Edited text")

        # 3. GET /captions.srt and /captions.vtt downloads
        res_srt = self.client.get(f"/videos/{test_id}/captions.srt")
        self.assertEqual(res_srt.status_code, 200)
        self.assertIn("Edited text", res_srt.text)
        self.assertIn("Second line", res_srt.text)

        res_vtt = self.client.get(f"/videos/{test_id}/captions.vtt")
        self.assertEqual(res_vtt.status_code, 200)
        self.assertTrue(res_vtt.text.startswith("WEBVTT"))
        self.assertIn("Edited text", res_vtt.text)

    def test_pipeline_with_mocked_transcriber(self):
        import asyncio
        from unittest.mock import patch
        from app.captions.pipeline import _process_pipeline_job

        test_id = "55555555555555556666777788889999"
        v_dir = get_video_dir(test_id)
        v_dir.mkdir(parents=True, exist_ok=True)
        (v_dir / "original.mp4").write_bytes(b"dummy video data")
        write_status(test_id, "uploaded", 0.0, "Ready")

        mock_meta = {
            "duration": 6.0,
            "width": 1280,
            "height": 720,
            "fps": 30.0,
            "has_audio": True,
            "size_bytes": 1024
        }
        mock_words = [
            {"word": "Test", "start": 0.5, "end": 1.2, "probability": 0.99},
            {"word": "captions", "start": 1.3, "end": 2.5, "probability": 0.98},
            {"word": "pipeline.", "start": 2.6, "end": 3.5, "probability": 0.97}
        ]

        def fake_extract_audio(video_path, out_path):
            out_path.write_bytes(b"RIFF dummy wav data")
            return out_path

        def fake_transcribe(audio_path, duration, on_progress=None):
            if on_progress:
                on_progress(50.0, "Transcribing 50%")
            return {"language": "en", "duration": duration, "words": mock_words}

        with patch("app.captions.pipeline.probe_video", return_value=mock_meta):
            with patch("app.captions.pipeline.extract_audio", side_effect=fake_extract_audio):
                with patch("app.captions.pipeline.transcribe_audio_file", side_effect=fake_transcribe):
                    asyncio.run(_process_pipeline_job(test_id))

        # Verify final status
        final_status = write_status(test_id, "done")
        check_status = self.client.get(f"/videos/{test_id}/status").json()
        self.assertEqual(check_status["state"], "done")

        # Verify all files written
        self.assertTrue((v_dir / "meta.json").is_file())
        self.assertTrue((v_dir / "status.json").is_file())
        self.assertTrue((v_dir / "audio.wav").is_file())
        self.assertTrue((v_dir / "captions.json").is_file())
        self.assertTrue((v_dir / "captions.srt").is_file())
        self.assertTrue((v_dir / "captions.vtt").is_file())

        # Verify captions content
        captions_res = self.client.get(f"/videos/{test_id}/captions").json()
        self.assertEqual(captions_res["language"], "en")
        self.assertGreater(len(captions_res["captions"]), 0)
        self.assertIn("Test captions pipeline.", captions_res["captions"][0]["text"])


if __name__ == "__main__":
    unittest.main()
