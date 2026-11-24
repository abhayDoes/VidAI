import os
import shutil
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from app.main import app
from app.captions.settings import caption_settings
from app.captions.storage import (
    validate_video_id,
    get_video_dir,
    write_status,
    read_status,
    write_meta,
    read_meta,
    recover_interrupted_jobs
)
from app.captions.probe import parse_fps


class TestStep2Captions(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.temp_dir = tempfile.mkdtemp()
        self.orig_upload_dir = caption_settings.UPLOAD_DIR
        caption_settings.UPLOAD_DIR = self.temp_dir

    def tearDown(self):
        caption_settings.UPLOAD_DIR = self.orig_upload_dir
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_video_id_validation(self):
        # Valid 32-char hex
        valid_id = "a1b2c3d4e5f678901234567890abcdef"
        self.assertEqual(validate_video_id(valid_id), valid_id)

        # Invalid: uppercase
        with self.assertRaises(ValueError):
            validate_video_id("A1B2C3D4E5F678901234567890ABCDEF")

        # Invalid: non-hex chars
        with self.assertRaises(ValueError):
            validate_video_id("g1b2c3d4e5f678901234567890abcdef")

        # Invalid: too short or too long
        with self.assertRaises(ValueError):
            validate_video_id("12345")
        with self.assertRaises(ValueError):
            validate_video_id(valid_id + "1")

        # Invalid: path traversal attempts
        with self.assertRaises(ValueError):
            validate_video_id("../../etc/passwd")
        with self.assertRaises(ValueError):
            validate_video_id("..\\..\\windows\\system32")

    def test_parse_fps(self):
        self.assertEqual(parse_fps("30/1"), 30.0)
        self.assertEqual(parse_fps("24/1"), 24.0)
        self.assertEqual(round(parse_fps("30000/1001"), 2), 29.97)
        self.assertEqual(parse_fps("0/0"), 0.0)
        self.assertEqual(parse_fps(""), 0.0)

    def test_storage_status_and_meta(self):
        test_id = "11112222333344445555666677778888"

        # Write & read status
        s = write_status(test_id, "uploaded", 0.0, "Ready")
        self.assertEqual(s["state"], "uploaded")
        self.assertEqual(s["progress"], 0.0)
        self.assertEqual(s["video_id"], test_id)

        read_s = read_status(test_id)
        self.assertIsNotNone(read_s)
        self.assertEqual(read_s["state"], "uploaded")

        # Write & read meta
        meta_payload = {
            "duration": 15.5,
            "width": 1920,
            "height": 1080,
            "fps": 30.0,
            "has_audio": True,
            "size_bytes": 1024
        }
        write_meta(test_id, meta_payload)
        read_m = read_meta(test_id)
        self.assertEqual(read_m, meta_payload)

    def test_recover_interrupted_jobs(self):
        interrupted_id = "aaaa2222333344445555666677778888"
        done_id = "bbbb2222333344445555666677778888"

        write_status(interrupted_id, "transcribing", 45.0, "In progress")
        write_status(done_id, "done", 100.0, "Finished")

        recovered = recover_interrupted_jobs()
        self.assertEqual(recovered, 1)

        check_interrupted = read_status(interrupted_id)
        self.assertEqual(check_interrupted["state"], "failed")
        self.assertEqual(check_interrupted["error"], "failed: interrupted")

        check_done = read_status(done_id)
        self.assertEqual(check_done["state"], "done")

    def test_upload_invalid_extension(self):
        res = self.client.post("/videos", files={"file": ("test.txt", b"plain text", "text/plain")})
        self.assertEqual(res.status_code, 400)
        self.assertIn("Unsupported file format", res.json()["detail"])

    def test_status_invalid_video_id(self):
        res = self.client.get("/videos/invalid-id-too-short/status")
        self.assertEqual(res.status_code, 400)

    def test_status_unknown_video_id(self):
        res = self.client.get("/videos/00000000000000000000000000000000/status")
        self.assertEqual(res.status_code, 404)

    def test_get_details_unknown_video_id(self):
        res = self.client.get("/videos/00000000000000000000000000000000")
        self.assertEqual(res.status_code, 404)

    def test_stream_file_range_requests(self):
        test_id = "99992222333344445555666677778888"
        v_dir = get_video_dir(test_id)
        v_dir.mkdir(parents=True, exist_ok=True)
        video_file = v_dir / "original.mp4"
        dummy_bytes = b"0123456789ABCDEF" * 100  # 1600 bytes
        video_file.write_bytes(dummy_bytes)

        # 1. Full file request
        res_full = self.client.get(f"/videos/{test_id}/file")
        self.assertEqual(res_full.status_code, 200)
        self.assertEqual(res_full.content, dummy_bytes)
        self.assertEqual(res_full.headers["Accept-Ranges"], "bytes")

        # 2. Byte range request
        res_range = self.client.get(f"/videos/{test_id}/file", headers={"Range": "bytes=0-15"})
        self.assertEqual(res_range.status_code, 206)
        self.assertEqual(res_range.content, dummy_bytes[:16])
        self.assertEqual(res_range.headers["Content-Range"], f"bytes 0-15/{len(dummy_bytes)}")
        self.assertEqual(res_range.headers["Content-Length"], "16")

        # 3. Invalid range request
        res_invalid_range = self.client.get(f"/videos/{test_id}/file", headers={"Range": "bytes=9999-10000"})
        self.assertEqual(res_invalid_range.status_code, 416)


if __name__ == "__main__":
    unittest.main()
