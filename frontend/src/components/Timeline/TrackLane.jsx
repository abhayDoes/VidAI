import Clip from "./Clip";

export default function TrackLane({
  track,
  clips,
  selectedClipId,
  pixelsPerSecond,
  onSelectClip,
  onMoveClip,
}) {
  return (
    <div className="track-lane">
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
            onSelect={onSelectClip}
            onMove={onMoveClip}
          />
        ))}
    </div>
  );
}
