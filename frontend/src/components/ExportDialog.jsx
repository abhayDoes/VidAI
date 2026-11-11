import { useEffect, useState } from "react";
import "./ExportDialog.css";

export default function ExportDialog({ open, canExport, exporting, progress, onClose, onExport }) {
  const [filename, setFilename] = useState("vidai-export");
  const [resolution, setResolution] = useState("source");

  useEffect(() => {
    if (open) {
      setFilename("vidai-export");
      setResolution("source");
    }
  }, [open]);

  if (!open) return null;

  const supportsSavePicker = typeof window.showSaveFilePicker === "function";
  return (
    <div className="export-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !exporting) onClose();
    }}>
      <section className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title">
        <header className="export-dialog-header">
          <div>
            <span className="export-dialog-eyebrow">FINAL VIDEO</span>
            <h2 id="export-dialog-title">Export video</h2>
          </div>
          <button className="export-dialog-close" type="button" onClick={onClose} disabled={exporting} aria-label="Close export settings">×</button>
        </header>

        <label className="export-field">
          <span>File name</span>
          <div className="export-filename-row">
            <input autoFocus value={filename} onChange={(event) => setFilename(event.target.value)} disabled={exporting} placeholder="vidai-export" />
            <span>.mp4</span>
          </div>
        </label>

        <label className="export-field">
          <span>Resolution</span>
          <select value={resolution} onChange={(event) => setResolution(event.target.value)} disabled={exporting}>
            <option value="source">Match source</option>
            <option value="720">720p</option>
            <option value="1080">1080p</option>
            <option value="1440">1440p</option>
            <option value="2160">4K (2160p)</option>
          </select>
        </label>
        <p className="export-resolution-note">The output keeps your canvas aspect ratio. Lower resolutions usually render faster.</p>

        <div className="export-destination">
          <strong>Save location</strong>
          <span>{supportsSavePicker ? "Choose a folder in the Save As window after you start export." : "Your browser will save the file to its Downloads location."}</span>
        </div>

        {!canExport && <p className="export-validation">Add a video clip to the timeline before exporting.</p>}
        {exporting && <div className="export-progress" aria-live="polite">
          <div className="export-progress-track"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <span>Rendering locally: {Math.round(progress * 100)}%</span>
        </div>}

        <footer className="export-dialog-actions">
          <button type="button" className="nav-btn" onClick={onClose} disabled={exporting}>Cancel</button>
          <button
            type="button"
            className="nav-btn primary"
            disabled={!canExport || exporting || !filename.trim()}
            onClick={() => onExport({ filename, resolution })}
          >{exporting ? "Rendering…" : "Choose location & Export"}</button>
        </footer>
      </section>
    </div>
  );
}
