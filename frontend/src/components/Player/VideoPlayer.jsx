import { useEffect } from "react";

const ASPECT_CLASS = {
  "16:9": "aspect-16-9",
  "9:16": "aspect-9-16",
  "1:1": "aspect-1-1",
};

export default function VideoPlayer({
  videoRef,
  videoUrl,
  clipStart = 0,
  sourceStart = 0,
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
}) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    if (video.readyState >= 1) {
      const desiredTime = Math.max(
        0,
        sourceStart + currentTime - clipStart
      );
      if (Math.abs(video.currentTime - desiredTime) > 0.2) {
        video.currentTime = desiredTime;
      }
    }

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [videoRef, videoUrl, clipStart, sourceStart, currentTime, isPlaying]);

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
            className="video-screen"
            style={transformStyle}
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              video.currentTime = Math.max(
                0,
                sourceStart + currentTime - clipStart
              );
              if (isPlaying) video.play().catch(() => {});
            }}
            onEnded={onEnded}
            onClick={onTogglePlay}
          />
        </div>
      ) : (
        <div className="empty-preview" onClick={onImportClick}>
          <span className="import-prompt">
            Click to import videos or move the playhead over a clip
          </span>
        </div>
      )}
    </main>
  );
}
