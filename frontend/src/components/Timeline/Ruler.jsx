const RULER_INTERVAL = 20;

export default function Ruler({ duration, pixelsPerSecond }) {
  const totalTicks = Math.ceil(duration / RULER_INTERVAL);
  const ticks = Array.from({ length: totalTicks + 1 }, (_, i) => i * RULER_INTERVAL);

  return (
    <div className="time-ruler">
      {ticks.map((timeSec) => {
        const leftPx = timeSec * pixelsPerSecond;
        const min = Math.floor(timeSec / 60);
        const sec = timeSec % 60;
        const label = `${min}:${String(sec).padStart(2, "0")}`;

        return (
          <div key={timeSec}>
            <span className="ruler-marker" style={{ left: `${leftPx}px` }}>
              {label}
            </span>
            <div className="ruler-tick major" style={{ left: `${leftPx}px` }} />
            <div
              className="ruler-tick"
              style={{ left: `${leftPx + 10 * (pixelsPerSecond / 2)}px` }}
            />
          </div>
        );
      })}
    </div>
  );
}
