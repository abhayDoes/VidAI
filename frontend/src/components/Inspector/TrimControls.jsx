export default function TrimControls({ selectedClip, onUpdateClip, onApply }) {
  if (!selectedClip) {
    return (
      <div className="inspector-section">
        <div className="section-title">Trim</div>
        <p className="muted-note">Select a clip on the timeline to trim it.</p>
      </div>
    );
  }

  const sourceStart = selectedClip.sourceStart || 0;
  const sourceEnd = sourceStart + selectedClip.duration;
  const sourceMin = selectedClip.sourceMin ?? 0;
  const sourceMax = Math.max(
    sourceEnd,
    selectedClip.sourceMax ?? sourceEnd
  );
  const maxSourceStart = Math.max(
    sourceMin,
    sourceMax - selectedClip.duration
  );

  const handleStartChange = (event) => {
    const nextStart = Number(event.target.value);
    if (!Number.isFinite(nextStart)) return;
    const start = Math.max(sourceMin, Math.min(nextStart, sourceEnd - 0.1));
    onUpdateClip(selectedClip.id, {
      sourceStart: start,
      duration: sourceEnd - start,
    });
  };

  const handleEndChange = (event) => {
    const nextEnd = Number(event.target.value);
    if (!Number.isFinite(nextEnd)) return;
    const end = Math.max(
      sourceStart + 0.1,
      Math.min(nextEnd, sourceMax)
    );
    onUpdateClip(selectedClip.id, { duration: end - sourceStart });
  };

  const handleSliderChange = (event) => {
    const start = Math.max(
      sourceMin,
      Math.min(Number(event.target.value), maxSourceStart)
    );
    onUpdateClip(selectedClip.id, { sourceStart: start });
  };

  return (
    <div className="inspector-section">
      <div className="section-title">Trim</div>

      <div className="trim-inputs">
        <label>
          <span>Start (s)</span>
          <input
            type="number"
            min={sourceMin}
            max={sourceEnd - 0.1}
            step="0.1"
            value={sourceStart.toFixed(2)}
            onChange={handleStartChange}
          />
        </label>
        <label>
          <span>End (s)</span>
          <input
            type="number"
            min={sourceStart + 0.1}
            max={sourceMax}
            step="0.1"
            value={sourceEnd.toFixed(2)}
            onChange={handleEndChange}
          />
        </label>
      </div>

      <label className="slider-label">
        <span>Source in-point: {sourceStart.toFixed(1)}s</span>
        <input
          type="range"
          min={sourceMin}
          max={maxSourceStart}
          step="0.1"
          value={Math.max(sourceMin, Math.min(sourceStart, maxSourceStart))}
          onChange={handleSliderChange}
        />
      </label>

      <div className="trim-meta">
        Duration: {selectedClip.duration.toFixed(2)}s
      </div>

      <button className="preset-btn wide" onClick={onApply}>
        Apply Trim on Server
      </button>
    </div>
  );
}
