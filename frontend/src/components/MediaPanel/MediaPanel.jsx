import { useState } from "react";
import "./MediaPanel.css";

export default function MediaPanel({ clips, selectedClipId, onImport, onSelectClip }) {
  const [search, setSearch] = useState("");
  const filtered = clips.filter((clip) => clip.title.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <aside className="media-panel" aria-label="Media on timeline">
      <div className="media-panel-heading"><div><span className="media-eyebrow">YOUR WORKSPACE</span><h2>Media</h2></div><span className="media-count">{clips.length}</span></div>
      <div className="media-panel-actions">
        <button type="button" className="media-import" onClick={onImport}><span aria-hidden="true">＋</span> Import media</button>
        <p>Added to the selected track</p>
      </div>
      <label className="media-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search media" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search media" /></label>
      <div className="media-list-heading"><span>ON TIMELINE</span><span>{filtered.length} {filtered.length === 1 ? "CLIP" : "CLIPS"}</span></div>
      <div className="media-list">
        {clips.length === 0 ? (
          <div className="media-empty">
            <div className="media-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 16V4m0 0L8 8m4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg></div>
            <strong>Your story starts here</strong><p>Import a video or audio file to begin editing.</p>
            <button type="button" onClick={onImport}>Import media</button>
          </div>
        ) : filtered.length === 0 ? <p className="media-no-results">No clips match your search.</p> : filtered.map((clip) => (
          <button type="button" key={clip.id} className={`media-item ${clip.id === selectedClipId ? "selected" : ""}`} onClick={() => onSelectClip(clip.id)} title={`Select ${clip.title}`}>
            <span className={`media-item-icon ${clip.type === "audio" ? "audio" : "video"}`} aria-hidden="true">{clip.type === "audio" ? "♫" : "▶"}</span>
            <span className="media-item-text"><strong>{clip.title}</strong><small>{clip.type === "audio" ? "Audio" : "Video"} · {clip.duration.toFixed(1)}s</small></span>
          </button>
        ))}
      </div>
      <div className="media-panel-footer"><span className="media-local-dot"/> Media stays on your device</div>
    </aside>
  );
}
