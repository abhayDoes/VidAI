from scenedetect import detect, ContentDetector, SceneManager, open_video
from typing import List, Dict, Any


def detect_scenes(file_path: str, threshold: float = 27.0) -> List[Dict[str, Any]]:
    """Detect scene boundaries in video using PySceneDetect."""
    try:
        scene_list = detect(file_path, ContentDetector(threshold=threshold))
        scenes = []
        for i, scene in enumerate(scene_list):
            start_sec = round(scene[0].get_seconds(), 2)
            end_sec = round(scene[1].get_seconds(), 2)
            scenes.append({
                "scene_index": i + 1,
                "start_sec": start_sec,
                "end_sec": end_sec,
                "duration_sec": round(end_sec - start_sec, 2),
                "midpoint_sec": round((start_sec + end_sec) / 2, 2)
            })
        return scenes
    except Exception as e:
        # Fallback if scenedetect encounters an issue or for single-scene videos
        return [{
            "scene_index": 1,
            "start_sec": 0.0,
            "end_sec": 0.0,
            "duration_sec": 0.0,
            "midpoint_sec": 0.0,
            "note": f"Scene detection fallback: {str(e)}"
        }]

