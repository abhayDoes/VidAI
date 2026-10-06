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

export default function App() {
  const fileInputRef = useRef(null);
  const [status, setStatus] = useState("");
  const [renderedVideoUrl, setRenderedVideoUrl] = useState("");
  const [transform, setTransform] = useState({
    rotation: 0,
    flipH: false,
    flipV: false,
    aspectRatio: "16:9",
  });

  const player = useVideoPlayer();
  const { setVideoSource, setIsPlaying } = player;
  const timeline = useTimeline({ videoDuration: player.duration });
  const timelineEnd = timeline.clips.reduce(
    (end, clip) => Math.max(end, clip.start + clip.duration),
    0
  );
  const timelineDuration = Math.max(player.duration, timelineEnd + 1, 120);

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
        player.currentTime >= clip.start &&
        player.currentTime < clip.start + clip.duration
    )
    .sort((a, b) =>
      timeline.tracks.findIndex((track) => track.id === a.trackId) -
      timeline.tracks.findIndex((track) => track.id === b.trackId)
    )[0];

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
        duration: clip.duration,
      }));

    if (!segments.length || segments.length !== visibleClips.length) {
      setStatus("Upload the source videos before exporting the timeline");
      return;
    }

    setStatus("Rendering timeline with cuts applied...");
    try {
      const data = await videoApi.merge(segments);
      const backendBase = import.meta.env.VITE_API_URL || "http://localhost:8000";
      if (data.url) setRenderedVideoUrl(`${backendBase}${data.url}`);
      setStatus(`Rendered: ${data.filename}`);
    } catch (error) {
      console.error(error);
      setStatus("Timeline render failed");
    }
  };

  const handleVideoProcessed = (newUrl, newFilename) => {
    if (!selectedClip) return;
    const tempVideo = document.createElement("video");
    tempVideo.preload = "metadata";
    tempVideo.src = newUrl;
    tempVideo.onloadedmetadata = () => {
      timeline.updateClip(selectedClip.id, {
        title: newFilename || selectedClip.title,
        filename: newFilename || selectedClip.filename,
        sourceUrl: newUrl,
        sourceStart: 0,
        sourceMin: 0,
        sourceMax: tempVideo.duration || selectedClip.duration,
        duration: tempVideo.duration || selectedClip.duration,
      });
    };
  };

  const handleSelectClip = (clipId) => {
    const clip = timeline.clips.find((item) => item.id === clipId);
    timeline.selectClip(clipId);
    if (clip) player.seekTo(clip.start);
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

    const sourceStart = activeClip.sourceStart || 0;
    const sourceTime = player.videoRef.current?.currentTime;
    if (!Number.isFinite(sourceTime)) return;

    const timelineTime = activeClip.start + sourceTime - sourceStart;
    const clipEnd = activeClip.start + activeClip.duration;
    if (player.isPlaying && timelineTime >= clipEnd) {
      const nextClip = timeline.clips
        .filter(
          (clip) =>
            visibleTrackIds.has(clip.trackId) &&
            clip.start >= clipEnd - 0.001
        )
        .sort((a, b) => a.start - b.start)[0];

      if (nextClip) {
        player.seekTo(nextClip.start);
      } else {
        player.seekTo(clipEnd);
        player.setIsPlaying(false);
      }
      return;
    }

    player.handleTimeUpdate(activeClip.start, sourceStart);
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
      player.seekTo(nextClip.start);
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
      player.seekTo(nextClip.start);
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
            clipStart={activeClip?.start || 0}
            sourceStart={activeClip?.sourceStart || 0}
            currentTime={player.currentTime}
            isPlaying={player.isPlaying}
            rotation={transform.rotation}
            flipH={transform.flipH}
            flipV={transform.flipV}
            aspectRatio={transform.aspectRatio}
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
          clips={visibleClips}
          transform={transform}
          onTransformChange={setTransform}
          onUpdateClip={timeline.updateClip}
          onStatus={setStatus}
          onVideoProcessed={handleVideoProcessed}
          renderedVideoUrl={renderedVideoUrl}
          onRenderedVideoUrl={setRenderedVideoUrl}
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
