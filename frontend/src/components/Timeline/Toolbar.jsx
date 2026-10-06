import { Icons } from "../../assets/icons";

export default function Toolbar({
  isSnapping,
  hasSelectedClip,
  currentTime,
  duration,
  onAddTrack,
  onToggleSnap,
  onSplitClip,
  onDeleteClip,
  onAddMarker,
}) {
  return (
    <div className="timeline-toolbar">
      <div className="toolbar-left">
        <button className="toolbar-btn" onClick={onAddTrack}>
          <Icons.AddTrack />
          <span>Add Track</span>
        </button>
        <div className="toolbar-divider" />
        <button className="toolbar-icon-btn" title="Undo">
          <Icons.Undo />
        </button>
        <button className="toolbar-icon-btn" title="Redo">
          <Icons.Redo />
        </button>
        <div className="toolbar-divider" />
        <button
          className={`toolbar-icon-btn ${isSnapping ? "active" : ""}`}
          title="Toggle Snapping"
          onClick={onToggleSnap}
        >
          <Icons.Magnet />
        </button>
        <button
          className="toolbar-icon-btn"
          title="Razor Split Clip"
          onClick={onSplitClip}
          disabled={!hasSelectedClip}
        >
          <Icons.Razor />
        </button>
        <button
          className="toolbar-icon-btn"
          title="Delete Clip"
          onClick={onDeleteClip}
          disabled={!hasSelectedClip}
        >
          <Icons.Trash />
        </button>
        <div className="toolbar-divider" />
        <button className="toolbar-btn" onClick={onAddMarker}>
          <Icons.Marker />
          <span>Add Marker</span>
        </button>
      </div>

      <div className="toolbar-right">
        <div className="minimap-bar">
          <div
            className="minimap-window"
            style={{
              left: `${(currentTime / Math.max(duration, 1)) * 100}%`,
              width: "14px",
            }}
          />
        </div>
      </div>
    </div>
  );
}
