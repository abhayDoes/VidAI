import ffmpeg
import os
import tempfile


def trim_video(input_path, output_path, start, duration):
    (
        ffmpeg
        .input(input_path, ss=start, t=duration)
        .output(output_path)
        .run(overwrite_output=True)
    )
    return output_path


def resize_video(input_path, output_path, width, height):
    (
        ffmpeg
        .input(input_path)
        .output(
            output_path,
            vf=f"scale={width}:{height}"
        )
        .run(overwrite_output=True)
    )
    return output_path


def crop_video(input_path, output_path, width, height, x=0, y=0):
    (
        ffmpeg
        .input(input_path)
        .output(
            output_path,
            vf=f"crop={width}:{height}:{x}:{y}"
        )
        .run(overwrite_output=True)
    )
    return output_path


def rotate_video(input_path, output_path, angle=90):
    # angle 90 = transpose=1 (90 clockwise)
    # angle 180 = transpose=1,transpose=1
    # angle 270 = transpose=2 (90 counter-clockwise)
    if angle == 180:
        vf = "transpose=1,transpose=1"
    elif angle == 270:
        vf = "transpose=2"
    else:
        vf = "transpose=1"

    (
        ffmpeg
        .input(input_path)
        .output(
            output_path,
            vf=vf
        )
        .run(overwrite_output=True)
    )
    return output_path


def change_speed(input_path, output_path, speed):
    (
        ffmpeg
        .input(input_path)
        .output(
            output_path,
            vf=f"setpts={1/speed}*PTS"
        )
        .run(overwrite_output=True)
    )
    return output_path


def merge_videos(input_paths, output_path):
    # Concat demuxer
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".txt") as f:
        for path in input_paths:
            norm_path = os.path.abspath(path).replace("\\", "/")
            f.write(f"file '{norm_path}'\n")
        temp_list_file = f.name

    try:
        (
            ffmpeg
            .input(temp_list_file, format='concat', safe=0)
            .output(output_path, c='copy')
            .run(overwrite_output=True)
        )
    finally:
        if os.path.exists(temp_list_file):
            try:
                os.remove(temp_list_file)
            except Exception:
                pass

    return output_path


def merge_video_segments(segments, output_path):
    """Render retained source ranges in order, trimming cut/deleted sections."""
    if not segments:
        raise ValueError("At least one video segment is required")

    first_probe = ffmpeg.probe(segments[0]["path"])
    first_video = next(
        (stream for stream in first_probe["streams"] if stream["codec_type"] == "video"),
        None,
    )
    if first_video is None:
        raise ValueError("The first segment has no video stream")

    width = max(2, int(first_video["width"]) // 2 * 2)
    height = max(2, int(first_video["height"]) // 2 * 2)
    normalized_streams = []

    for segment in segments:
        path = segment["path"]
        start = max(0, float(segment["start"]))
        duration = float(segment["duration"])
        if duration <= 0:
            continue

        probe = ffmpeg.probe(path)
        source = ffmpeg.input(path, ss=start, t=duration)
        video = (
            source.video
            .filter("setpts", "PTS-STARTPTS")
            .filter("scale", width, height, force_original_aspect_ratio="decrease")
            .filter("pad", width, height, "(ow-iw)/2", "(oh-ih)/2")
            .filter("setsar", 1)
            .filter("fps", fps=30)
            .filter("format", "yuv420p")
        )

        has_audio = any(stream["codec_type"] == "audio" for stream in probe["streams"])
        if has_audio:
            audio = (
                source.audio
                .filter("asetpts", "PTS-STARTPTS")
                .filter("aresample", 44100)
                .filter("aformat", sample_rates=44100, channel_layouts="stereo")
                .filter("apad", pad_dur=duration)
                .filter("atrim", duration=duration)
            )
        else:
            silence = ffmpeg.input(
                "anullsrc=channel_layout=stereo:sample_rate=44100",
                format="lavfi",
                t=duration,
            )
            audio = silence.audio.filter("asetpts", "PTS-STARTPTS")

        normalized_streams.append((video, audio))

    if not normalized_streams:
        raise ValueError("No valid video segments were supplied")

    if len(normalized_streams) == 1:
        video, audio = normalized_streams[0]
    else:
        concat_node = ffmpeg.concat(
            *(stream for pair in normalized_streams for stream in pair),
            v=1,
            a=1,
        ).node
        video, audio = concat_node[0], concat_node[1]

    (
        ffmpeg
        .output(
            video,
            audio,
            output_path,
            vcodec="libx264",
            acodec="aac",
            pix_fmt="yuv420p",
            movflags="+faststart",
        )
        .run(overwrite_output=True)
    )
    return output_path
