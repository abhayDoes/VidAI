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
  onTrimClip,
  onBeginEdit,
  isSelected,
  onSelectTrack,
  onClipMenu,
}) {
  const trackClips = clips.filter((clip) => clip.trackId === track.id);
  const mixed = trackClips.some((clip) => clip.type === "audio") && trackClips.some((clip) => clip.type !== "audio");
  return (
    <div
      className={`track-lane ${isSelected ? "track-lane-selected" : ""} ${mixed ? "track-lane-mixed" : ""}`}
      onMouseDown={(event) => { if (event.button === 0) onSelectTrack(track.id); }}
    >
      {trackClips
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
            onTrim={onTrimClip}
            onBeginEdit={onBeginEdit}
            onClipMenu={onClipMenu}
          />
        ))}
    </div>
  );
}
