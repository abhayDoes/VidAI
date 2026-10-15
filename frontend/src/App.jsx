import { useEffect, useRef, useState } from "react";
import Header from "./components/Header/Header";
import VideoPlayer from "./components/Player/VideoPlayer";
import Controls from "./components/Player/Controls";
import Inspector from "./components/Inspector/Inspector";
import Timeline from "./components/Timeline/Timeline";
import useVideoPlayer from "./hooks/useVideoPlayer";
import useTimeline from "./hooks/useTimeline";
import { videoApi } from "./services/api";
import "./App.css";

const DEFAULT_TRANSFORM = {
  rotation: 0,
  flipH: false,
  flipV: false,
  aspectRatio: "16:9",
};

export default function App() {
  const fileInputRef = useRef(null);
  const [status, setStatus] = useState("");

  const player = useVideoPlayer();
  const { setVideoSource, setIsPlaying, setDuration } = player;
  const timeline = useTimeline({ videoDuration: player.duration });
  const timelineEnd = timeline.clips.reduce(
    (end, clip) => Math.max(end, clip.start + clip.duration),
    0
  );
  const timelineDuration = Math.max(player.duration, timelineEnd + 1, 120);

  // Clips can grow past the player duration (e.g. slowing a part to 0.5x
  // doubles its timeline length). Keep the seekable duration covering them.
  useEffect(() => {
    if (timelineEnd + 1 > player.duration) {
      setDuration(timelineEnd + 1);
    }
  }, [timelineEnd, player.duration, setDuration]);

  const selectedClip = timeline.clips.find(
    (clip) => clip.id === timeline.selectedClipId
  );
  const visibleTrackIds = new Set(
    timeline.tracks.filter((track) => track.visible).map((track) => track.id)
  );
  const visibleClips = timeline.clips.filter((clip) =>
    visibleTrackIds.has(clip.trackId)
  );
  const activeClip = timeline.clips
    .filter(
      (clip) =>
        visibleTrackIds.has(clip.trackId) &&
        player.currentTime >= clip.start - 0.001 &&
        player.currentTime < clip.start + clip.duration
    )
    .sort((a, b) =>
      timeline.tracks.findIndex((track) => track.id === a.trackId) -
      timeline.tracks.findIndex((track) => track.id === b.trackId)
    )[0];

  // Rotation / flip / aspect are per-clip: the preview follows the clip under
  // the playhead, while the Inspector edits the selected clip.
  const selectedTransform = {
    rotation: selectedClip?.rotation ?? DEFAULT_TRANSFORM.rotation,
    flipH: selectedClip?.flipH ?? DEFAULT_TRANSFORM.flipH,
    flipV: selectedClip?.flipV ?? DEFAULT_TRANSFORM.flipV,
    aspectRatio: selectedClip?.aspectRatio ?? DEFAULT_TRANSFORM.aspectRatio,
  };
  const activeTransform = {
    rotation: activeClip?.rotation ?? DEFAULT_TRANSFORM.rotation,
    flipH: activeClip?.flipH ?? DEFAULT_TRANSFORM.flipH,
    flipV: activeClip?.flipV ?? DEFAULT_TRANSFORM.flipV,
    aspectRatio: activeClip?.aspectRatio ?? DEFAULT_TRANSFORM.aspectRatio,
  };

  useEffect(() => {
    setVideoSource(activeClip?.file, activeClip?.sourceUrl);
    if (!activeClip) setIsPlaying(false);
  }, [activeClip, setIsPlaying, setVideoSource]);

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    let nextStart = timelineEnd;
    const importedClips = [];

    for (const [index, file] of files.entries()) {
      try {
        const media = await player.loadVideo(file);
        if (!media) continue;

        let filename = file.name;
        try {
          const uploaded = await videoApi.upload(file);
          filename = uploaded.filename || filename;
        } catch (error) {
          console.warn(`Could not upload ${file.name} to the backend`, error);
        }

        const clip = {
          id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
          trackId: 1,
          title: file.name,
          filename,
          file,
          sourceUrl: media.url,
          sourceStart: 0,
          sourceMin: 0,
          sourceMax: media.duration,
          speed: 1,
          ...DEFAULT_TRANSFORM,
          start: nextStart,
          duration: media.duration,
        };
        timeline.addClip(clip);
        importedClips.push(clip);
        nextStart += media.duration;
      } catch (error) {
        console.error(error);
        setStatus(`Could not read ${file.name}`);
      }
    }

    if (importedClips.length) {
      timeline.selectClip(importedClips[0].id);
      player.setDuration(Math.max(120, nextStart + 1));
      player.seekTo(importedClips[0].start);
      setStatus(
        `Added ${importedClips.length} video${importedClips.length === 1 ? "" : "s"} to the timeline`
      );
    }
  };

  const handleExportToServer = async () => {
    if (!visibleClips.length) {
      fileInputRef.current?.click();
      return;
    }

    const segments = [...visibleClips]
      .filter((clip) => clip.filename && clip.duration > 0)
      .sort((a, b) => a.start - b.start)
      .map((clip) => ({
        filename: clip.filename,
        start: clip.sourceStart || 0,
        duration: clip.duration * (clip.speed || 1),
        speed: clip.speed || 1,
      }));

    if (!segments.length || segments.length !== visibleClips.length) {
      setStatus("Upload the source videos before exporting the timeline");
      return;
    }

    setStatus("Rendering timeline with cuts applied...");
    try {
      const data = await videoApi.merge(segments);
      setStatus(`Rendered: ${data.filename}`);
    } catch (error) {
      console.error(error);
      setStatus("Timeline render failed");
    }
  };

  const handleVideoProcessed = (newUrl, newFilename) => {
    if (!selectedClip) return;
    const speed = selectedClip.speed || 1;
    const tempVideo = document.createElement("video");
    tempVideo.preload = "metadata";
    tempVideo.src = newUrl;
    tempVideo.onloadedmetadata = () => {
      const newLen =
        tempVideo.duration || selectedClip.duration * speed;
      timeline.updateClip(selectedClip.id, {
        title: newFilename || selectedClip.title,
        filename: newFilename || selectedClip.filename,
        sourceUrl: newUrl,
        sourceStart: 0,
        sourceMin: 0,
        sourceMax: newLen,
        duration: newLen / speed,
      });
    };
  };

  const handleSelectClip = (clipId) => {
    const clip = timeline.clips.find((item) => item.id === clipId);
    timeline.selectClip(clipId);
    if (clip) {
      player.seekTo(
        clip.start,
        clip.start,
        clip.sourceStart || 0,
        clip.speed || 1
      );
    }
  };

  const handleMoveClip = (clipId, desiredStart) => {
    const clip = timeline.clips.find((item) => item.id === clipId);
    if (!clip) return;
    const start = timeline.snapTime(desiredStart, clipId);
    timeline.updateClip(clipId, { start });
    if (start + clip.duration >= player.duration) {
      player.setDuration(start + clip.duration + 1);
    }
  };

  const handleTimeUpdate = () => {
    if (!activeClip || player.isScrubbing()) return;

    const activeSpeed = activeClip.speed || 1;
    const sourceStart = activeClip.sourceStart || 0;
    const sourceTime = player.videoRef.current?.currentTime;
    if (!Number.isFinite(sourceTime)) return;

    const timelineTime =
      activeClip.start + (sourceTime - sourceStart) / activeSpeed;
    const clipEnd = activeClip.start + activeClip.duration;
    // Hand off just before the exact end: timeupdate events only fire a few
    // times per second, so waiting for the precise boundary overshoots it.
    if (player.isPlaying && timelineTime >= clipEnd - 1 / 30) {
      const nextClip = timeline.clips
        .filter(
          (clip) =>
            visibleTrackIds.has(clip.trackId) &&
            clip.start >= clipEnd - 0.05
        )
        .sort((a, b) => a.start - b.start)[0];

      if (nextClip) {
        player.seekTo(
          nextClip.start,
          nextClip.start,
          nextClip.sourceStart || 0,
          nextClip.speed || 1
        );
      } else {
        player.seekTo(clipEnd);
        player.setIsPlaying(false);
      }
      return;
    }

    player.handleTimeUpdate(activeClip.start, sourceStart, activeSpeed);
  };

  const handleTogglePlay = () => {
    if (activeClip) {
      player.togglePlay();
      return;
    }

    const nextClip = timeline.clips
      .filter(
        (clip) =>
          visibleTrackIds.has(clip.trackId) && clip.start >= player.currentTime
      )
      .sort((a, b) => a.start - b.start)[0];

    if (nextClip) {
      player.seekTo(
        nextClip.start,
        nextClip.start,
        nextClip.sourceStart || 0,
        nextClip.speed || 1
      );
      player.setIsPlaying(true);
    }
  };

  const handleVideoEnded = () => {
    if (!activeClip) {
      player.setIsPlaying(false);
      return;
    }
    const nextClip = timeline.clips
      .filter(
        (clip) =>
          visibleTrackIds.has(clip.trackId) &&
          clip.start >= activeClip.start + activeClip.duration
      )
      .sort((a, b) => a.start - b.start)[0];

    if (nextClip) {
      player.seekTo(
        nextClip.start,
        nextClip.start,
        nextClip.sourceStart || 0,
        nextClip.speed || 1
      );
    } else {
      player.setIsPlaying(false);
    }
  };

  const handleSplitClip = () =>
    timeline.splitClip(timeline.selectedClipId, player.currentTime);

  const handleDeleteClip = () => {
    const deletedClip = timeline.deleteClip(timeline.selectedClipId);
    if (!deletedClip) return;

    const deletedEnd = deletedClip.start + deletedClip.duration;
    const nextTime =
      player.currentTime >= deletedEnd
        ? player.currentTime - deletedClip.duration
        : player.currentTime >= deletedClip.start
          ? deletedClip.start
          : player.currentTime;

    const nextEnd = timeline.clips
      .filter((clip) => clip.id !== deletedClip.id)
      .reduce((end, clip) => {
        const shiftedStart =
          clip.trackId === deletedClip.trackId && clip.start >= deletedEnd
            ? clip.start - deletedClip.duration
            : clip.start;
        return Math.max(end, shiftedStart + clip.duration);
      }, 0);

    player.setDuration(Math.max(120, nextEnd + 1));
    player.seekTo(nextTime);
    setStatus("Cut segment removed; following clips rippled left");
  };

  return (
    <div className="editor-container">
      <Header
        status={status}
        hasVideo={timeline.clips.length > 0}
        onImport={() => fileInputRef.current?.click()}
        onExport={handleExportToServer}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        multiple
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      <div className="workspace-row">
        <div className="player-pane">
          <VideoPlayer
            videoRef={player.videoRef}
            videoUrl={activeClip?.sourceUrl || null}
            clipId={activeClip?.id || null}
            clipStart={activeClip?.start || 0}
            sourceStart={activeClip?.sourceStart || 0}
            speed={activeClip?.speed || 1}
            currentTime={player.currentTime}
            isPlaying={player.isPlaying}
            rotation={activeTransform.rotation}
            flipH={activeTransform.flipH}
            flipV={activeTransform.flipV}
            aspectRatio={activeTransform.aspectRatio}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleVideoEnded}
            onTogglePlay={handleTogglePlay}
            onImportClick={() => fileInputRef.current?.click()}
          />
          <Controls
            isPlaying={player.isPlaying}
            currentTime={player.currentTime}
            duration={timelineDuration}
            onTogglePlay={handleTogglePlay}
            onSeek={player.seekTo}
          />
        </div>

        <Inspector
          videoFile={selectedClip?.file}
          selectedClip={selectedClip}
          transform={selectedTransform}
          onTransformChange={(next) =>
            selectedClip && timeline.updateClip(selectedClip.id, next)
          }
          onStatus={setStatus}
          onVideoProcessed={handleVideoProcessed}
          onSeekClip={(...args) => player.seekTo(...args)}
        />
      </div>

      <Timeline
        tracks={timeline.tracks}
        clips={timeline.clips}
        markers={timeline.markers}
        selectedClipId={timeline.selectedClipId}
        isSnapping={timeline.isSnapping}
        currentTime={player.currentTime}
        duration={timelineDuration}
        onSeek={player.seekTo}
        onSetScrubbing={player.setScrubbing}
        onSnapTime={timeline.snapTime}
        onSelectClip={handleSelectClip}
        onMoveClip={handleMoveClip}
        onMoveClipTrack={timeline.moveClipToTrack}
        onAddTrack={timeline.addTrack}
        onToggleSnap={() => timeline.setIsSnapping(!timeline.isSnapping)}
        onSplitClip={handleSplitClip}
        onDeleteClip={handleDeleteClip}
        onAddMarker={() => timeline.addMarker(player.currentTime)}
        onToggleTrackLock={timeline.toggleTrackLock}
        onToggleTrackVisible={timeline.toggleTrackVisible}
      />
    </div>
  );
}
