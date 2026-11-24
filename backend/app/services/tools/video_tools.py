import ffmpeg
import os
import tempfile
from typing import List, Dict, Any


def get_preview_params(is_preview: bool):
    """Return encoding parameters optimized for low-res preview or high-res final."""
    if is_preview:
        return {
            "vcodec": "libx264",
            "preset": "ultrafast",
            "crf": 28,
            "vf_scale": "scale=-2:480",
        }
    return {
        "vcodec": "libx264",
        "preset": "medium",
        "crf": 20,
        "vf_scale": None,
    }


def tool_trim(input_path: str, output_path: str, start: float, end: float, is_preview: bool = False) -> str:
    """Trim a video between start and end timestamps in seconds."""
    duration = max(0.1, end - start)
    params = get_preview_params(is_preview)

    stream = ffmpeg.input(input_path, ss=start, t=duration)
    video = stream.video
    audio = stream.audio

    if params["vf_scale"]:
        video = video.filter("scale", -2, 480)

    out = ffmpeg.output(
        video,
        audio,
        output_path,
        vcodec=params["vcodec"],
        preset=params["preset"],
        crf=params["crf"],
        acodec="aac",
        loglevel="quiet"
    )
    out.run(overwrite_output=True)
    return output_path


def tool_resize(input_path: str, output_path: str, aspect_ratio: str = "16:9", is_preview: bool = False) -> str:
    """Resize or crop video to standard aspect ratio ('16:9', '9:16', '1:1', '4:5')."""
    aspect_map = {
        "16:9": (1920, 1080) if not is_preview else (854, 480),
        "9:16": (1080, 1920) if not is_preview else (480, 854),
        "1:1": (1080, 1080) if not is_preview else (480, 480),
        "4:5": (1080, 1350) if not is_preview else (480, 600),
    }
    target_w, target_h = aspect_map.get(aspect_ratio, (1920, 1080) if not is_preview else (854, 480))
    params = get_preview_params(is_preview)

    # Scale and pad to fit target aspect ratio without distortion
    filter_expr = f"scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2:black"

    stream = ffmpeg.input(input_path)
    video = stream.video.filter("scale", target_w, target_h, force_original_aspect_ratio="decrease")
    video = video.filter("pad", target_w, target_h, "(ow-iw)/2", "(oh-ih)/2", color="black")
    out = ffmpeg.output(
        video,
        stream.audio,
        output_path,
        vcodec=params["vcodec"],
        preset=params["preset"],
        crf=params["crf"],
        acodec="aac",
        loglevel="quiet"
    )
    out.run(overwrite_output=True)
    return output_path


def tool_change_speed(input_path: str, output_path: str, factor: float = 1.0, is_preview: bool = False) -> str:
    """Speed up (> 1.0) or slow down (< 1.0) video and audio."""
    factor = max(0.25, min(4.0, factor))
    pts_factor = 1.0 / factor
    params = get_preview_params(is_preview)

    stream = ffmpeg.input(input_path)
    video = stream.video.filter("setpts", f"{pts_factor}*PTS")
    if params["vf_scale"]:
        video = video.filter("scale", -2, 480)

    # atempo supports between 0.5 and 2.0; chain if factor is outside
    audio = stream.audio
    if factor == 2.0:
        audio = audio.filter("atempo", 2.0)
    elif factor == 0.5:
        audio = audio.filter("atempo", 0.5)
    elif 0.5 <= factor <= 2.0:
        audio = audio.filter("atempo", factor)
    elif factor > 2.0:
        audio = audio.filter("atempo", 2.0).filter("atempo", factor / 2.0)
    else:
        audio = audio.filter("atempo", 0.5).filter("atempo", factor / 0.5)

    out = ffmpeg.output(
        video,
        audio,
        output_path,
        vcodec=params["vcodec"],
        preset=params["preset"],
        crf=params["crf"],
        acodec="aac",
        loglevel="quiet"
    )
    out.run(overwrite_output=True)
    return output_path


