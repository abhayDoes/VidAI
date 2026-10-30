import "./Header.css";

export default function Header({
  status,
  hasVideo,
  hasAudio,
  onImport,
  onImportAudio,
  onExport,
  gpuPreviewEnabled,
  onToggleGpuPreview,
}) {
  return (
    <header className="editor-header">
      <div className="brand">
        <div className="brand-dot" />
        <span>VidAI Studio</span>
      </div>

      <div className="header-actions">
        {status && <span className="status-text">{status}</span>}
        <button className="nav-btn" onClick={onImport} title="Import media to the selected track">
          {hasVideo ? "+ Add Videos" : "Import Videos"}
        </button>
        <button
          className="nav-btn audio-btn"
          onClick={onImportAudio}
          title="Import audio to the selected track"
        >
          {hasAudio ? "+ Add Audio" : "🎵 Import Audio"}
        </button>
        <button
          className={`nav-btn ${gpuPreviewEnabled ? "gpu-btn-active" : ""}`}
          onClick={onToggleGpuPreview}
          title="Use WebGPU to render the video preview when supported"
        >
          WebGPU {gpuPreviewEnabled ? "On" : "Off"}
        </button>
        <button className="nav-btn primary" onClick={onExport}>
          Export Video
        </button>
      </div>
    </header>
  );
}
