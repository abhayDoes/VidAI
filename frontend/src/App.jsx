import { useState, useRef, useEffect } from "react";
import "./App.css";

const PIXELS_PER_SECOND = 20;

// Crisp, professional SVG icons (clean NLE software style - zero emojis)
const Icons = {
  Play: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  Pause: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  ),
  AddTrack: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  Undo: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  ),
  Redo: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  ),
  Magnet: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 15-3-3 6.5-6.5a4.95 4.95 0 0 1 7 7L10 19l-4-4Z" />
      <path d="m9 9 4 4" />
    </svg>
  ),
  Razor: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  ),
  Marker: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Trash: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  PrevClip: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="19 20 9 12 19 4 19 20" />
      <line x1="5" y1="19" x2="5" y2="5" />
    </svg>
  ),
  NextClip: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 4 15 12 5 20 5 4" />
      <line x1="19" y1="5" x2="19" y2="19" />
    </svg>
  ),
  Lock: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  Unlock: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  ),
  Eye: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  EyeOff: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ),
};

export default function App() {
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const timelineTracksRef = useRef(null);

  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(120);

  const [tracks, setTracks] = useState([
    { id: 3, name: "Track 3", locked: false, visible: true },
    { id: 2, name: "Track 2", locked: false, visible: true },
    { id: 1, name: "Track 1", locked: false, visible: true },
  ]);

  const [clips, setClips] = useState([]);
  const [selectedClipId, setSelectedClipId] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [isSnapping, setIsSnapping] = useState(true);
  const [status, setStatus] = useState("");
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);

  const formatTimecode = (secs) => {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = Math.floor(secs % 60);
    const frames = Math.floor((secs % 1) * 30);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(frames)}`;
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);

    const tempVideo = document.createElement("video");
    tempVideo.src = url;
    tempVideo.onloadedmetadata = () => {
      const vidDuration = tempVideo.duration || 60;
      setDuration(Math.max(vidDuration + 20, 120));

      const newClip = {
        id: Date.now(),
        trackId: 1,
        title: file.name,
        start: 0,
        duration: vidDuration,
      };
      setClips([newClip]);
      setSelectedClipId(newClip.id);
    };
  };

  const handleTimeUpdate = () => {
    if (videoRef.current && !isDraggingPlayhead) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const seekTo = (seconds) => {
    const clamped = Math.max(0, Math.min(seconds, duration));
    setCurrentTime(clamped);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
  };

  const handleTimelineMouseDown = (e) => {
    if (!timelineTracksRef.current) return;
    const rect = timelineTracksRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickedTime = Math.max(0, clickX / PIXELS_PER_SECOND);
    seekTo(clickedTime);
    setIsDraggingPlayhead(true);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingPlayhead || !timelineTracksRef.current) return;
      const rect = timelineTracksRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const scrubTime = Math.max(0, Math.min(clickX / PIXELS_PER_SECOND, duration));
      seekTo(scrubTime);
    };

    const handleMouseUp = () => {
      if (isDraggingPlayhead) {
        setIsDraggingPlayhead(false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingPlayhead, duration]);

  const handleAddTrack = () => {
    const nextId = tracks.length ? Math.max(...tracks.map((t) => t.id)) + 1 : 1;
    const newTrack = {
      id: nextId,
      name: `Track ${nextId}`,
      locked: false,
      visible: true,
    };
    setTracks([newTrack, ...tracks]);
  };

  const handleSplitClip = () => {
    if (!selectedClipId) return;

    const clipIndex = clips.findIndex((c) => c.id === selectedClipId);
    if (clipIndex === -1) return;

    const targetClip = clips[clipIndex];
    const clipEnd = targetClip.start + targetClip.duration;

    if (currentTime <= targetClip.start || currentTime >= clipEnd) {
      return;
    }

    const firstDuration = currentTime - targetClip.start;
    const secondDuration = targetClip.duration - firstDuration;

    const clip1 = { ...targetClip, duration: firstDuration };
    const clip2 = {
      id: Date.now(),
      trackId: targetClip.trackId,
      title: `${targetClip.title} (Part 2)`,
      start: currentTime,
      duration: secondDuration,
    };

    const updatedClips = [...clips];
    updatedClips.splice(clipIndex, 1, clip1, clip2);
    setClips(updatedClips);
    setSelectedClipId(clip2.id);
  };

  const handleAddMarker = () => {
    const newMarker = {
      id: Date.now(),
      time: currentTime,
      label: `Marker ${markers.length + 1}`,
    };
    setMarkers([...markers, newMarker]);
  };

  const handleDeleteClip = () => {
    if (!selectedClipId) return;
    setClips(clips.filter((c) => c.id !== selectedClipId));
    setSelectedClipId(null);
  };

  const handleUploadToBackend = async () => {
    if (!videoFile) {
      fileInputRef.current?.click();
      return;
    }

    setStatus("Uploading to server...");
    const formData = new FormData();
    formData.append("video", videoFile);

    const backendUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";

    try {
      const response = await fetch(`${backendUrl}/videos_upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");
      const data = await response.json();
      setStatus(`Saved: ${data.filename}`);
    } catch (err) {
      console.error(err);
      setStatus("Server upload error");
    }
  };

  const rulerInterval = 20;
  const totalMarkers = Math.ceil(duration / rulerInterval);
  const rulerTicks = Array.from({ length: totalMarkers + 1 }, (_, i) => i * rulerInterval);

  return (
    <div className="editor-container">
      {/* Top Application Bar */}
      <header className="editor-header">
        <div className="brand">
          <div className="brand-dot" />
          <span>VidAI Studio</span>
        </div>

        <div className="header-actions">
          {status && <span className="status-text">{status}</span>}
          <button className="nav-btn" onClick={() => fileInputRef.current?.click()}>
            {videoFile ? "Replace Video" : "Import Video"}
          </button>
          <button className="nav-btn primary" onClick={handleUploadToBackend}>
            Export to Server
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </div>
      </header>

      {/* Video Monitor */}
      <main className="preview-workspace">
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            className="video-screen"
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => setIsPlaying(false)}
            onClick={togglePlay}
          />
        ) : (
          <div className="empty-preview" onClick={() => fileInputRef.current?.click()}>
            <span className="import-prompt">Click to import video media</span>
          </div>
        )}
      </main>

      {/* Playback Control Bar */}
      <div className="playback-bar">
        <button className="control-btn" onClick={() => seekTo(0)} title="Jump to start">
          <Icons.PrevClip />
        </button>
        <button className="control-btn" onClick={() => seekTo(currentTime - 5)} title="Back 5s">
          -5s
        </button>
        <button className="play-btn" onClick={togglePlay} title={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? <Icons.Pause /> : <Icons.Play />}
        </button>
        <button className="control-btn" onClick={() => seekTo(currentTime + 5)} title="Forward 5s">
          +5s
        </button>
        <button className="control-btn" onClick={() => seekTo(duration)} title="Jump to end">
          <Icons.NextClip />
        </button>
      </div>

      {/* TIMELINE SECTION (Matching provided reference) */}
      <section className="timeline-section">
        {/* Top Timeline Toolbar */}
        <div className="timeline-toolbar">
          <div className="toolbar-left">
            <button className="toolbar-btn" onClick={handleAddTrack}>
              <Icons.AddTrack />
              <span>Add Track</span>
            </button>
            <div className="toolbar-divider" />
            <button className="toolbar-icon-btn" title="Undo">
              <Icons.Undo />
            </button>
            <button className="toolbar-icon-btn" title="Redo">
              <Icons.Redo />
            </button>
            <div className="toolbar-divider" />
            <button
              className={`toolbar-icon-btn ${isSnapping ? "active" : ""}`}
              title="Toggle Snapping"
              onClick={() => setIsSnapping(!isSnapping)}
            >
              <Icons.Magnet />
            </button>
            <button className="toolbar-icon-btn" title="Razor Split Clip" onClick={handleSplitClip}>
              <Icons.Razor />
            </button>
            <button className="toolbar-icon-btn" title="Delete Clip" onClick={handleDeleteClip}>
              <Icons.Trash />
            </button>
            <div className="toolbar-divider" />
            <button className="toolbar-btn" onClick={handleAddMarker}>
              <Icons.Marker />
              <span>Add Marker</span>
            </button>
          </div>

          <div className="toolbar-right">
            <div className="minimap-bar">
              <div
                className="minimap-window"
                style={{
                  left: `${(currentTime / duration) * 100}%`,
                  width: "14px",
                }}
              />
            </div>
          </div>
        </div>

        {/* Timeline Tracks Area */}
        <div className="timeline-body">
          {/* Track Headers */}
          <div className="track-headers">
            <div className="timecode-header">
              {formatTimecode(currentTime)}
            </div>

            {tracks.map((track) => (
              <div key={track.id} className="track-header-item">
                <div className="track-header-top">
                  <span>{track.name}</span>
                  <span className="caret-icon">▾</span>
                </div>
                <div className="track-header-actions">
                  <span
                    className={`track-action-icon ${track.locked ? "active-alert" : ""}`}
                    onClick={() => {
                      setTracks(
                        tracks.map((t) =>
                          t.id === track.id ? { ...t, locked: !t.locked } : t
                        )
                      );
                    }}
                    title={track.locked ? "Unlock Track" : "Lock Track"}
                  >
                    {track.locked ? <Icons.Lock /> : <Icons.Unlock />}
                  </span>
                  <span
                    className="track-action-icon"
                    onClick={() => {
                      setTracks(
                        tracks.map((t) =>
                          t.id === track.id ? { ...t, visible: !t.visible } : t
                        )
                      );
                    }}
                    title={track.visible ? "Hide Track" : "Show Track"}
                  >
                    {track.visible ? <Icons.Eye /> : <Icons.EyeOff />}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Canvas Tracks + Ruler */}
          <div
            className="timeline-tracks-area"
            ref={timelineTracksRef}
            onMouseDown={handleTimelineMouseDown}
            style={{ width: `${Math.max(duration * PIXELS_PER_SECOND, 1200)}px` }}
          >
            {/* Playhead */}
            <div
              className="playhead-line"
              style={{ left: `${currentTime * PIXELS_PER_SECOND}px` }}
            >
              <div className="playhead-head" />
            </div>

            {/* Markers */}
            {markers.map((m) => (
              <div
                key={m.id}
                className="marker-pin"
                title={m.label}
                style={{ left: `${m.time * PIXELS_PER_SECOND}px` }}
                onClick={(e) => {
                  e.stopPropagation();
                  seekTo(m.time);
                }}
              />
            ))}

            {/* Time Ruler */}
            <div className="time-ruler">
              {rulerTicks.map((timeSec) => {
                const leftPx = timeSec * PIXELS_PER_SECOND;
                const min = Math.floor(timeSec / 60);
                const sec = timeSec % 60;
                const label = `${min}:${String(sec).padStart(2, "0")}`;

                return (
                  <div key={timeSec}>
                    <span className="ruler-marker" style={{ left: `${leftPx}px` }}>
                      {label}
                    </span>
                    <div className="ruler-tick major" style={{ left: `${leftPx}px` }} />
                    <div
                      className="ruler-tick"
                      style={{ left: `${leftPx + 10 * (PIXELS_PER_SECOND / 2)}px` }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Track Rows */}
            {tracks.map((track) => (
              <div key={track.id} className="track-lane">
                {clips
                  .filter((clip) => clip.trackId === track.id)
                  .map((clip) => {
                    const left = clip.start * PIXELS_PER_SECOND;
                    const width = clip.duration * PIXELS_PER_SECOND;
                    const isSelected = selectedClipId === clip.id;

                    return (
                      <div
                        key={clip.id}
                        className={`timeline-clip ${isSelected ? "selected" : ""}`}
                        style={{
                          left: `${left}px`,
                          width: `${width}px`,
                          opacity: track.visible ? 1 : 0.35,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedClipId(clip.id);
                        }}
                      >
                        <div className="clip-handle left" />
                        <span className="clip-title">{clip.title}</span>
                        <div className="clip-handle right" />
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
