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
}) {
  const dragRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const left = clip.start * pixelsPerSecond;
  const width = Math.max(clip.duration * pixelsPerSecond, 8);
  const speed = clip.speed || 1;

  useEffect(() => {
    if (!isDragging) return undefined;

    const handleMouseMove = (event) => {
      if (!dragRef.current) return;
      // Horizontal: move along the timeline.
      const delta = (event.clientX - dragRef.current.pointerX) / pixelsPerSecond;
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
    pixelsPerSecond,
    trackIds,
  ]);

  const handleMouseDown = (event) => {
    event.stopPropagation();
    if (locked || event.button !== 0) return;
    event.preventDefault();
    onSelect(clip.id);
    dragRef.current = {
      pointerX: event.clientX,
      start: clip.start,
      laneIndex: trackIndex,
      lane: event.currentTarget.parentElement,
    };
    setIsDragging(true);
  };

  return (
    <div
      className={`timeline-clip ${isSelected ? "selected" : ""}`}
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
      <div className="clip-handle left" />
      <span className="clip-title">{clip.title}</span>
      {speed !== 1 && <span className="clip-speed">{speed}x</span>}
      <div className="clip-handle right" />
    </div>
  );
}
