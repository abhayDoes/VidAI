import Clip from "./Clip";

export default function TrackLane({
  track,
  trackIds,
  trackIndex,
  clips,
  selectedClipId,
  pixelsPerSecond,
  onSelectClip,
  onMoveClip,
  onMoveClipTrack,
}) {
  return (
    <div
      className={`track-lane ${
        track.type === "audio" ? "audio-track-lane" : "video-track-lane"
      }`}
    >
      {clips
        .filter((clip) => clip.trackId === track.id)
        .map((clip) => (
          <Clip
            key={clip.id}
            clip={clip}
            isSelected={selectedClipId === clip.id}
            dimmed={!track.visible}
            locked={track.locked}
            pixelsPerSecond={pixelsPerSecond}
            trackIds={trackIds}
            trackIndex={trackIndex}
            onSelect={onSelectClip}
            onMove={onMoveClip}
            onMoveTrack={onMoveClipTrack}
          />
        ))}
    </div>
  );
}
