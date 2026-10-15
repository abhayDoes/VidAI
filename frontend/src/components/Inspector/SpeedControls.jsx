const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2];

export default function SpeedControls({ selectedClip, onUpdateClip, onSeek }) {
  if (!selectedClip) {
    return <p className="muted-note">Select a clip to change its speed.</p>;
  }

  const speed = selectedClip.speed || 1;

  const applySpeed = (newSpeed) => {
    if (!Number.isFinite(newSpeed) || newSpeed <= 0 || newSpeed === speed) {
      return;
    }
    // Keep the consumed source range fixed; the timeline length stretches or
    // shrinks instead (faster => shorter on the timeline).
    const sourceLen = selectedClip.duration * speed;
    onUpdateClip(selectedClip.id, {
      speed: newSpeed,
      duration: sourceLen / newSpeed,
    });
    // Speeding up shrinks the clip, which can leave the playhead stranded
    // past its end. Park the playhead at the clip start so the sped-up part
    // plays immediately.
    if (onSeek) {
      onSeek(
        selectedClip.start,
        selectedClip.start,
        selectedClip.sourceStart || 0,
        newSpeed
      );
    }
  };

  return (
    <div className="transform-controls">
      <div className="preset-grid">
        {SPEED_PRESETS.map((preset) => (
          <button
            key={preset}
            className={`preset-btn ${speed === preset ? "active" : ""}`}
            onClick={() => applySpeed(preset)}
          >
            {preset}x
          </button>
        ))}
      </div>

      <label className="slider-label">
        <span>Speed: {speed}x</span>
        <input
          type="range"
          min="0.25"
          max="2"
          step="0.25"
          value={Math.min(2, Math.max(0.25, speed))}
          onChange={(event) => applySpeed(parseFloat(event.target.value))}
        />
      </label>

      <div className="trim-meta">
        Timeline length: {selectedClip.duration.toFixed(2)}s
      </div>
    </div>
  );
}
