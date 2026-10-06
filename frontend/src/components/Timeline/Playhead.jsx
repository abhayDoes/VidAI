export default function Playhead({ time, pixelsPerSecond }) {
  return (
    <div
      className="playhead-line"
      style={{ left: `${time * pixelsPerSecond}px` }}
    >
      <div className="playhead-head" />
    </div>
  );
}
