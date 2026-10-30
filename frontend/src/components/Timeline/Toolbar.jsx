import { Icons } from "../../assets/icons";

export default function Toolbar({
  isSnapping,
  hasSelectedClip,
  currentTime,
  duration,
  zoom = 20,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onSeek,
  onAddTrack,
  onToggleSnap,
  onSplitClip,
  onDeleteClip,
  onAddMarker,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}) {
  const handleMinimapClick = (e) => {
    if (!onSeek || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  return (
    <div className="timeline-toolbar">
      <div className="toolbar-left">
        <span className="timeline-label"><span aria-hidden="true">▦</span> TIMELINE</span>
        <div className="toolbar-divider" />
        <button className="toolbar-btn" onClick={onAddTrack} title="Add Track">
          <Icons.AddTrack />
          <span>+ Track</span>
        </button>
        <div className="toolbar-divider" />
        <button className="toolbar-icon-btn" title="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}>
          <Icons.Undo />
        </button>
        <button className="toolbar-icon-btn" title="Redo (Ctrl+Shift+Z or Ctrl+Y)" onClick={onRedo} disabled={!canRedo}>
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
        <div className="zoom-controls">
          <button
            className="toolbar-icon-btn zoom-btn"
            onClick={onZoomOut}
            title="Zoom Out"
          >
            -
          </button>
          <span className="zoom-label" title="Timeline zoom level">
            {Math.round((zoom / 20) * 100)}%
          </span>
          <button
            className="toolbar-icon-btn zoom-btn"
            onClick={onZoomIn}
            title="Zoom In"
          >
            +
          </button>
          <button
            className="toolbar-btn fit-btn"
            onClick={onZoomFit}
            title="Fit Entire Timeline"
          >
            Fit
          </button>
        </div>
        <div className="toolbar-divider" />
        <div
          className="minimap-bar"
          onClick={handleMinimapClick}
          title="Click to seek anywhere on the timeline"
          style={{ cursor: "pointer" }}
        >
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
