import { Icons } from "../../assets/icons";

export default function TrackHeader({
  track,
  onToggleLock,
  onToggleVisible,
  onSetVolume,
  onBeginEdit,
  onToggleMute,
  onSelectTrack,
  isSelected,
}) {
  return (
    <div className={`track-header-item ${isSelected ? "track-header-selected" : ""}`} onClick={() => onSelectTrack(track.id)}>
      <div className="track-header-top">
        <div className="track-title-wrap">
          <span className="track-type-badge">
            🎬
          </span>
          <span className="track-name" title={track.name}>
            {track.name}
          </span>
        </div>
      </div>

      <div className="track-header-actions">
        {onSetVolume && (
          <div className="track-volume-wrap" title={`Volume: ${Math.round((track.volume ?? 1) * 100)}%`}>
            <input
              type="range"
              onMouseDown={onBeginEdit}
              onClick={(event) => event.stopPropagation()}
              min="0"
              max="1"
              step="0.05"
              value={track.volume ?? 0.8}
              onChange={(e) => onSetVolume(track.id, parseFloat(e.target.value))}
              className="track-volume-slider"
            />
          </div>
        )}

        <span
          className={`track-action-icon ${track.locked ? "active-alert" : ""}`}
          onClick={(event) => { event.stopPropagation(); onToggleLock(track.id); }}
          title={track.locked ? "Unlock Track" : "Lock Track"}
        >
          {track.locked ? <Icons.Lock /> : <Icons.Unlock />}
        </span>

        <span
          className={`track-action-icon ${!track.visible ? "active-alert" : ""}`}
          onClick={(event) => { event.stopPropagation(); onToggleVisible(track.id); }}
          title={track.visible ? "Hide Track" : "Show Track"}
        >
          {track.visible ? (
            <Icons.Eye />
          ) : (
            <Icons.EyeOff />
          )}
        </span>
        <span className={`track-action-icon ${track.muted ? "active-alert" : ""}`}
          onClick={(event) => { event.stopPropagation(); onToggleMute(track.id); }}
          title={track.muted ? "Unmute Track" : "Mute Track"}>
          {track.muted ? <Icons.Mute /> : <Icons.Volume />}
        </span>
      </div>
    </div>
  );
}
