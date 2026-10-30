import { useEffect, useRef, useState, useCallback } from "react";
import Header from "./components/Header/Header";
import VideoPlayer from "./components/Player/VideoPlayer";
import Controls from "./components/Player/Controls";
import Inspector from "./components/Inspector/Inspector";
import Timeline from "./components/Timeline/Timeline";
import useVideoPlayer from "./hooks/useVideoPlayer";
import useTimeline from "./hooks/useTimeline";
import useAudioMixer from "./hooks/useAudioMixer";
import { isAudioFile, loadAudioFile } from "./utils/audioUtils";
import { downloadFile, exportTimeline, processClip } from "./services/ffmpeg";
import "./App.css";

const DEFAULT_TRANSFORM = {
  rotation: 0,
  flipH: false,
  flipV: false,
  aspectRatio: "16:9",
};

export default function App() {
  const fileInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const [status, setStatus] = useState("");
  const [gpuPreviewEnabled, setGpuPreviewEnabled] = useState(true);

  const player = useVideoPlayer();
  const { setVideoSource, setIsPlaying, setDuration } = player;
  const timeline = useTimeline({ videoDuration: player.duration });

  // Manage frontend-level background audio track playback in sync with playhead
  useAudioMixer({
    clips: timeline.clips,
    tracks: timeline.tracks,
    currentTime: player.currentTime,
    isPlaying: player.isPlaying,
    isScrubbing: player.isScrubbing(),
  });
  const timelineEnd = timeline.clips.reduce((end, clip) => {
    const clipEnd = clip.start + clip.duration;
    return Number.isFinite(clipEnd) ? Math.max(end, clipEnd) : end;
  }, 0);
  const timelineDuration = Math.max(timelineEnd > 0 ? timelineEnd + 5 : 60, 60);

  useEffect(() => {
    if (timelineDuration !== player.duration) {
      setDuration(timelineDuration);
    }
  }, [timelineDuration, player.duration, setDuration]);

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
        clip.type !== "audio" &&
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

    // Dedicated target video track & starting position calculation
    const videoTracks = timeline.tracks.filter((t) => t.type !== "audio");
    const primaryVideoTrack =
      videoTracks.find((t) => t.id === 1) ||
      videoTracks[videoTracks.length - 1] ||
      videoTracks[0];
    const targetVideoTrackId = primaryVideoTrack ? primaryVideoTrack.id : 1;

    const existingVideoClips = timeline.clips.filter(
      (c) => c.trackId === targetVideoTrackId && c.type !== "audio"
    );
    let nextVideoStart = existingVideoClips.reduce(
      (end, c) => Math.max(end, c.start + c.duration),
      0
    );

    // Dedicated target audio track & starting position calculation
    const audioTrack =
      timeline.tracks.find((t) => t.type === "audio") ||
      timeline.tracks[timeline.tracks.length - 1];
    const audioTrackId = audioTrack ? audioTrack.id : 101;
    const existingAudioClips = timeline.clips.filter((c) => c.trackId === audioTrackId);
    let nextAudioStart = existingAudioClips.reduce(
      (end, c) => Math.max(end, c.start + c.duration),
      0
    );

    const importedClips = [];

    for (const [index, file] of files.entries()) {
      try {
        const isAudio = isAudioFile(file);
        let media;
        let trackId = targetVideoTrackId;
        let clipStart = 0;

        if (isAudio) {
          media = await loadAudioFile(file);
          trackId = audioTrackId;
          clipStart = nextAudioStart;
        } else {
          media = await player.loadVideo(file);
          trackId = targetVideoTrackId;
          clipStart = nextVideoStart;
        }

        if (!media) continue;

        const safeDuration =
          Number.isFinite(media.duration) && media.duration > 0
            ? media.duration
            : 30;

        const clip = {
          id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
          trackId,
          type: isAudio ? "audio" : "video",
          title: file.name,
          filename: file.name,
          file,
          sourceUrl: media.url,
          width: media.width,
          height: media.height,
          sourceStart: 0,
          sourceMin: 0,
          sourceMax: safeDuration,
          speed: 1,
          volume: 1,
          ...DEFAULT_TRANSFORM,
          start: clipStart,
          duration: safeDuration,
        };
        timeline.addClip(clip);
        importedClips.push(clip);

        if (isAudio) {
          nextAudioStart += safeDuration;
        } else {
          nextVideoStart += safeDuration;
        }
      } catch (error) {
        console.error(error);
        setStatus(`Could not read ${file.name}`);
      }
    }

    if (importedClips.length) {
      const firstClip = importedClips[0];
      timeline.selectClip(firstClip.id);
      player.seekTo(
        firstClip.start,
        firstClip.start,
        firstClip.sourceStart || 0,
        firstClip.speed || 1
      );
      setStatus(
        `Added ${importedClips.length} track item${importedClips.length === 1 ? "" : "s"} to the timeline`
      );
    }
  };

  const handleExport = async () => {
    if (!visibleClips.length) {
      fileInputRef.current?.click();
      return;
    }

    const videoClips = visibleClips.filter((c) => c.type !== "audio");
    if (!videoClips.length) {
      setStatus("Add a video clip before exporting");
      return;
    }
    setStatus("Preparing FFmpeg.wasm in your browser...");
    try {
      const result = await exportTimeline(visibleClips, timeline.tracks, (progress) => {
        setStatus(`Rendering locally: ${Math.round(progress * 100)}%`);
      });
      downloadFile(result.file);
      URL.revokeObjectURL(result.url);
      setStatus("Export complete — your MP4 download has started");
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Local export failed");
    }
  };

  const handleProcessClip = async (operation, options = {}) => {
    if (!selectedClip?.file) {
      setStatus("Select a locally imported clip first");
      return;
    }
    if (operation === "crop") {
      const { width, height, x, y } = options;
      if (
        ![width, height, x, y].every(Number.isFinite) ||
        [width, height, x, y].some((value) => value % 2 !== 0) ||
        width < 2 || height < 2 || x < 0 || y < 0 ||
        x + width > selectedClip.width || y + height > selectedClip.height
      ) {
        setStatus(`Crop must fit inside the ${selectedClip.width} × ${selectedClip.height}px source frame`);
        return;
      }
    }
    try {
      setStatus(`Loading FFmpeg.wasm for local ${operation}...`);
      const result = await processClip(selectedClip.file, operation, options, (progress) => {
        setStatus(`${operation[0].toUpperCase()}${operation.slice(1)} locally: ${Math.round(progress * 100)}%`);
      });
      if (operation === "audio-export") {
        downloadFile(result.file, "vidai-audio.mp3");
        URL.revokeObjectURL(result.url);
        setStatus("Audio export complete — your MP3 download has started");
        return;
      }
      const metadata = await new Promise((resolve, reject) => {
        const media = document.createElement(selectedClip.type === "audio" || operation === "extract-audio" ? "audio" : "video");
        media.preload = "metadata";
        media.onloadedmetadata = () => {
          resolve({ duration: media.duration, width: media.videoWidth, height: media.videoHeight });
          media.removeAttribute("src");
          media.load();
        };
        media.onerror = () => reject(new Error("Could not read the locally rendered media."));
        media.src = result.url;
      });
      const current = timeline.clips.find((clip) => clip.id === selectedClip.id);
      if (!current) { URL.revokeObjectURL(result.url); return; }
      if (operation === "extract-audio") {
        const audioTrack = timeline.tracks.find((track) => track.type === "audio");
        if (!audioTrack) { URL.revokeObjectURL(result.url); throw new Error("Add an audio track before extracting audio."); }
        timeline.updateClip(current.id, { muted: true });
        timeline.addClip({ ...current, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: "audio", trackId: audioTrack.id, file: result.file, sourceUrl: result.url,
          filename: result.file.name, title: result.file.name, sourceStart: 0, sourceMin: 0,
          sourceMax: metadata.duration, duration: Math.min(current.duration, metadata.duration / (current.speed || 1)),
          muted: false, volume: 1 });
        setStatus("Audio extracted to the timeline; video audio muted");
        return;
      }
      const patch = {
        file: result.file,
        sourceUrl: result.url,
        filename: result.file.name,
        title: result.file.name,
        width: metadata.width,
        height: metadata.height,
      };
      if (operation === "trim" || operation === "audio-effect") {
        patch.sourceStart = 0;
        patch.sourceMin = 0;
        patch.sourceMax = metadata.duration;
        patch.duration = metadata.duration / (current.speed || 1);
      } else if (operation === "rotate") {
        patch.sourceMax = metadata.duration;
        patch.rotation = 0;
      } else {
        patch.sourceMax = metadata.duration;
      }
      timeline.updateClip(current.id, patch);
      setStatus(`${operation[0].toUpperCase()}${operation.slice(1)} completed locally`);
    } catch (error) {
      console.error(error);
      setStatus(error.message || `Could not ${operation} this clip`);
    }
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

  const handleTogglePlay = useCallback(() => {
    if (player.isPlaying) {
      player.setIsPlaying(false);
      player.videoRef.current?.pause();
      return;
    }

    if (activeClip) {
      player.setIsPlaying(true);
      player.videoRef.current?.play().catch(() => {});
      return;
    }

    // If playhead is over an audio clip or within timeline, start playing
    if (player.currentTime < timelineDuration) {
      player.setIsPlaying(true);
      return;
    }

    // At the end of timeline, wrap to 0 and play
    player.seekTo(0);
    player.setIsPlaying(true);
  }, [player, activeClip, timelineDuration]);

  // Spacebar to play/pause anywhere in the editor
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        e.code === "Space" &&
        e.target.tagName !== "INPUT" &&
        e.target.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        handleTogglePlay();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleTogglePlay]);

  const handleStop = useCallback(() => {
    player.setIsPlaying(false);
    player.videoRef.current?.pause();
    player.seekTo(0);
  }, [player]);

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
        hasVideo={timeline.clips.some((c) => c.type !== "audio")}
        hasAudio={timeline.clips.some((c) => c.type === "audio")}
        onImport={() => fileInputRef.current?.click()}
        onImportAudio={() => audioInputRef.current?.click()}
        onExport={handleExport}
        gpuPreviewEnabled={gpuPreviewEnabled}
        onToggleGpuPreview={() => setGpuPreviewEnabled((enabled) => !enabled)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,audio/*"
        multiple
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
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
            gpuPreviewEnabled={gpuPreviewEnabled}
            onGpuStatus={setStatus}
            muted={activeClip?.muted || false}
          />
          <Controls
            isPlaying={player.isPlaying}
            currentTime={player.currentTime}
            duration={timelineDuration}
            onTogglePlay={handleTogglePlay}
            onStop={handleStop}
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
          onProcessClip={handleProcessClip}
          onUpdateClip={timeline.updateClip}
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
        onSetTrackVolume={timeline.setTrackVolume}
      />
    </div>
  );
}
