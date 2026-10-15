import TrimControls from "./TrimControls";
import SpeedControls from "./SpeedControls";
import Transform from "./Transform";
import { videoApi } from "../../services/api";
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
  onStatus,
  onVideoProcessed,
}) {
  const filename = selectedClip?.filename || videoFile?.name;
  const backendBase = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const handleTrim = async () => {
    if (!selectedClip || !filename) return;
    onStatus("Trimming on server...");
    try {
      const data = await videoApi.trim({
        filename,
        start: selectedClip.sourceStart || 0,
        duration: selectedClip.duration * (selectedClip.speed || 1),
      });
      onStatus(`Trimmed: ${data.filename || filename}`);
      if (data.url && onVideoProcessed) {
        onVideoProcessed(`${backendBase}${data.url}`, data.filename);
      }
    } catch (err) {
      console.error(err);
      onStatus("Trim failed");
    }
  };

  const handleRotate = async (angle) => {
    if (!selectedClip || !filename) return;
    onTransformChange({
      ...transform,
      rotation: (transform.rotation + angle) % 360,
    });
    onStatus("Rotating on server...");
    try {
      const data = await videoApi.rotate({ filename, angle });
      onStatus(`Rotated: ${data.filename || filename}`);
      if (data.url && onVideoProcessed) {
        onVideoProcessed(`${backendBase}${data.url}`, data.filename);
      }
    } catch (err) {
      console.error(err);
      onStatus("Rotate failed");
    }
  };

  const handleResize = async (width, height) => {
    if (!filename) return;
    onStatus("Resizing on server...");
    try {
      const data = await videoApi.resize({ filename, width, height });
      onStatus(`Resized: ${data.filename || filename}`);
      if (data.url && onVideoProcessed) {
        onVideoProcessed(`${backendBase}${data.url}`, data.filename);
      }
    } catch (err) {
      console.error(err);
      onStatus("Resize failed");
    }
  };

  return (
    <aside className="inspector-panel">
      <div className="inspector-heading">Inspector &amp; Edit Tools</div>

      <TrimControls
        key={selectedClip ? selectedClip.id : "none"}
        selectedClip={selectedClip}
        onUpdateClip={onUpdateClip}
        onApply={handleTrim}
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
        <Transform
          transform={transform}
          onRotate={handleRotate}
          onChange={onTransformChange}
          disabled={!selectedClip}
        />
        {!selectedClip && (
          <p className="muted-note">Select a clip to rotate or flip just that part.</p>
        )}
      </div>

      <div className="inspector-section">
        <div className="section-title">Resolution Presets</div>
        <div className="preset-grid">
          {RESOLUTIONS.map((r) => (
            <button
              key={r.label}
              className="preset-btn"
              onClick={() => handleResize(r.width, r.height)}
              disabled={!filename}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

    </aside>
  );
}
