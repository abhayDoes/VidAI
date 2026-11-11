export function formatTimecodeMilliseconds(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const totalMilliseconds = Math.round(safeSeconds * 1000);
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const wholeSeconds = totalSeconds % 60;
  const milliseconds = totalMilliseconds % 1000;
  const pad = (value, width = 2) => String(value).padStart(width, "0");

  return `${pad(hours)}:${pad(minutes)}:${pad(wholeSeconds)}.${pad(milliseconds, 3)}`;
}
