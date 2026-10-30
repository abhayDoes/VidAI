import { Icons } from "../../assets/icons";

export default function TrackHeader({
  track,
  onToggleLock,
  onToggleVisible,
  onSetVolume,
  onBeginEdit,
}) {
  const isAudio = track.type === "audio";

  return (
    <div className={`track-header-item ${isAudio ? "audio-track-header" : ""}`}>
      <div className="track-header-top">
        <div className="track-title-wrap">
          <span className="track-type-badge">
            {isAudio ? <Icons.Music /> : "🎬"}
          </span>
          <span className="track-name" title={track.name}>
            {track.name}
          </span>
        </div>
      </div>

      <div className="track-header-actions">
        {isAudio && onSetVolume && (
          <div className="track-volume-wrap" title={`Volume: ${Math.round((track.volume ?? 1) * 100)}%`}>
            <input
              type="range"
              onMouseDown={onBeginEdit}
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
          onClick={() => onToggleLock(track.id)}
          title={track.locked ? "Unlock Track" : "Lock Track"}
        >
          {track.locked ? <Icons.Lock /> : <Icons.Unlock />}
        </span>

        <span
          className={`track-action-icon ${!track.visible ? "active-alert" : ""}`}
          onClick={() => onToggleVisible(track.id)}
          title={
            isAudio
              ? track.visible
                ? "Mute Audio Track"
                : "Unmute Audio Track"
              : track.visible
              ? "Hide Video Track"
              : "Show Video Track"
          }
        >
          {isAudio ? (
            track.visible ? <Icons.Volume /> : <Icons.Mute />
          ) : track.visible ? (
            <Icons.Eye />
          ) : (
            <Icons.EyeOff />
          )}
        </span>
      </div>
    </div>
  );
}
