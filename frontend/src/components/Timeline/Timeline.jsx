import { useRef, useState, useEffect } from "react";
import Toolbar from "./Toolbar";
import Ruler from "./Ruler";
import TrackHeader from "./TrackHeader";
import TrackLane from "./TrackLane";
import Playhead from "./Playhead";
import { PIXELS_PER_SECOND } from "../../hooks/useTimeline";
import "./Timeline.css";

export default function Timeline({
  tracks,
  clips,
  markers,
  selectedClipId,
  isSnapping,
  currentTime,
  duration,
  onSeek,
  onSetScrubbing,
  onSnapTime,
  onSelectClip,
  onMoveClip,
  onAddTrack,
  onToggleSnap,
  onSplitClip,
  onDeleteClip,
  onAddMarker,
  onToggleTrackLock,
  onToggleTrackVisible,
}) {
  const tracksAreaRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const timeFromEvent = (e) => {
    if (!tracksAreaRef.current) return 0;
    const rect = tracksAreaRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    return Math.max(0, clickX / PIXELS_PER_SECOND);
  };

  const handleMouseDown = (e) => {
    onSeek(onSnapTime(timeFromEvent(e)));
    setIsDragging(true);
    onSetScrubbing(true);
  };

  useEffect(() => {
    if (!isDragging) return undefined;

    const handleMouseMove = (e) => {
      const rawTime = timeFromEvent(e);
      const scrubTime = Math.max(0, Math.min(rawTime, duration));
      onSeek(onSnapTime(scrubTime));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      onSetScrubbing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, duration, onSeek, onSetScrubbing, onSnapTime]);

  return (
    <section className="timeline-section">
      <Toolbar
        isSnapping={isSnapping}
        hasSelectedClip={Boolean(selectedClipId)}
        currentTime={currentTime}
        duration={duration}
        onAddTrack={onAddTrack}
        onToggleSnap={onToggleSnap}
        onSplitClip={onSplitClip}
        onDeleteClip={onDeleteClip}
        onAddMarker={onAddMarker}
      />

      <div className="timeline-body">
        {/* Track Headers */}
        <div className="track-headers">
          <div className="timecode-header">{formatShortTimecode(currentTime)}</div>
          {tracks.map((track) => (
            <TrackHeader
              key={track.id}
              track={track}
              onToggleLock={onToggleTrackLock}
              onToggleVisible={onToggleTrackVisible}
            />
          ))}
        </div>

        {/* Canvas Tracks + Ruler */}
        <div
          className="timeline-tracks-area"
          ref={tracksAreaRef}
          onMouseDown={handleMouseDown}
          style={{ width: `${Math.max(duration * PIXELS_PER_SECOND, 1200)}px` }}
        >
          <Playhead time={currentTime} pixelsPerSecond={PIXELS_PER_SECOND} />

          {/* Markers */}
          {markers.map((m) => (
            <div
              key={m.id}
              className="marker-pin"
              title={m.label}
              style={{ left: `${m.time * PIXELS_PER_SECOND}px` }}
              onClick={(e) => {
                e.stopPropagation();
                onSeek(m.time);
              }}
            />
          ))}

          <Ruler duration={duration} pixelsPerSecond={PIXELS_PER_SECOND} />

          {/* Track Rows */}
          {tracks.map((track) => (
            <TrackLane
              key={track.id}
              track={track}
              clips={clips}
              selectedClipId={selectedClipId}
              pixelsPerSecond={PIXELS_PER_SECOND}
              onSelectClip={onSelectClip}
              onMoveClip={onMoveClip}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

const formatShortTimecode = (secs) => {
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = Math.floor(secs % 60);
  const frames = Math.floor((secs % 1) * 30);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(frames)}`;
};
