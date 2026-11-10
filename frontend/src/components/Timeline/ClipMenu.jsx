import { useEffect, useRef } from "react";
import "./ClipMenu.css";

export default function ClipMenu({ clip, position, locked, onClose, onSpeed, onMute, onExtract, onMore }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector("button:not(:disabled)")?.focus();
    const dismiss = (event) => { if (!ref.current?.contains(event.target)) onClose(); };
    const keyDown = (event) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", keyDown);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", keyDown); };
  }, [onClose]);

  const speed = clip.speed || 1;
  return (
    <div ref={ref} className="clip-menu" role="menu" aria-label="Clip editing actions"
      style={{ left: Math.max(8, Math.min(position.x, window.innerWidth - 240)), top: Math.max(8, Math.min(position.y, window.innerHeight - 230)) }}>
      <div className="clip-menu-title" title={clip.title}>{clip.type === "audio" ? "Audio" : "Video"}: {clip.title}</div>
      {locked && <div className="clip-menu-note">Unlock the track to edit this clip.</div>}
      <div className="clip-menu-speed">
        <span>Speed: {speed}×</span>
        <button type="button" aria-label="Decrease speed" disabled={locked || speed <= 0.25} onClick={() => onSpeed(Math.max(0.25, Math.round((speed - 0.25) * 100) / 100))}>−</button>
        <button type="button" aria-label="Increase speed" disabled={locked || speed >= 2} onClick={() => onSpeed(Math.min(2, Math.round((speed + 0.25) * 100) / 100))}>+</button>
      </div>
      <button type="button" role="menuitem" disabled={locked} onClick={onMute}>{clip.muted ? "Unmute audio" : "Mute audio"}</button>
      {clip.type !== "audio" && <button type="button" role="menuitem" disabled={locked} onClick={onExtract}>Extract audio to another track</button>}
      <button type="button" role="menuitem" disabled={locked} onClick={onMore}>More editing tools…</button>
    </div>
  );
}
