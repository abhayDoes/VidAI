import { useEffect, useRef, useState } from "react";

export default function Clip({
  clip,
  isSelected,
  dimmed,
  locked,
  pixelsPerSecond,
  onSelect,
  onMove,
}) {
  const dragRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const left = clip.start * pixelsPerSecond;
  const width = Math.max(clip.duration * pixelsPerSecond, 8);

  useEffect(() => {
    if (!isDragging) return undefined;

    const handleMouseMove = (event) => {
      if (!dragRef.current) return;
      const delta = (event.clientX - dragRef.current.pointerX) / pixelsPerSecond;
      onMove(clip.id, Math.max(0, dragRef.current.start + delta));
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
  }, [clip.id, isDragging, onMove, pixelsPerSecond]);

  const handleMouseDown = (event) => {
    event.stopPropagation();
    if (locked || event.button !== 0) return;
    event.preventDefault();
    onSelect(clip.id);
    dragRef.current = { pointerX: event.clientX, start: clip.start };
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
      <div className="clip-handle right" />
    </div>
  );
}
