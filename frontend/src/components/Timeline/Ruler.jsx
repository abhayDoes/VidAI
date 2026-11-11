const FRAMES_PER_SECOND = 30;
const FRAME_INTERVALS = [1, 3, 6, 15, 30, 60, 150, 300, 600, 900, 1800];
const MIN_MAJOR_SPACING_PX = 90;

export default function Ruler({ duration, pixelsPerSecond, visibleStartPx = 0, visibleWidthPx = 0 }) {
  const frameInterval = FRAME_INTERVALS.find(
    (frames) => (frames / FRAMES_PER_SECOND) * pixelsPerSecond >= MIN_MAJOR_SPACING_PX
  ) ?? 1;
  const lastFrame = Math.ceil(duration * FRAMES_PER_SECOND);
  const firstVisibleFrame = Math.max(
    0,
    Math.floor(((visibleStartPx / pixelsPerSecond) * FRAMES_PER_SECOND) / frameInterval) * frameInterval - frameInterval
  );
  const visibleEndFrame = Math.min(
    lastFrame,
    Math.ceil(((visibleStartPx + visibleWidthPx) / pixelsPerSecond) * FRAMES_PER_SECOND / frameInterval) * frameInterval + frameInterval
  );
  const ticks = [];
  for (let frame = firstVisibleFrame; frame <= visibleEndFrame; frame += frameInterval) {
    ticks.push(frame);
  }
  const subdivisions = frameInterval % 5 === 0 ? 5 : frameInterval % 3 === 0 ? 3 : 1;

  return (
    <div className="time-ruler">
      {ticks.map((frame) => {
        const timeSec = frame / FRAMES_PER_SECOND;
        const leftPx = timeSec * pixelsPerSecond;

        return (
          <div key={frame}>
            <span className="ruler-marker" style={{ left: `${leftPx}px` }}>
              {formatFrameTimecode(frame)}
            </span>
            <div className="ruler-tick major" style={{ left: `${leftPx}px` }} />
            {subdivisions > 1 && Array.from({ length: subdivisions - 1 }, (_, index) => {
              const minorFrame = frame + (frameInterval * (index + 1)) / subdivisions;
              if (minorFrame > duration * FRAMES_PER_SECOND) return null;
              return (
                <div
                  key={`${frame}-minor-${index}`}
                  className="ruler-tick"
                  style={{ left: `${(minorFrame / FRAMES_PER_SECOND) * pixelsPerSecond}px` }}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function formatFrameTimecode(frame) {
  const totalSeconds = Math.floor(frame / FRAMES_PER_SECOND);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const frameNumber = frame % FRAMES_PER_SECOND;
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frameNumber)}`;
}
