import ffmpeg
import json
import subprocess


def extract_metadata(file_path: str) -> dict:
    """Extract duration, resolution, codecs, frame rate using ffprobe."""
    try:
        probe = ffmpeg.probe(file_path)
        video_stream = next((stream for stream in probe['streams'] if stream['codec_type'] == 'video'), None)
        audio_stream = next((stream for stream in probe['streams'] if stream['codec_type'] == 'audio'), None)

        duration = float(probe['format'].get('duration', 0.0))
        width = int(video_stream['width']) if video_stream and 'width' in video_stream else 0
        height = int(video_stream['height']) if video_stream and 'height' in video_stream else 0
        
        # Calculate fps
        fps = 30.0
        if video_stream and 'r_frame_rate' in video_stream:
            r_fps = video_stream['r_frame_rate'].split('/')
            if len(r_fps) == 2 and float(r_fps[1]) > 0:
                fps = round(float(r_fps[0]) / float(r_fps[1]), 2)

        return {
            "duration": duration,
            "width": width,
            "height": height,
            "aspect_ratio": f"{width}:{height}" if width and height else "16:9",
            "fps": fps,
            "video_codec": video_stream.get('codec_name', 'unknown') if video_stream else None,
            "audio_codec": audio_stream.get('codec_name', 'none') if audio_stream else None,
            "has_audio": audio_stream is not None,
            "bitrate": int(probe['format'].get('bit_rate', 0)),
            "size_bytes": int(probe['format'].get('size', 0)),
        }
    except Exception as e:
        return {
            "duration": 0.0,
            "width": 1920,
            "height": 1080,
            "aspect_ratio": "16:9",
            "fps": 30.0,
            "error": str(e)
        }

