import re
from typing import List, Dict, Any, Optional

from app.captions.settings import caption_settings

STRONG_PUNCTUATION = (".", "!", "?", "。", "！", "？")
SOFT_PUNCTUATION = (",", ";", ":", "—", "-", "、", "，")


def format_timestamp_srt(seconds: float) -> str:
    """Format seconds into SRT timestamp format: HH:MM:SS,mmm (e.g. 00:00:01,500)."""
    seconds = max(0.0, float(seconds))
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    if ms >= 1000:
        s += 1
        ms -= 1000
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def format_timestamp_vtt(seconds: float) -> str:
    """Format seconds into WebVTT timestamp format: HH:MM:SS.mmm (e.g. 00:00:01.500)."""
    seconds = max(0.0, float(seconds))
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    if ms >= 1000:
        s += 1
        ms -= 1000
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def build_caption_lines(
    words: List[Dict[str, Any]],
    video_duration: Optional[float] = None
) -> List[Dict[str, Any]]:
    """Pure function grouping word timestamps into formatted caption blocks.

    Rules from specification:
    - Max 42 characters per line (caption_settings.MAX_CHARS_PER_LINE)
    - Max 2 lines per caption (caption_settings.MAX_LINES_PER_CAPTION)
    - Max 5.0 seconds per caption (caption_settings.MAX_DURATION_SECONDS)
    - Min 0.7 seconds per caption (caption_settings.MIN_DURATION_SECONDS)
    - Break at word boundaries, prefer breaking after punctuation
    - Never produce overlapping captions
    """
    if not words:
        return []

    max_chars = caption_settings.MAX_CHARS_PER_LINE
    max_duration = caption_settings.MAX_DURATION_SECONDS
    min_duration = caption_settings.MIN_DURATION_SECONDS

    # Clean words
    cleaned_words = []
    for w in words:
        raw_text = str(w.get("word", "")).strip()
        if not raw_text:
            continue
        try:
            start_t = max(0.0, float(w.get("start", 0.0)))
            end_t = max(start_t, float(w.get("end", start_t + 0.1)))
        except (ValueError, TypeError):
            continue
        cleaned_words.append({"word": raw_text, "start": start_t, "end": end_t})

    if not cleaned_words:
        return []

    captions = []
    current_words = []
    caption_start = cleaned_words[0]["start"]
    prev_caption_end = 0.0

    def finalize_caption(block_words, start_time):
        nonlocal prev_caption_end
        if not block_words:
            return None

        # Build lines respecting max 42 chars per line and max 2 lines
        lines = []
        cur_line = []
        cur_len = 0

        for w_obj in block_words:
            w_str = w_obj["word"]
            added_len = len(w_str) if not cur_line else len(w_str) + 1
            if cur_len + added_len <= max_chars:
                cur_line.append(w_str)
                cur_len += added_len
            else:
                if cur_line:
                    lines.append(" ".join(cur_line))
                cur_line = [w_str]
                cur_len = len(w_str)
                if len(lines) >= caption_settings.MAX_LINES_PER_CAPTION - 1:
                    # Collect remaining words on this final line
                    pass

        if cur_line:
            if len(lines) >= caption_settings.MAX_LINES_PER_CAPTION:
                lines[-1] = lines[-1] + " " + " ".join(cur_line)
            else:
                lines.append(" ".join(cur_line))

        # Enforce max 2 lines
        if len(lines) > caption_settings.MAX_LINES_PER_CAPTION:
            first_line = lines[0]
            second_line = " ".join(lines[1:])
            lines = [first_line, second_line]

        caption_text = "\n".join(lines).strip()
        raw_end = block_words[-1]["end"]

        # Ensure start does not overlap previous caption
        safe_start = max(start_time, prev_caption_end)
        # Ensure min duration
        safe_end = max(safe_start + min_duration, raw_end)

        # Cap by video duration if provided
        if video_duration is not None and video_duration > 0:
            safe_end = min(safe_end, video_duration)
            if safe_start >= safe_end:
                safe_start = max(0.0, safe_end - min_duration)

        safe_start = round(safe_start, 2)
        safe_end = round(max(safe_start + 0.1, safe_end), 2)
        prev_caption_end = safe_end

        return {
            "id": len(captions) + 1,
            "start": safe_start,
            "end": safe_end,
            "text": caption_text
        }

    for i, w_obj in enumerate(cleaned_words):
        if not current_words:
            caption_start = max(w_obj["start"], prev_caption_end)

        current_words.append(w_obj)
        current_dur = w_obj["end"] - caption_start

        # Check total character length across 2 lines
        total_chars = sum(len(cw["word"]) for cw in current_words) + (len(current_words) - 1)
        is_max_chars = total_chars >= (max_chars * 2 - 4)

        # Check if duration limit reached
        is_max_time = current_dur >= max_duration

        # Check silence gap to next word
        is_silence_gap = False
        if i + 1 < len(cleaned_words):
            gap = cleaned_words[i + 1]["start"] - w_obj["end"]
            if gap >= 1.0:
                is_silence_gap = True

        # Check strong punctuation break
        ends_with_strong_punc = w_obj["word"].endswith(STRONG_PUNCTUATION)
        is_good_punc_break = (
            ends_with_strong_punc and current_dur >= min_duration
        )

        should_split = (
            is_max_time
            or is_max_chars
            or is_silence_gap
            or is_good_punc_break
            or i == len(cleaned_words) - 1
        )

        if should_split and current_words:
            cap = finalize_caption(current_words, caption_start)
            if cap:
                captions.append(cap)
            current_words = []
            if i + 1 < len(cleaned_words):
                caption_start = max(cleaned_words[i + 1]["start"], prev_caption_end)

    return captions


