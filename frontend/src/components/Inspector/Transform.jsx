const ASPECT_PRESETS = ["16:9", "9:16", "1:1"];

export default function Transform({ transform, onRotate, onChange, disabled = false }) {
  const flip = (axis) => {
    onChange({
      ...transform,
      [axis]: !transform[axis],
    });
  };

  return (
    <div className="transform-controls">
      <div className="preset-grid">
        <button className="preset-btn" onClick={() => onRotate(90)} disabled={disabled}>
          Rotate 90&#176;
        </button>
        <button className="preset-btn" onClick={() => onRotate(180)} disabled={disabled}>
          Rotate 180&#176;
        </button>
        <button
          className={`preset-btn ${transform.flipH ? "active" : ""}`}
          onClick={() => flip("flipH")}
          disabled={disabled}
        >
          Flip H
        </button>
        <button
          className={`preset-btn ${transform.flipV ? "active" : ""}`}
          onClick={() => flip("flipV")}
          disabled={disabled}
        >
          Flip V
        </button>
      </div>

      <div className="transform-row">
        <span className="transform-label">Aspect</span>
        <div className="preset-grid">
          {ASPECT_PRESETS.map((preset) => (
            <button
              key={preset}
              className={`preset-btn ${
                transform.aspectRatio === preset ? "active" : ""
              }`}
              onClick={() => onChange({ ...transform, aspectRatio: preset })}
              disabled={disabled}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