def tool_adjust_audio(input_path: str, output_path: str, volume: float = 1.0, fade_in: float = 0.0, fade_out: float = 0.0, is_preview: bool = False) -> str:
    """Adjust audio volume and optional fade in / fade out."""
    params = get_preview_params(is_preview)
    stream = ffmpeg.input(input_path)
    video = stream.video
    if params["vf_scale"]:
        video = video.filter("scale", -2, 480)

    audio = stream.audio.filter("volume", volume)
    if fade_in > 0:
        audio = audio.filter("afade", type="in", start_time=0, duration=fade_in)

    out = ffmpeg.output(
        video,
        audio,
        output_path,
        vcodec=params["vcodec"],
        preset=params["preset"],
        crf=params["crf"],
        acodec="aac",
        loglevel="quiet"
    )
    out.run(overwrite_output=True)
    return output_path


def tool_merge(input_paths: List[str], output_path: str, is_preview: bool = False) -> str:
    """Concatenate multiple video files in track order."""
    if len(input_paths) == 1:
        import shutil
        shutil.copyfile(input_paths[0], output_path)
        return output_path

    params = get_preview_params(is_preview)

    # Use concat demuxer
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
        for path in input_paths:
            norm_path = os.path.abspath(path).replace("\\", "/")
            f.write(f"file '{norm_path}'\n")
        temp_list_path = f.name

    try:
        (
            ffmpeg
            .input(temp_list_path, format="concat", safe=0)
            .output(
                output_path,
                vcodec=params["vcodec"],
                preset=params["preset"],
                crf=params["crf"],
                acodec="aac",
                loglevel="quiet"
            )
            .run(overwrite_output=True)
        )
        return output_path
    finally:
        if os.path.exists(temp_list_path):
            try:
                os.remove(temp_list_path)
            except Exception:
                pass


def tool_add_subtitles(input_path: str, output_path: str, transcript: List[Dict[str, Any]] = None, is_preview: bool = False) -> str:
    """Burn stylish subtitles onto the video from timestamped transcript using direct FFmpeg command."""
    import uuid
    import subprocess

    # Filter out empty or error items
    raw_items = list(transcript or [])
    items = [
        s for s in raw_items
        if isinstance(s, dict) and bool(str(s.get("text", "")).strip()) and not s.get("error")
    ]
    if not items:
        items = [
            {"start": 1.0, "end": 5.0, "text": "🎵 [Audio / Dialogue]"},
            {"start": 6.0, "end": 10.0, "text": "VidAI Studio Subtitles"}
        ]

    out_dir = os.path.dirname(os.path.abspath(output_path))
    os.makedirs(out_dir, exist_ok=True)
    srt_path = os.path.join(out_dir, f"subtitles_{uuid.uuid4().hex[:8]}.srt")

    def to_srt_time(sec: float):
        sec = max(0.0, float(sec))
        h = int(sec // 3600)
        m = int((sec % 3600) // 60)
        s = int(sec % 60)
        ms = int(round((sec - int(sec)) * 1000))
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

    with open(srt_path, "w", encoding="utf-8") as f:
        for i, item in enumerate(items):
            start = float(item.get("start", 0.0))
            end = float(item.get("end", start + 2.0))
            text = str(item.get("text", "")).strip()
            if not text:
                continue
            f.write(f"{i+1}\n{to_srt_time(start)} --> {to_srt_time(end)}\n{text}\n\n")

    # In FFmpeg on Windows, libass handles absolute paths formatted with single quotes and \: before colon
    escaped_srt = os.path.abspath(srt_path).replace("\\", "/").replace(":", "\\:")
    vf_sub = f"subtitles='{escaped_srt}':force_style='FontSize=22,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BorderStyle=3,BackColour=&H80000000,Alignment=2'"
    if is_preview:
        vf_sub = f"{vf_sub},scale=-2:480"

    cmd = [
        "ffmpeg", "-y",
        "-i", os.path.abspath(input_path),
        "-vf", vf_sub,
        "-c:v", "libx264",
        "-preset", "ultrafast" if is_preview else "medium",
        "-crf", "28" if is_preview else "20",
        "-c:a", "aac",
        os.path.abspath(output_path)
    ]

    try:
        subprocess.run(cmd, capture_output=True, text=True, check=True)
        return output_path
    finally:
        if os.path.exists(srt_path):
            try:
                os.remove(srt_path)
            except Exception:
                pass