def generate_srt(captions: List[Dict[str, Any]]) -> str:
    """Generate SRT subtitle text with standard 00:00:01,500 format."""
    blocks = []
    for i, c in enumerate(captions, 1):
        start_str = format_timestamp_srt(c["start"])
        end_str = format_timestamp_srt(c["end"])
        text = str(c.get("text", "")).strip()
        blocks.append(f"{i}\n{start_str} --> {end_str}\n{text}\n")
    return "\n".join(blocks).strip() + "\n" if blocks else ""


def generate_vtt(captions: List[Dict[str, Any]]) -> str:
    """Generate WebVTT subtitle text with WEBVTT header and 00:00:01.500 format."""
    blocks = ["WEBVTT\n"]
    for i, c in enumerate(captions, 1):
        start_str = format_timestamp_vtt(c["start"])
        end_str = format_timestamp_vtt(c["end"])
        text = str(c.get("text", "")).strip()
        blocks.append(f"{i}\n{start_str} --> {end_str}\n{text}\n")
    return "\n".join(blocks).strip() + "\n"


def validate_captions_input(
    captions: List[Dict[str, Any]],
    video_duration: Optional[float] = None
) -> None:
    """Validate user-edited captions for PUT /videos/{id}/captions.

    Ensures:
    - Must be a list of caption dicts
    - Each caption must have valid start, end, and text
    - start >= 0, end > start
    - Captions are strictly ordered by start time
    - No overlapping caption intervals
    - Timing is within video_duration
    """
    if not isinstance(captions, list):
        raise ValueError("Captions must be a list of objects")

    prev_end = 0.0

    for i, c in enumerate(captions, 1):
        if not isinstance(c, dict):
            raise ValueError(f"Caption #{i} must be a dictionary object")

        if "start" not in c or "end" not in c or "text" not in c:
            raise ValueError(f"Caption #{i} missing required keys ('start', 'end', 'text')")

        try:
            start = float(c["start"])
            end = float(c["end"])
        except (ValueError, TypeError):
            raise ValueError(f"Caption #{i} has non-numeric start or end timestamps")

        if start < 0.0:
            raise ValueError(f"Caption #{i} start time cannot be negative ({start})")

        if end <= start:
            raise ValueError(f"Caption #{i} end time ({end}) must be greater than start time ({start})")

        if start < prev_end - 0.001:
            raise ValueError(
                f"Caption #{i} (start {start}s) overlaps with previous caption (end {prev_end}s)"
            )

        if video_duration is not None and video_duration > 0:
            if end > video_duration + 1.0:
                raise ValueError(
                    f"Caption #{i} end time ({end}s) exceeds video duration ({video_duration}s)"
                )

        prev_end = end
