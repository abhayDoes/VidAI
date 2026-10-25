import TrimControls from "./TrimControls";
import SpeedControls from "./SpeedControls";
import Transform from "./Transform";
import "./Inspector.css";

const RESOLUTIONS = [
  { label: "1920 x 1080 (1080p)", width: 1920, height: 1080 },
  { label: "1280 x 720 (720p)", width: 1280, height: 720 },
  { label: "1080 x 1920 (Vertical)", width: 1080, height: 1920 },
  { label: "1080 x 1080 (Square)", width: 1080, height: 1080 },
];

export default function Inspector({
  videoFile,
  selectedClip,
  transform,
  onTransformChange,
  onUpdateClip,
  onSeekClip,
  onProcessClip,
}) {
  const hasVideoFile = Boolean(selectedClip?.file || videoFile);

  return (
    <aside className="inspector-panel">
      <div className="inspector-heading">Inspector &amp; Edit Tools</div>

      {selectedClip?.type === "audio" && (
        <div className="inspector-section audio-inspector-section">
          <div className="section-title">🎵 Audio Clip Volume</div>
          <div className="slider-label">
            <span>Volume: {Math.round((selectedClip.volume ?? 1) * 100)}%</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={selectedClip.volume ?? 1}
              onChange={(e) =>
                onUpdateClip(selectedClip.id, {
                  volume: parseFloat(e.target.value),
                })
              }
            />
          </div>
        </div>
      )}

      <TrimControls
        key={selectedClip ? selectedClip.id : "none"}
        selectedClip={selectedClip}
        onUpdateClip={onUpdateClip}
        onApply={() => onProcessClip("trim", {
          start: selectedClip?.sourceStart || 0,
          duration: (selectedClip?.duration || 0) * (selectedClip?.speed || 1),
        })}
      />

      <div className="inspector-section">
        <div className="section-title">Speed</div>
        <SpeedControls
          selectedClip={selectedClip}
          onUpdateClip={onUpdateClip}
          onSeek={onSeekClip}
        />
      </div>

      <div className="inspector-section">
        <div className="section-title">Rotate &amp; Flip</div>
        {selectedClip?.type === "audio" ? (
          <p className="muted-note">Visual rotation is disabled for audio clips.</p>
        ) : (
          <>
            <Transform
              transform={transform}
              onRotate={(angle) => onProcessClip("rotate", {
                angle: ((transform.rotation + angle) % 360) || 360,
              })}
              onChange={onTransformChange}
              disabled={!selectedClip}
            />
            {!selectedClip && (
              <p className="muted-note">Select a clip to rotate or flip just that part.</p>
            )}
          </>
        )}
      </div>

      <div className="inspector-section">
        <div className="section-title">Resolution Presets</div>
        {selectedClip?.type === "audio" ? (
          <p className="muted-note">Resolution presets apply to video tracks only.</p>
        ) : (
          <div className="preset-grid">
            {RESOLUTIONS.map((r) => (
              <button
                key={r.label}
                className="preset-btn"
                onClick={() => onProcessClip("resize", { width: r.width, height: r.height })}
                disabled={!hasVideoFile || selectedClip?.type === "audio"}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

    </aside>
  );
}
