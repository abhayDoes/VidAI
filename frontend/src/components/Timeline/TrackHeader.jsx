import { Icons } from "../../assets/icons";

export default function TrackHeader({ track, onToggleLock, onToggleVisible }) {
  return (
    <div className="track-header-item">
      <div className="track-header-top">
        <span>{track.name}</span>
        <span className="caret-icon">&#9662;</span>
      </div>
      <div className="track-header-actions">
        <span
          className={`track-action-icon ${track.locked ? "active-alert" : ""}`}
          onClick={() => onToggleLock(track.id)}
          title={track.locked ? "Unlock Track" : "Lock Track"}
        >
          {track.locked ? <Icons.Lock /> : <Icons.Unlock />}
        </span>
        <span
          className="track-action-icon"
          onClick={() => onToggleVisible(track.id)}
          title={track.visible ? "Hide Track" : "Show Track"}
        >
          {track.visible ? <Icons.Eye /> : <Icons.EyeOff />}
        </span>
      </div>
    </div>
  );
}
