import React, { useState, useEffect, useRef } from "react";
import "./Captions.css";

const API_BASE = "http://localhost:8000";

const STAGE_LABELS = {
  uploaded: "Video uploaded, starting analysis...",
  probing: "Inspecting video stream with FFprobe...",
  extracting_audio: "Extracting 16 kHz mono audio track...",
  transcribing: "Transcribing speech with faster-whisper on CPU...",
  building_captions: "Formatting word timestamps into captions...",
  done: "Captions generated successfully!",
  failed: "Processing failed"
};

export default function CaptionsPanel({
  selectedClip,
  currentTime = 0,
  onSeek,
  captions = [],
  setCaptions,
  activeVideoId,
  setActiveVideoId
}) {
  const [uploadProgress, setUploadProgress] = useState(null); // 0-100 or null
  const [pipelineStatus, setPipelineStatus] = useState(null); // status object
  const [isUploading, setIsUploading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef(null);
  const pollTimerRef = useRef(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  // Poll status endpoint every ~1.5s
  const startPollingStatus = (videoId) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    pollTimerRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${API_BASE}/videos/${videoId}/status`);
        if (!resp.ok) return;

        const data = await resp.json();
        setPipelineStatus(data);

        if (data.state === "done") {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          fetchCaptions(videoId);
        } else if (data.state === "failed") {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setErrorMessage(data.error || data.message || "Pipeline processing failed");
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 1500);
  };

  const fetchCaptions = async (videoId) => {
    try {
      const resp = await fetch(`${API_BASE}/videos/${videoId}/captions`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (data && data.captions) {
        setCaptions(data.captions);
      }
    } catch (err) {
      console.error("Failed to fetch captions:", err);
    }
  };

  // Upload video via XMLHttpRequest to track upload progress bar accurately
  const handleUploadFile = (file) => {
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);
    setErrorMessage("");
    setPipelineStatus({ state: "uploaded", progress: 0, message: "Uploading video..." });

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/videos`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      setIsUploading(false);
      setUploadProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          const newVideoId = res.video_id;
          setActiveVideoId(newVideoId);
          startPollingStatus(newVideoId);
        } catch (e) {
          setErrorMessage("Failed to parse server upload response");
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          setErrorMessage(err.detail || "Upload failed");
        } catch {
          setErrorMessage(`Upload failed with status ${xhr.status}`);
        }
      }
    };

    xhr.onerror = () => {
      setIsUploading(false);
      setUploadProgress(null);
      setErrorMessage("Network error during video upload");
    };

    xhr.send(formData);
  };

  const handleRetry = async () => {
    if (!activeVideoId) {
      if (selectedClip?.file) {
        handleUploadFile(selectedClip.file);
      }
      return;
    }

    setErrorMessage("");
    setPipelineStatus({ state: "uploaded", progress: 0, message: "Retrying caption pipeline..." });

    try {
      const resp = await fetch(`${API_BASE}/videos/${activeVideoId}/retry`, {
        method: "POST"
      });
      if (resp.ok) {
        startPollingStatus(activeVideoId);
      } else {
        const err = await resp.json().catch(() => ({}));
        if (selectedClip?.file) {
          handleUploadFile(selectedClip.file);
        } else {
          setErrorMessage(err.detail || "Server retry failed. Please re-upload.");
        }
      }
    } catch {
      if (selectedClip?.file) {
        handleUploadFile(selectedClip.file);
      } else {
        setErrorMessage("Network error while retrying. Please re-upload.");
      }
    }
  };

  const handleStartEdit = (cap, e) => {
    e.stopPropagation();
    setEditingId(cap.id);
    setEditText(cap.text);
  };

  const handleCancelEdit = (e) => {
    e.stopPropagation();
    setEditingId(null);
    setEditText("");
  };

  const handleSaveEdit = async (capId, e) => {
    e.stopPropagation();
    if (!activeVideoId || !captions.length) return;

    setIsSavingEdit(true);
    const updatedCaptions = captions.map((c) =>
      c.id === capId ? { ...c, text: editText.trim() } : c
    );

    try {
      const resp = await fetch(`${API_BASE}/videos/${activeVideoId}/captions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captions: updatedCaptions })
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || "Failed to update captions");
      }

      const data = await resp.json();
      setCaptions(data.captions);
      setEditingId(null);
      setEditText("");
    } catch (err) {
      console.error(err);
      alert(`Error saving caption: ${err.message}`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const formatSeconds = (sec) => {
    const s = Math.max(0, sec);
    const mins = Math.floor(s / 60);
    const remSec = (s % 60).toFixed(1);
    return `${mins}:${remSec.padStart(4, "0")}`;
  };

  return (
    <div className="captions-panel">
      <div className="captions-header">
        <h3>
          <span>💬</span> Offline AI Captions
          <span className="captions-badge">faster-whisper CPU</span>
        </h3>
        <p>100% offline, zero-API speech-to-text with word alignment</p>
      </div>

      {/* Upload & Trigger Card */}
      <div className="captions-card">
        <h4>Generate Captions</h4>
        <p>
          {selectedClip?.file
            ? `Clip selected: ${selectedClip.name || selectedClip.title}`
            : "Upload any MP4, MOV, MKV, or WebM video to analyze and generate timestamped captions."}
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files?.[0]) handleUploadFile(e.target.files[0]);
          }}
        />

        {selectedClip?.file ? (
          <button
            type="button"
            className="captions-btn-primary"
            disabled={isUploading}
            onClick={() => handleUploadFile(selectedClip.file)}
          >
            {isUploading ? "Uploading..." : "⚡ Generate Captions for This Clip"}
          </button>
        ) : (
          <button
            type="button"
            className="captions-btn-primary"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? "Uploading..." : "📁 Upload Video for Captions"}
          </button>
        )}

        {/* Upload Progress Bar */}
        {uploadProgress !== null && (
          <div className="captions-progress-container">
            <div className="captions-progress-meta">
              <span>Uploading to server...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="captions-progress-bar">
              <div
                className="captions-progress-fill"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Pipeline Processing Status */}
        {pipelineStatus && pipelineStatus.state !== "done" && pipelineStatus.state !== "failed" && (
          <div className="captions-progress-container">
            <div className="captions-progress-meta">
              <span>{pipelineStatus.message || STAGE_LABELS[pipelineStatus.state] || pipelineStatus.state}</span>
              <span>{Math.round(pipelineStatus.progress || 0)}%</span>
            </div>
            <div className="captions-progress-bar">
              <div
                className="captions-progress-fill"
                style={{ width: `${pipelineStatus.progress || 10}%` }}
              />
            </div>
          </div>
        )}

        {/* Error message with retry */}
        {(errorMessage || (pipelineStatus && pipelineStatus.state === "failed")) && (
          <div className="captions-error-card">
            <div><strong>Error:</strong> {errorMessage || pipelineStatus?.error || "Processing failed"}</div>
            <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
              {activeVideoId && (
                <button
                  type="button"
                  className="captions-retry-btn"
                  onClick={handleRetry}
                >
                  🔄 Retry Processing
                </button>
              )}
              {selectedClip?.file && (
                <button
                  type="button"
                  className="captions-retry-btn"
                  style={{ background: "#4f46e5" }}
                  onClick={() => handleUploadFile(selectedClip.file)}
                >
                  ⚡ Re-upload Clip
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Downloads Bar when captions exist */}
      {activeVideoId && captions && captions.length > 0 && (
        <div className="captions-actions-bar">
          <a
            href={`${API_BASE}/videos/${activeVideoId}/captions.srt`}
            download="captions.srt"
            className="captions-btn-download"
          >
            ⬇️ Download SRT
          </a>
          <a
            href={`${API_BASE}/videos/${activeVideoId}/captions.vtt`}
            download="captions.vtt"
            className="captions-btn-download"
          >
            ⬇️ Download VTT
          </a>
        </div>
      )}

      {/* Interactive Captions List */}
      {captions && captions.length > 0 && (
        <div className="captions-list">
          {captions.map((cap) => {
            const isActive = currentTime >= cap.start && currentTime <= cap.end;
            const isEditing = editingId === cap.id;

            return (
              <div
                key={cap.id}
                className={`caption-item ${isActive ? "active" : ""}`}
                onClick={() => onSeek && onSeek(cap.start)}
              >
                <div className="caption-item-header">
                  <span className="caption-time-badge">
                    {formatSeconds(cap.start)} ➔ {formatSeconds(cap.end)}
                  </span>
                  {!isEditing && (
                    <button
                      type="button"
                      className="caption-btn-edit"
                      title="Edit this caption line"
                      onClick={(e) => handleStartEdit(cap, e)}
                    >
                      ✏️ Edit
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <div className="caption-edit-mode" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      className="caption-edit-textarea"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      autoFocus
                    />
                    <div className="caption-edit-actions">
                      <button
                        type="button"
                        className="caption-btn-cancel"
                        onClick={handleCancelEdit}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="caption-btn-save"
                        disabled={isSavingEdit || !editText.trim()}
                        onClick={(e) => handleSaveEdit(cap.id, e)}
                      >
                        {isSavingEdit ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="caption-text-preview">{cap.text}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
