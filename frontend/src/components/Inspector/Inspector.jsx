import TrimControls from "./TrimControls";
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
  clips,
  transform,
  onTransformChange,
  onUpdateClip,
  onStatus,
  onVideoProcessed,
  renderedVideoUrl,
  onRenderedVideoUrl,
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
        duration: selectedClip.duration,
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
    if (!filename) return;
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

  const handleMerge = async () => {
    const segments = clips
      .filter((clip) => clip.filename && clip.duration > 0)
      .sort((a, b) => a.start - b.start)
      .map((clip) => ({
        filename: clip.filename,
        start: clip.sourceStart || 0,
        duration: clip.duration,
      }));

    if (!segments.length) {
      onStatus("No video segments to render");
      return;
    }

    onStatus("Rendering timeline (removed sections are excluded)...");
    try {
      const data = await videoApi.merge(segments);
      onStatus(`Merged: ${data.filename}`);
      if (data.url) onRenderedVideoUrl(`${backendBase}${data.url}`);
    } catch (err) {
      console.error(err);
      onStatus("Merge failed");
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
        <div className="section-title">Rotate &amp; Flip</div>
        <Transform
          transform={transform}
          onRotate={handleRotate}
          onChange={onTransformChange}
        />
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

      <div className="inspector-section">
        <div className="section-title">Render Timeline</div>
        <button
          className="preset-btn wide"
          onClick={handleMerge}
          disabled={!clips.length || clips.some((clip) => !clip.filename)}
        >
          Render {clips.length} kept segment{clips.length === 1 ? "" : "s"}
        </button>
        {!clips.length && (
          <p className="muted-note">Add a video clip to render the timeline.</p>
        )}
        {renderedVideoUrl && (
          <a
            className="rendered-video-link"
            href={renderedVideoUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open rendered video
          </a>
        )}
      </div>
    </aside>
  );
}
