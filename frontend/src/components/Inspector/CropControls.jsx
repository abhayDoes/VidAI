import { useMemo, useState } from "react";

function even(value, fallback) {
  const number = Math.floor(Number(value) || fallback);
  return Math.max(2, number - (number % 2));
}

export default function CropControls({ selectedClip, onApply }) {
  const dimensions = useMemo(() => ({
    width: Math.max(2, Number(selectedClip?.width) || 1280),
    height: Math.max(2, Number(selectedClip?.height) || 720),
  }), [selectedClip?.width, selectedClip?.height]);
  const initial = useMemo(() => {
    const width = even(dimensions.width * 0.8, dimensions.width);
    const height = even(dimensions.height * 0.8, dimensions.height);
    return {
      width,
      height,
      x: even((dimensions.width - width) / 2, 0),
      y: even((dimensions.height - height) / 2, 0),
    };
  }, [dimensions]);
  const [crop, setCrop] = useState(initial);

  const setValue = (key, value) => setCrop((current) => ({ ...current, [key]: value }));

  return (
    <div className="crop-controls">
      <div className="crop-input-grid">
        {[
          ["width", "Width"],
          ["height", "Height"],
          ["x", "X offset"],
          ["y", "Y offset"],
        ].map(([key, label]) => (
          <label key={key}>
            <span>{label}</span>
            <input
              type="number"
              min={key === "x" || key === "y" ? 0 : 2}
              step="2"
              value={crop[key]}
              onChange={(event) => setValue(key, event.target.value)}
              disabled={!selectedClip}
            />
          </label>
        ))}
      </div>
      <p className="muted-note">Source: {dimensions.width} × {dimensions.height}px. Crop bounds must fit inside the source.</p>
      <button
        className="preset-btn wide"
        onClick={() => onApply({
          width: Number(crop.width),
          height: Number(crop.height),
          x: Number(crop.x),
          y: Number(crop.y),
        })}
        disabled={!selectedClip}
      >
        Apply Crop Locally
      </button>
    </div>
  );
}
