import "./Header.css";

export default function Header({ status, hasVideo, onImport, onExport }) {
  return (
    <header className="editor-header">
      <div className="brand">
        <div className="brand-dot" />
        <span>VidAI Studio</span>
      </div>

      <div className="header-actions">
        {status && <span className="status-text">{status}</span>}
        <button className="nav-btn" onClick={onImport}>
          {hasVideo ? "Add Videos" : "Import Videos"}
        </button>
        <button className="nav-btn primary" onClick={onExport}>
          Export to Server
        </button>
      </div>
    </header>
  );
}
