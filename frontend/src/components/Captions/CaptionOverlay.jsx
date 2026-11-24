import React from "react";
import "./Captions.css";

export default function CaptionOverlay({ currentTime = 0, captions = [] }) {
  if (!captions || captions.length === 0) return null;

  // Find caption currently active at playhead time
  const activeCaption = captions.find(
    (c) => currentTime >= c.start && currentTime <= c.end
  );

  if (!activeCaption || !activeCaption.text) return null;

  return (
    <div className="caption-overlay" aria-live="polite">
      <div className="caption-bubble">{activeCaption.text}</div>
    </div>
  );
}
