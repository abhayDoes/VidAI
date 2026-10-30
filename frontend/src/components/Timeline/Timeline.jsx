import { useRef, useState, useEffect, useCallback } from "react";
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
  selectedTrackId,
  isSnapping,
  currentTime,
  duration,
  onSeek,
  onSetScrubbing,
  onSnapTime,
  onSelectClip,
  onSelectTrack,
  onMoveClip,
  onMoveClipTrack,
  onTrimClip,
  onBeginEdit,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAddTrack,
  onToggleSnap,
  onSplitClip,
  onDeleteClip,
  onAddMarker,
  onToggleTrackLock,
  onToggleTrackVisible,
  onToggleTrackMute,
  onSetTrackVolume,
}) {
  const tracksAreaRef = useRef(null);
  const timelineBodyRef = useRef(null);
  const [zoom, setZoom] = useState(PIXELS_PER_SECOND);
  const [isDragging, setIsDragging] = useState(false);

  const timeFromEvent = useCallback(
    (e) => {
      if (!tracksAreaRef.current) return 0;
      const rect = tracksAreaRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      return Math.max(0, clickX / zoom);
    },
    [zoom]
  );

  const handleMouseDown = (e) => {
    onSeek(onSnapTime(timeFromEvent(e)));
    setIsDragging(true);
    onSetScrubbing(true);
  };

  // Auto-scroll timeline to bring selected/imported clip into view
  useEffect(() => {
    if (!selectedClipId || !timelineBodyRef.current) return;
    const clip = clips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    const clipLeft = (Number.isFinite(clip.start) ? clip.start : 0) * zoom;
    const body = timelineBodyRef.current;
    const viewLeft = body.scrollLeft;
    const viewRight = body.scrollLeft + body.clientWidth - 160;

    if (clipLeft < viewLeft || clipLeft > viewRight) {
      body.scrollTo({ left: Math.max(0, clipLeft - 60), behavior: "smooth" });
    }
  }, [selectedClipId, clips, zoom]);

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
  }, [isDragging, duration, onSeek, onSetScrubbing, onSnapTime, timeFromEvent]);

  const handleZoomIn = () => setZoom((prev) => Math.min(100, Math.round(prev * 1.3)));
  const handleZoomOut = () => setZoom((prev) => Math.max(2, Math.round(prev / 1.3)));
  const handleZoomFit = () => {
    if (!timelineBodyRef.current || duration <= 0) return;
    const available = timelineBodyRef.current.clientWidth - 160;
    if (available > 100) {
      const fitZoom = Math.max(2, Math.min(100, available / duration));
      setZoom(Math.round(fitZoom * 10) / 10);
    }
  };

  return (
    <section className="timeline-section">
      <Toolbar
        isSnapping={isSnapping}
        hasSelectedClip={Boolean(selectedClipId)}
        currentTime={currentTime}
        duration={duration}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomFit={handleZoomFit}
        onSeek={onSeek}
        onAddTrack={onAddTrack}
        onToggleSnap={onToggleSnap}
        onSplitClip={onSplitClip}
        onDeleteClip={onDeleteClip}
        onAddMarker={onAddMarker}
        onUndo={onUndo}
        onRedo={onRedo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      <div className="timeline-body" ref={timelineBodyRef}>
        {/* Track Headers */}
        <div className="track-headers">
          <div className="timecode-header">{formatShortTimecode(currentTime)}</div>
          {tracks.map((track) => (
            <TrackHeader
              key={track.id}
              track={track}
              isSelected={track.id === selectedTrackId}
              onSelectTrack={onSelectTrack}
              onToggleLock={onToggleTrackLock}
              onToggleVisible={onToggleTrackVisible}
              onToggleMute={onToggleTrackMute}
              onSetVolume={onSetTrackVolume}
              onBeginEdit={onBeginEdit}
            />
          ))}
        </div>

        {/* Canvas Tracks + Ruler */}
        <div
          className="timeline-tracks-area"
          ref={tracksAreaRef}
          onMouseDown={handleMouseDown}
          style={{ width: `${Math.max(duration * zoom, 1200)}px` }}
        >
          <Playhead time={currentTime} pixelsPerSecond={zoom} />

          {/* Markers */}
          {markers.map((m) => (
            <div
              key={m.id}
              className="marker-pin"
              title={m.label}
              style={{ left: `${m.time * zoom}px` }}
              onClick={(e) => {
                e.stopPropagation();
                onSeek(m.time);
              }}
            />
          ))}

          <Ruler duration={duration} pixelsPerSecond={zoom} />

          {/* Track Rows */}
          {tracks.map((track, index) => (
            <TrackLane
              key={track.id}
              track={track}
              trackIds={tracks.map((t) => t.id)}
              trackIndex={index}
              clips={clips}
              selectedClipId={selectedClipId}
              isSelected={track.id === selectedTrackId}
              onSelectTrack={onSelectTrack}
              pixelsPerSecond={zoom}
              onSelectClip={onSelectClip}
              onMoveClip={onMoveClip}
              onMoveClipTrack={onMoveClipTrack}
              onTrimClip={onTrimClip}
              onBeginEdit={onBeginEdit}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

const formatShortTimecode = (secs) => {
  if (!Number.isFinite(secs) || secs < 0) secs = 0;
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = Math.floor(secs % 60);
  const frames = Math.floor((secs % 1) * 30);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(frames)}`;
};
