import { useEffect, useRef, useState } from "react";

export default function Clip({
  clip,
  isSelected,
  dimmed,
  locked,
  pixelsPerSecond,
  trackIds,
  trackIndex,
  onSelect,
  onMove,
  onMoveTrack,
  onTrim,
  onBeginEdit,
}) {
  const dragRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const left = (Number.isFinite(clip.start) ? clip.start : 0) * pixelsPerSecond;
  const clipDur =
    Number.isFinite(clip.duration) && clip.duration > 0 ? clip.duration : 1;
  const width = Math.max(clipDur * pixelsPerSecond, 12);
  const speed = clip.speed || 1;

  useEffect(() => {
    if (!isDragging) return undefined;

    const handleMouseMove = (event) => {
      if (!dragRef.current) return;
      if (event.buttons === 0) {
        dragRef.current = null;
        setIsDragging(false);
        return;
      }
      // Horizontal: move along the timeline.
      const delta = (event.clientX - dragRef.current.pointerX) / pixelsPerSecond;
      if (dragRef.current.trim) {
        const initial = dragRef.current;
        const speed = initial.speed;
        if (initial.trim === "left") {
          const minDelta = Math.max(-initial.start, (initial.sourceMin - initial.sourceStart) / speed);
          const adjusted = Math.max(minDelta, Math.min(initial.duration - 0.1, delta));
          onTrim(clip.id, { start: initial.start + adjusted, sourceStart: initial.sourceStart + adjusted * speed, duration: initial.duration - adjusted });
        } else {
          const maxDuration = (initial.sourceMax - initial.sourceStart) / speed;
          onTrim(clip.id, { duration: Math.max(0.1, Math.min(maxDuration, initial.duration + delta)) });
        }
        return;
      }
      onMove(clip.id, Math.max(0, dragRef.current.start + delta));

      // Vertical: hop between track lanes.
      if (onMoveTrack && trackIds?.length) {
        const laneRect = dragRef.current.lane?.getBoundingClientRect();
        const laneHeight = laneRect?.height || 52;
        const laneTop = laneRect?.top ?? 0;
        let laneIdx =
          dragRef.current.laneIndex +
          Math.round((event.clientY - (laneTop + laneHeight / 2)) / laneHeight);
        laneIdx = Math.max(0, Math.min(trackIds.length - 1, laneIdx));
        const targetTrackId = trackIds[laneIdx];
        if (targetTrackId !== clip.trackId) {
          onMoveTrack(clip.id, targetTrackId);
        }
      }
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    clip.id,
    clip.trackId,
    isDragging,
    onMove,
    onMoveTrack,
    onTrim,
    pixelsPerSecond,
    trackIds,
  ]);

  const handleMouseDown = (event) => {
    event.stopPropagation();
    if (locked || event.button !== 0) return;
    event.preventDefault();
    onBeginEdit();
    onSelect(clip.id);
    dragRef.current = {
      pointerX: event.clientX,
      start: clip.start,
      laneIndex: trackIndex,
      lane: event.currentTarget.parentElement,
    };
    setIsDragging(true);
  };

  const handleTrimStart = (event, trim) => {
    event.stopPropagation();
    if (locked || event.button !== 0) return;
    event.preventDefault();
    onBeginEdit();
    onSelect(clip.id);
    dragRef.current = {
      trim, pointerX: event.clientX, start: clip.start, duration: clip.duration,
      sourceStart: clip.sourceStart || 0, sourceMin: clip.sourceMin || 0,
      sourceMax: clip.sourceMax ?? ((clip.sourceStart || 0) + clip.duration * speed), speed,
    };
    setIsDragging(true);
  };

  return (
    <div
      className={`timeline-clip ${isSelected ? "selected" : ""} ${
        clip.type === "audio" ? "audio-clip" : "video-clip"
      }`}
      style={{
        left: `${left}px`,
        width: `${width}px`,
        opacity: dimmed ? 0.35 : 1,
        cursor: locked ? "not-allowed" : isDragging ? "grabbing" : "grab",
      }}
      onMouseDown={handleMouseDown}
      onClick={(e) => {
        e.stopPropagation();
        if (!locked) onSelect(clip.id);
      }}
    >
      <div className="clip-handle left" onMouseDown={(event) => handleTrimStart(event, "left")} />
      <div className="clip-content-wrap">
        <span className="clip-type-icon">
          {clip.type === "audio" ? "🎵" : "🎬"}
        </span>
        <span className="clip-title">{clip.title}</span>
      </div>
      {clip.type === "audio" && <div className="audio-waveform-bars" />}
      {speed !== 1 && <span className="clip-speed">{speed}x</span>}
      <div className="clip-handle right" onMouseDown={(event) => handleTrimStart(event, "right")} />
    </div>
  );
}
