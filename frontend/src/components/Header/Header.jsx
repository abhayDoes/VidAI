import "./Header.css";

export default function Header({
  status,
  hasVideo,
  hasAudio,
  onImport,
  onImportAudio,
  onExport,
}) {
  return (
    <header className="editor-header">
      <div className="brand">
        <div className="brand-dot" />
        <span>VidAI Studio</span>
      </div>

      <div className="header-actions">
        {status && <span className="status-text">{status}</span>}
        <button className="nav-btn" onClick={onImport} title="Import video files">
          {hasVideo ? "+ Add Videos" : "Import Videos"}
        </button>
        <button
          className="nav-btn audio-btn"
          onClick={onImportAudio}
          title="Import background music or audio file (.mp3, .wav)"
        >
          {hasAudio ? "+ Add Audio" : "🎵 Import Audio"}
        </button>
        <button className="nav-btn primary" onClick={onExport}>
          Export to Server
        </button>
      </div>
    </header>
  );
}
