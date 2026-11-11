import { useEffect, useRef, useState, useCallback } from "react";
import Header from "./components/Header/Header";
import VideoPlayer from "./components/Player/VideoPlayer";
import Controls from "./components/Player/Controls";
import Inspector from "./components/Inspector/Inspector";
import Timeline from "./components/Timeline/Timeline";
import ClipMenu from "./components/Timeline/ClipMenu";
import MediaPanel from "./components/MediaPanel/MediaPanel";
import ExportDialog from "./components/ExportDialog";
import useVideoPlayer from "./hooks/useVideoPlayer";
import useTimeline from "./hooks/useTimeline";
import useAudioMixer from "./hooks/useAudioMixer";
import { isAudioFile, loadAudioFile } from "./utils/audioUtils";
import { isImageFile, loadImageFile } from "./utils/mediaUtils";
import { downloadFile, exportTimeline, processClip } from "./services/ffmpeg";
import { createProjectFile, readProjectFile } from "./services/projectFile";
import "./App.css";
import "./Studio.css";

const DEFAULT_TRANSFORM = {
  rotation: 0,
  flipH: false,
  flipV: false,
  aspectRatio: "16:9",
};

export default function App() {
  const fileInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const projectInputRef = useRef(null);
  const [status, setStatus] = useState("");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [clipMenu, setClipMenu] = useState(null);
  const [workspaceTab, setWorkspaceTab] = useState("media");
  const closeClipMenu = useCallback(() => setClipMenu(null), []);

  const player = useVideoPlayer();
  const { setVideoSource, setDuration, isPlaying, currentTime, setIsPlaying, seekTo } = player;
  const timeline = useTimeline({ videoDuration: player.duration });
  const { undo, redo } = timeline;

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
  const menuClip = timeline.clips.find((clip) => clip.id === clipMenu?.clipId);
  const visibleTrackIds = new Set(
    timeline.tracks.filter((track) => track.visible).map((track) => track.id)
  );
  const visibleClips = timeline.clips.filter((clip) =>
    visibleTrackIds.has(clip.trackId)
  );
  const activeClip = timeline.clips
    .filter(
      (clip) =>
        clip.type === "video" &&
        visibleTrackIds.has(clip.trackId) &&
        player.currentTime >= clip.start - 0.001 &&
        player.currentTime < clip.start + clip.duration
    )
    .sort((a, b) =>
      timeline.tracks.findIndex((track) => track.id === a.trackId) -
      timeline.tracks.findIndex((track) => track.id === b.trackId)
    )[0];
  const activeImageClips = timeline.clips
    .filter((clip) => clip.type === "image" && visibleTrackIds.has(clip.trackId) &&
      player.currentTime >= clip.start - 0.001 && player.currentTime < clip.start + clip.duration)
    .sort((a, b) => timeline.tracks.findIndex((track) => track.id === b.trackId) -
      timeline.tracks.findIndex((track) => track.id === a.trackId));

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
  }, [activeClip, setVideoSource]);

  useEffect(() => {
    if (isPlaying && timelineEnd > 0 && currentTime >= timelineEnd) {
      setIsPlaying(false);
      seekTo(timelineEnd);
    }
  }, [isPlaying, currentTime, setIsPlaying, seekTo, timelineEnd]);


    const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    const targetTrack = timeline.tracks.find((track) => track.id === timeline.selectedTrackId);
    if (!targetTrack || targetTrack.locked) {
      setStatus("Select an unlocked track before importing media");
      return;
    }
    let nextStart = player.currentTime;
    const occupied = timeline.clips.filter((clip) => clip.trackId === targetTrack.id)
      .map((clip) => ({ start: clip.start, end: clip.start + clip.duration }));

    const importedClips = [];

    for (const [index, file] of files.entries()) {
      try {
        const isAudio = isAudioFile(file);
        const isImage = isImageFile(file);
        let media;
        const trackId = targetTrack.id;

        if (isAudio) {
          media = await loadAudioFile(file);
        } else if (isImage) {
          media = await loadImageFile(file);
        } else {
          media = await player.loadVideo(file);
        }

        if (!media) continue;

        const safeDuration =
          Number.isFinite(media.duration) && media.duration > 0
            ? media.duration
            : 30;

        let clipStart = nextStart;
        if (isImage) {
          clipStart = player.currentTime;
        } else {
          for (const range of [...occupied].sort((a, b) => a.start - b.start)) {
            if (clipStart < range.end && clipStart + safeDuration > range.start) clipStart = range.end;
          }
        }

        const clip = {
          id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
          trackId,
          type: isAudio ? "audio" : isImage ? "image" : "video",
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
          overlayScale: 25,
          overlayX: 50,
          overlayY: 50,
          ...DEFAULT_TRANSFORM,
          start: clipStart,
          duration: safeDuration,
        };
        timeline.addClip(clip);
        importedClips.push(clip);

        if (!isImage) {
          nextStart = clipStart + safeDuration;
          occupied.push({ start: clipStart, end: nextStart });
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
        `Added ${importedClips.length} item${importedClips.length === 1 ? "" : "s"} to ${targetTrack.name}`
      );
    }
  };

  const handleExport = () => {
    setExportProgress(0);
    setExportDialogOpen(true);
  };

  const handleRunExport = async ({ filename, resolution }) => {
    const baseName = filename.trim()
      .replace(/\.mp4$/i, "")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/[. ]+$/g, "") || "vidai-export";
    const outputName = `${baseName}.mp4`;
    let destinationHandle;
    if (typeof window.showSaveFilePicker === "function") {
      try {
        destinationHandle = await window.showSaveFilePicker({
          suggestedName: outputName,
          types: [{ description: "MP4 video", accept: { "video/mp4": [".mp4"] } }],
        });
      } catch (error) {
        if (error.name === "AbortError") return;
        setStatus(error.message || "Could not choose an export location");
        return;
      }
    }

    setIsExporting(true);
    setExportProgress(0);
    setStatus("Preparing FFmpeg.wasm in your browser...");
    let resultUrl;
    try {
      const result = await exportTimeline(visibleClips, timeline.tracks, (progress) => {
        setExportProgress(progress);
        setStatus(`Rendering locally: ${Math.round(progress * 100)}%`);
      }, { resolution });
      resultUrl = result.url;
      if (destinationHandle) {
        const writable = await destinationHandle.createWritable();
        await writable.write(result.file);
        await writable.close();
      } else {
        downloadFile(result.file, outputName);
      }
      URL.revokeObjectURL(result.url);
      setStatus(`Export complete — saved ${destinationHandle?.name || outputName}`);
      setExportDialogOpen(false);
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Local export failed");
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveProject = async () => {
    setStatus("Packaging project and local media...");
    try {
      const file = await createProjectFile({
        clips: timeline.clips,
        tracks: timeline.tracks,
        markers: timeline.markers,
      });
      downloadFile(file);
      setStatus("Project saved as vidai-project.vidai");
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Could not save project");
    }
  };

  const handleLoadProject = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setStatus("Loading project and local media...");
    try {
      const project = await readProjectFile(file);
      timeline.replaceProject(project);
      player.setIsPlaying(false);
      const firstVideo = project.clips.filter((clip) => clip.type === "video").sort((a, b) => a.start - b.start)[0];
      player.setCurrentTime(firstVideo?.start || 0);
      setStatus(`Loaded project: ${file.name}`);
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Could not load project");
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
        const audioTrack = timeline.tracks.find((track) => !track.locked && track.id !== current.trackId);
        if (!audioTrack) { URL.revokeObjectURL(result.url); throw new Error("Add or unlock another track to extract audio."); }
        timeline.startHistoryGroup();
        timeline.updateClip(current.id, { muted: true });
        timeline.addClip({ ...current, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: "audio", trackId: audioTrack.id, file: result.file, sourceUrl: result.url,
          filename: result.file.name, title: result.file.name, sourceStart: 0, sourceMin: 0,
          sourceMax: metadata.duration, duration: Math.min(current.duration, metadata.duration / (current.speed || 1)),
          muted: false, volume: 1 });
        timeline.endHistoryGroup();
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

  const handleClipMenu = (clipId, x, y) => {
    timeline.selectClip(clipId);
    setClipMenu({ clipId, x, y });
  };

  const handleMenuSpeed = (speed) => {
    if (!menuClip || speed === (menuClip.speed || 1)) return;
    const sourceLength = menuClip.duration * (menuClip.speed || 1);
    timeline.updateClip(menuClip.id, { speed, duration: sourceLength / speed });
    player.seekTo(menuClip.start, menuClip.start, menuClip.sourceStart || 0, speed);
  };

  useEffect(() => {
    if (workspaceTab !== "edit" || clipMenu) return undefined;
    const onKeyDown = (event) => { if (event.key === "Escape") setWorkspaceTab("media"); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [workspaceTab, clipMenu]);

  const handleMoveClip = (clipId, desiredStart) => {
    const clip = timeline.clips.find((item) => item.id === clipId);
    if (!clip) return;
    const start = timeline.snapTime(desiredStart, clipId);
    timeline.updateClip(clipId, { start });
    if (start + clip.duration >= player.duration) {
      player.setDuration(start + clip.duration + 1);
    }
  };

  const handleSeek = (time) => {
    if (activeClip && time >= activeClip.start && time < activeClip.start + activeClip.duration) {
      player.seekTo(time, activeClip.start, activeClip.sourceStart || 0, activeClip.speed || 1);
    } else {
      player.seekTo(time);
    }
  };

  const handleTogglePlay = useCallback(() => {
    if (player.isPlaying) {
      player.setIsPlaying(false);
      player.videoRef.current?.pause();
      return;
    }

    if (!timelineEnd) return;
    if (player.currentTime >= timelineEnd - 0.001) player.seekTo(0);
    player.setIsPlaying(true);
    player.videoRef.current?.play().catch(() => {});
  }, [player, timelineEnd]);

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

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (key === "y" && !event.shiftKey) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  const handleStop = useCallback(() => {
    player.setIsPlaying(false);
    player.videoRef.current?.pause();
    player.seekTo(0);
  }, [player]);

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
        clipCount={timeline.clips.length}
        hasVideo={timeline.clips.some((c) => c.type !== "audio")}
        hasAudio={timeline.clips.some((c) => c.type === "audio")}
        onImport={() => fileInputRef.current?.click()}
        onImportAudio={() => audioInputRef.current?.click()}
        onSaveProject={handleSaveProject}
        onLoadProject={() => projectInputRef.current?.click()}
        onExport={handleExport}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,audio/*,image/*"
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

      <input
        ref={projectInputRef}
        type="file"
        accept=".vidai,application/json"
        style={{ display: "none" }}
        onChange={handleLoadProject}
      />

      <div className="studio-body">
        <aside className="workspace-panel" aria-label="Workspace">
          <div className="workspace-tabs" role="tablist" aria-label="Workspace panels">
            <button type="button" role="tab" id="workspace-media-tab" aria-selected={workspaceTab === "media"} aria-controls="workspace-media" onClick={() => setWorkspaceTab("media")}>Media</button>
            <button type="button" role="tab" id="workspace-edit-tab" aria-selected={workspaceTab === "edit"} aria-controls="workspace-edit" onClick={() => setWorkspaceTab("edit")}>Edit</button>
          </div>
          <div className="workspace-media" role="tabpanel" id="workspace-media" aria-labelledby="workspace-media-tab" hidden={workspaceTab !== "media"}>
            <MediaPanel clips={timeline.clips} selectedClipId={timeline.selectedClipId}
              onImport={() => fileInputRef.current?.click()} onSelectClip={handleSelectClip} />
          </div>
          <div className="workspace-edit" role="tabpanel" id="workspace-edit" aria-labelledby="workspace-edit-tab" hidden={workspaceTab !== "edit"}>
            {selectedClip ? (
              <Inspector
                videoFile={selectedClip.file}
                selectedClip={selectedClip}
                selectedTrack={timeline.tracks.find((track) => track.id === timeline.selectedTrackId)}
                transform={selectedTransform}
                onTransformChange={(next) => timeline.updateClip(selectedClip.id, next)}
                onProcessClip={handleProcessClip}
                onUpdateClip={timeline.updateClip}
                onBeginEdit={timeline.beginHistoryGroup}
                onSeekClip={(...args) => player.seekTo(...args)}
              />
            ) : <div className="workspace-edit-empty"><strong>Select a clip to edit</strong><p>Click a video or audio clip on the timeline to see its tools here.</p></div>}
          </div>
        </aside>
        <div className="studio-main">
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
            zoom={activeClip?.zoom ?? 1}
            positionX={activeClip?.positionX ?? 50}
            positionY={activeClip?.positionY ?? 50}
            imageOverlays={activeImageClips}
            hasClips={timeline.clips.length > 0}
            onTogglePlay={handleTogglePlay}
            onImportClick={() => fileInputRef.current?.click()}
            gpuPreviewEnabled={true}
            onGpuStatus={setStatus}
            onUpdateClip={timeline.updateClip}
            onSelectClip={timeline.selectClip}
            onBeginCanvasEdit={timeline.beginHistoryGroup}
            onEndCanvasEdit={timeline.endHistoryGroup}
            muted={activeClip?.muted || false}
            trackMuted={timeline.tracks.find((track) => track.id === activeClip?.trackId)?.muted || false}
            trackVolume={timeline.tracks.find((track) => track.id === activeClip?.trackId)?.volume ?? 1}
          />
          <Controls
            isPlaying={player.isPlaying}
            currentTime={player.currentTime}
            duration={timelineDuration}
            onTogglePlay={handleTogglePlay}
            onStop={handleStop}
            onSeek={handleSeek}
            zoom={activeClip?.zoom ?? 1}
            canZoom={activeClip?.type !== "audio" && Boolean(activeClip)}
            onZoomChange={(zoom) => activeClip && timeline.updateClip(activeClip.id, { zoom })}
            onZoomFit={() => activeClip && timeline.updateClip(activeClip.id, { zoom: 1, positionX: 50, positionY: 50 })}
            onBeginZoomEdit={timeline.beginHistoryGroup}
            onEndZoomEdit={timeline.endHistoryGroup}
          />
        </div>

      </div>

      <Timeline
        tracks={timeline.tracks}
        clips={timeline.clips}
        markers={timeline.markers}
        selectedClipId={timeline.selectedClipId}
        selectedTrackId={timeline.selectedTrackId}
        isSnapping={timeline.isSnapping}
        currentTime={player.currentTime}
        duration={timelineDuration}
        onSeek={handleSeek}
        onSetScrubbing={player.setScrubbing}
        onSnapTime={timeline.snapTime}
        onSelectClip={handleSelectClip}
        onClipMenu={handleClipMenu}
        onSelectTrack={timeline.selectTrack}
        onMoveClip={handleMoveClip}
        onMoveClipTrack={timeline.moveClipToTrack}
        onTrimClip={timeline.updateClip}
        onBeginEdit={timeline.beginHistoryGroup}
        onUndo={timeline.undo}
        onRedo={timeline.redo}
        canUndo={timeline.canUndo}
        canRedo={timeline.canRedo}
        onAddTrack={timeline.addTrack}
        onToggleSnap={() => timeline.setIsSnapping(!timeline.isSnapping)}
        onSplitClip={handleSplitClip}
        onDeleteClip={handleDeleteClip}
        onAddMarker={() => timeline.addMarker(player.currentTime)}
        onToggleTrackLock={timeline.toggleTrackLock}
        onToggleTrackVisible={timeline.toggleTrackVisible}
        onToggleTrackMute={timeline.toggleTrackMute}
        onSetTrackVolume={timeline.setTrackVolume}
      />
        </div>
      </div>
      {clipMenu && menuClip && (
        <ClipMenu clip={menuClip} position={clipMenu}
          locked={timeline.tracks.find((track) => track.id === menuClip.trackId)?.locked}
          onClose={closeClipMenu}
          onSpeed={handleMenuSpeed}
          onMute={() => timeline.updateClip(menuClip.id, { muted: !menuClip.muted })}
          onExtract={() => {
            closeClipMenu();
            handleProcessClip("extract-audio", { start: menuClip.sourceStart || 0, duration: menuClip.duration * (menuClip.speed || 1) });
          }}
          onMore={() => { closeClipMenu(); setWorkspaceTab("edit"); }} />
      )}
      <ExportDialog
        open={exportDialogOpen}
        canExport={visibleClips.some((clip) => clip.type === "video")}
        exporting={isExporting}
        progress={exportProgress}
        onClose={() => setExportDialogOpen(false)}
        onExport={handleRunExport}
      />
    </div>
  );
}
