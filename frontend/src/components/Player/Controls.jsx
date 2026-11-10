import { Icons } from "../../assets/icons";
import "./Player.css";

const formatTimecode = (secs) => {
  if (!Number.isFinite(secs) || secs < 0) secs = 0;
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = Math.floor(secs % 60);
  const frames = Math.floor((secs % 1) * 30);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(frames)}`;
};

export default function Controls({
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  onStop,
  onSeek,
  zoom = 1,
  canZoom = false,
  onZoomChange,
  onBeginZoomEdit,
  onEndZoomEdit,
}) {
  return (
    <div className="playback-bar">
      <button className="control-btn" onClick={() => onSeek(0)} title="Jump to start">
        <Icons.PrevClip />
      </button>
      <button
        className="control-btn"
        onClick={() => onSeek(currentTime - 5)}
        title="Back 5s"
      >
        -5s
      </button>
      <button
        className="play-btn"
        onClick={onTogglePlay}
        title={isPlaying ? "Pause (Space)" : "Play (Space)"}
      >
        {isPlaying ? <Icons.Pause /> : <Icons.Play />}
      </button>
      {onStop && (
        <button
          className="control-btn"
          onClick={onStop}
          title="Stop & Reset to Start"
        >
          <Icons.Stop />
        </button>
      )}
      <button
        className="control-btn"
        onClick={() => onSeek(currentTime + 5)}
        title="Forward 5s"
      >
        +5s
      </button>
      <button
        className="control-btn"
        onClick={() => onSeek(duration)}
        title="Jump to end"
      >
        <Icons.NextClip />
      </button>

      <span className="timecode-display">
        {formatTimecode(currentTime)} / {formatTimecode(duration)}
      </span>
      <div className="preview-zoom-controls" aria-label="Video preview zoom">
        <button
          className="control-btn zoom-step-btn"
          onClick={() => onZoomChange?.(Math.max(0.5, Math.round((zoom - 0.1) * 100) / 100))}
          disabled={!canZoom || zoom <= 0.5}
          title="Zoom out"
          aria-label="Zoom out"
        >−</button>
        <input
          aria-label="Video zoom"
          type="range"
          min="0.5"
          max="2"
          step="0.05"
          value={zoom}
          disabled={!canZoom}
          onPointerDown={onBeginZoomEdit}
          onPointerUp={onEndZoomEdit}
          onChange={(event) => onZoomChange?.(Number(event.target.value))}
        />
        <button
          className="control-btn zoom-step-btn"
          onClick={() => onZoomChange?.(Math.min(2, Math.round((zoom + 0.1) * 100) / 100))}
          disabled={!canZoom || zoom >= 2}
          title="Zoom in"
          aria-label="Zoom in"
        >+</button>
        <button
          className="control-btn zoom-fit-btn"
          onClick={() => onZoomChange?.(1)}
          disabled={!canZoom || zoom === 1}
          title="Fit video to player"
        >Fit</button>
        <span className="zoom-value">{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  );
}
