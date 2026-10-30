import { useEffect, useRef } from "react";
import useWebGpuPreview from "../../hooks/useWebGpuPreview";

const ASPECT_CLASS = {
  "16:9": "aspect-16-9",
  "9:16": "aspect-9-16",
  "1:1": "aspect-1-1",
};

export default function VideoPlayer({
  videoRef,
  videoUrl,
  clipId = null,
  clipStart = 0,
  sourceStart = 0,
  speed = 1,
  currentTime = 0,
  isPlaying = false,
  rotation,
  flipH,
  flipV,
  aspectRatio,
  onTimeUpdate,
  onEnded,
  onTogglePlay,
  onImportClick,
  gpuPreviewEnabled = false,
  onGpuStatus,
  muted = false,
  trackMuted = false,
  trackVolume = 1,
  hasClips = false,
}) {
  const lastClipIdRef = useRef(clipId);
  const lastSpeedRef = useRef(speed);
  const canvasRef = useRef(null);
  const gpuReady = useWebGpuPreview(videoRef, canvasRef, videoUrl, gpuPreviewEnabled, onGpuStatus);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = Math.max(0, Math.min(1, trackVolume));
  }, [videoRef, videoUrl, trackVolume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    const desiredTime = Math.max(
      0,
      sourceStart + (currentTime - clipStart) * speed
    );
    const clipChanged =
      lastClipIdRef.current !== clipId || lastSpeedRef.current !== speed;
    lastClipIdRef.current = clipId;
    lastSpeedRef.current = speed;

    if (Number.isFinite(speed) && speed > 0) {
      video.playbackRate = speed;
    }

    if (clipChanged) {
      // Switched to a different timeline clip: seek exactly, even when the
      // source file is the same (e.g. the two halves of a split clip).
      try {
        const maxTime =
          Number.isFinite(video.duration) && video.duration > 0
            ? video.duration - 0.03
            : desiredTime;
        video.currentTime = Math.max(0, Math.min(desiredTime, maxTime));
      } catch {
        // Ignore seek failures (e.g. metadata not loaded yet).
      }
    } else if (video.readyState >= 1) {
      // While paused: sync frame when scrubbing or seeking.
      // While playing: do NOT micro-seek video on every frame (it stutters video and video audio)!
      const threshold = isPlaying ? 1.2 : 0.05;
      if (Math.abs(video.currentTime - desiredTime) > threshold) {
        try {
          video.currentTime = desiredTime;
        } catch {}
      }
    }

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [videoRef, videoUrl, clipId, clipStart, sourceStart, speed, currentTime, isPlaying]);

  const transformStyle = {
    transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${
      flipV ? -1 : 1
    })`,
  };

  return (
    <main className="preview-workspace">
      {videoUrl ? (
        <div className={`player-frame ${ASPECT_CLASS[aspectRatio] || "aspect-16-9"}`}>
          <video
            key={videoUrl}
            ref={videoRef}
            src={videoUrl}
            muted={muted || trackMuted}
            className={`video-screen ${gpuReady ? "video-screen-gpu-source" : ""}`}
            style={transformStyle}
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              if (Number.isFinite(speed) && speed > 0) {
                video.playbackRate = speed;
              }
              video.currentTime = Math.max(
                0,
                sourceStart + (currentTime - clipStart) * speed
              );
              if (isPlaying) video.play().catch(() => {});
            }}
            onEnded={onEnded}
            onClick={onTogglePlay}
          />
          <canvas
            ref={canvasRef}
            className={`video-screen gpu-preview-canvas ${gpuReady ? "gpu-preview-ready" : ""}`}
            style={transformStyle}
            aria-hidden="true"
          />
        </div>
      ) : (
        <div className={`empty-preview ${hasClips ? "empty-preview-gap" : ""}`} onClick={hasClips ? undefined : onImportClick}>
          <span className="import-prompt">
            {hasClips ? "No video at the playhead" : "Click to import videos"}
          </span>
        </div>
      )}
    </main>
  );
}
