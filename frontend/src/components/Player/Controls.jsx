import { Icons } from "../../assets/icons";
import "./Player.css";

const formatTimecode = (secs) => {
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
  onSeek,
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
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <Icons.Pause /> : <Icons.Play />}
      </button>
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
    </div>
  );
}
