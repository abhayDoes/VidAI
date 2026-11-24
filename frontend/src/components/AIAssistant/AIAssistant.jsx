import React, { useState, useEffect, useRef } from "react";
import "./AIAssistant.css";

const API_BASE = "http://localhost:8000";

export default function AIAssistant({
  selectedClip,
  onApplyToTimeline,
  captions = [],
  setCaptions = () => {},
  activeVideoId,
  setActiveVideoId = () => {}
}) {
  const [prompt, setPrompt] = useState("");
  const [videoRecord, setVideoRecord] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [activeJob, setActiveJob] = useState(null); // { type, progress, stage, status }
  const [previewOutput, setPreviewOutput] = useState(null);
  const [finalOutput, setFinalOutput] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSendingPrompt, setIsSendingPrompt] = useState(false);

  // Captions state
  const [captionProgress, setCaptionProgress] = useState(null);
  const [captionStage, setCaptionStage] = useState("");
  const [captionError, setCaptionError] = useState("");
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const captionPollRef = useRef(null);
  const captionFileRef = useRef(null);

  const wsRef = useRef(null);
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    return () => {
      if (captionPollRef.current) clearInterval(captionPollRef.current);
    };
  }, []);

  const handleGenerateCaptions = (file) => {
    const targetFile = file || selectedClip?.file;
    if (!targetFile) {
      captionFileRef.current?.click();
      return;
    }

    setIsGeneratingCaptions(true);
    setCaptionProgress(0);
    setCaptionStage("Uploading video...");
    setCaptionError("");

    const formData = new FormData();
    formData.append("file", targetFile);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/videos`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setCaptionProgress(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          const newId = res.video_id;
          setActiveVideoId(newId);
          startCaptionPolling(newId);
        } catch {
          setIsGeneratingCaptions(false);
          setCaptionError("Failed to parse server upload response");
        }
      } else {
        setIsGeneratingCaptions(false);
        try {
          const err = JSON.parse(xhr.responseText);
          setCaptionError(err.detail || "Upload failed");
        } catch {
          setCaptionError(`Upload failed with status ${xhr.status}`);
        }
      }
    };

    xhr.onerror = () => {
      setIsGeneratingCaptions(false);
      setCaptionError("Network error during video upload");
    };

    xhr.send(formData);
  };

  const startCaptionPolling = (videoId) => {
    if (captionPollRef.current) clearInterval(captionPollRef.current);

    captionPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/videos/${videoId}/status`);
        if (!res.ok) return;
        const data = await res.json();

        setCaptionProgress(Math.round(data.progress || 0));
        setCaptionStage(data.message || data.state);

        if (data.state === "done") {
          clearInterval(captionPollRef.current);
          captionPollRef.current = null;
          setIsGeneratingCaptions(false);
          fetchCaptions(videoId);
        } else if (data.state === "failed") {
          clearInterval(captionPollRef.current);
          captionPollRef.current = null;
          setIsGeneratingCaptions(false);
          setCaptionError(data.error || data.message || "Caption generation failed");
        }
      } catch (err) {
        console.error("Caption polling error:", err);
      }
    }, 1500);
  };

  const fetchCaptions = async (videoId) => {
    try {
      const res = await fetch(`${API_BASE}/videos/${videoId}/captions`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.captions) {
        setCaptions(data.captions);
      }
    } catch (e) {
      console.error("Failed to fetch captions:", e);
    }
  };

  // Setup WebSocket connection for live progress
  useEffect(() => {
    const wsUrl = `ws://localhost:8000/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "job_progress") {
          setActiveJob({
            jobId: data.job_id,
            jobType: data.job_type,
            status: data.status,
            progress: data.progress,
            stage: data.stage,
            result: data.result,
            error: data.error,
          });

          if (data.status === "completed" && data.result) {
            if (data.job_type === "preview") {
              setPreviewOutput(data.result);
            } else if (data.job_type === "render") {
              setFinalOutput(data.result);
            } else if (data.job_type === "analysis") {
              setAnalysis(data.result);
            }
          }
        }
      } catch (err) {
        console.error("WebSocket message parse error:", err);
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // When a video file is available, upload it to the backend to initialize analysis
  const handleUploadToBackend = async (file) => {
    if (!file) return;
    setIsUploading(true);
    setActiveJob({ status: "running", progress: 20, stage: "Uploading video to backend..." });

    try {
      const formData = new FormData();
      formData.append("video", file);

      const resp = await fetch(`${API_BASE}/api/videos/upload`, {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) throw new Error("Upload failed");
      const data = await resp.json();
      setVideoRecord(data);
      setActiveJob(null);

      // Trigger automatic parallel analysis
      triggerAnalysis(data.video_id);
    } catch (err) {
      console.error(err);
      setActiveJob({ status: "failed", progress: 0, stage: "Upload failed", error: err.message });
    } finally {
      setIsUploading(false);
    }
  };

  const triggerAnalysis = async (videoId) => {
    try {
      setActiveJob({ status: "running", progress: 10, stage: "Starting parallel analysis..." });
      const resp = await fetch(`${API_BASE}/api/videos/${videoId}/analyze`, {
        method: "POST",
      });
      const data = await resp.json();
      if (data.cached && data.data) {
        setAnalysis(data.data);
        setActiveJob(null);
      } else if (data.job_id) {
        pollJob(data.job_id, "analysis");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const pollJob = (jobId, expectedType) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/jobs/${jobId}`);
        if (!res.ok) return;
        const job = await res.json();
        
        const rawRes = job.result;
        const parsedRes = typeof rawRes === "string" ? (() => { try { return JSON.parse(rawRes); } catch { return rawRes; } })() : rawRes;

        setActiveJob({
          jobId: job.id,
          jobType: job.job_type,
          status: job.status,
          progress: job.progress,
          stage: job.stage,
          result: parsedRes,
          error: job.error,
        });

        if (job.status === "completed") {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          if (expectedType === "preview" && parsedRes) {
            setPreviewOutput(parsedRes);
          } else if (expectedType === "render" && parsedRes) {
            setFinalOutput(parsedRes);
          } else if (expectedType === "analysis") {
            if (parsedRes) setAnalysis(parsedRes);
            setActiveJob(null);
          }
        } else if (job.status === "failed") {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      } catch (e) {
        console.error("Job poll error:", e);
      }
    }, 1200);
  };

  const handleSendPrompt = async (promptText) => {
    const text = promptText || prompt;
    if (!text.trim() || !videoRecord || isSendingPrompt) return;

    setIsSendingPrompt(true);
    const userMsg = { role: "user", content: text };
    setChatHistory((prev) => [...prev, userMsg]);
    setPrompt("");
    setPreviewOutput(null);
    setFinalOutput(null);

    setActiveJob({ status: "running", progress: 15, stage: "LangGraph Agent planning Path A execution..." });

    try {
      const resp = await fetch(`${API_BASE}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: videoRecord.project_id,
          video_id: videoRecord.video_id,
          prompt: text,
        }),
      });

      if (!resp.ok) throw new Error("Agent request failed");
      const data = await resp.json();

      setChatHistory((prev) => [
        ...prev,
        {
          role: "agent",
          route: data.route,
          content: data.explanation,
          plan: data.plan,
          errors: data.validation_errors,
        },
      ]);

      if (data.preview_job_id) {
        pollJob(data.preview_job_id, "preview");
      } else {
        setActiveJob(null);
      }
    } catch (err) {
      console.error(err);
      setChatHistory((prev) => [
        ...prev,
        { role: "agent", content: `Error: ${err.message}` },
      ]);
      setActiveJob(null);
    } finally {
      setIsSendingPrompt(false);
    }
  };

  const handleApproveRender = async () => {
    if (!videoRecord) return;
    const lastAgentMsg = [...chatHistory].reverse().find((m) => m.role === "agent" && m.plan?.length);
    if (!lastAgentMsg) return;

    setActiveJob({ status: "running", progress: 5, stage: "Queuing full-quality render..." });

    try {
      const resp = await fetch(`${API_BASE}/api/renders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: videoRecord.project_id,
          video_id: videoRecord.video_id,
          plan: lastAgentMsg.plan,
        }),
      });
      if (!resp.ok) throw new Error("Render trigger failed");
      const data = await resp.json();
      if (data.job_id) {
        pollJob(data.job_id, "render");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="ai-assistant">
      <div className="ai-header">
        <h3>
          <span>✨</span> VidAI Assistant
          <span className="ai-badge">Path A Fast Engine</span>
        </h3>
        <p>Natural language video editing powered by LangGraph & FFmpeg</p>
      </div>

      {/* Video Status Card */}
      {!videoRecord ? (
        <div className="ai-video-card">
          <h4>No Video Synced with Backend</h4>
          <p style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
            {selectedClip?.file
              ? `Selected clip: ${selectedClip.name}`
              : "Select a clip from the timeline or upload one to edit with AI."}
          </p>
          {selectedClip?.file && (
            <button
              className="ai-btn-approve"
              style={{ marginTop: 8 }}
              disabled={isUploading}
              onClick={() => handleUploadToBackend(selectedClip.file)}
            >
              {isUploading ? "Uploading..." : "Sync & Analyze This Video"}
            </button>
          )}
        </div>
      ) : (
        <div className="ai-video-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>{videoRecord.filename}</strong>
            <span className="ai-badge" style={{ backgroundColor: "#065f46", color: "#34d399" }}>
              Ready for AI Edits
            </span>
          </div>
          <div className="ai-video-meta">
            <span className="ai-meta-tag">{videoRecord.duration?.toFixed(1)}s</span>
            <span className="ai-meta-tag">
              {videoRecord.width}x{videoRecord.height}
            </span>
            <span className="ai-meta-tag">{videoRecord.fps} fps</span>
          </div>

          {analysis && (
            <div className="ai-analysis-box">
              <div><strong>Scenes Detected:</strong> {analysis.scenes?.length || 0}</div>
              <div><strong>Transcript:</strong> {analysis.transcript?.length || 0} lines</div>
              {analysis.visual_tags?.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <strong>Tags:</strong>{" "}
                  {analysis.visual_tags.flatMap((t) => t.tags).slice(0, 5).join(", ")}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Active Job Progress */}
      {activeJob && activeJob.status === "running" && (
        <div className="ai-video-card" style={{ borderColor: "#6366f1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
            <span>{activeJob.stage}</span>
            <span>{Math.round(activeJob.progress)}%</span>
          </div>
          <div className="ai-progress-bar">
            <div className="ai-progress-fill" style={{ width: `${activeJob.progress}%` }}></div>
          </div>
        </div>
      )}

      {/* Offline AI Captions Card */}
      <div className="ai-caption-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: "0.85rem", color: "#e2e8f0", display: "flex", alignItems: "center", gap: "6px" }}>
            <span>💬</span> Offline AI Captions
          </strong>
          <span className="ai-badge" style={{ backgroundColor: "#1e1b4b", color: "#a5b4fc" }}>
            faster-whisper CPU
          </span>
        </div>

        <input
          ref={captionFileRef}
          type="file"
          accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files?.[0]) handleGenerateCaptions(e.target.files[0]);
          }}
        />

        {isGeneratingCaptions ? (
          <div style={{ marginTop: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#94a3b8", marginBottom: 4 }}>
              <span>{captionStage}</span>
              <span>{captionProgress || 0}%</span>
            </div>
            <div className="ai-progress-bar">
              <div className="ai-progress-fill" style={{ width: `${captionProgress || 10}%` }}></div>
            </div>
          </div>
        ) : captions && captions.length > 0 ? (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: "0.78rem", color: "#34d399", fontWeight: 500 }}>
              ✅ Captions Active ({captions.length} lines)
            </div>
            <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: 2 }}>
              Synchronized live on preview player
            </div>

            <div className="ai-caption-btn-group">
              {activeVideoId && (
                <>
                  <a
                    href={`${API_BASE}/videos/${activeVideoId}/captions.srt`}
                    download="captions.srt"
                    className="ai-caption-btn"
                  >
                    ⬇️ Download SRT
                  </a>
                  <a
                    href={`${API_BASE}/videos/${activeVideoId}/captions.vtt`}
                    download="captions.vtt"
                    className="ai-caption-btn"
                  >
                    ⬇️ Download VTT
                  </a>
                  <a
                    href={`${API_BASE}/videos/${activeVideoId}/export-burned`}
                    download="video_with_captions.mp4"
                    className="ai-caption-btn burned"
                  >
                    🎬 Download Video with Captions (MP4)
                  </a>
                </>
              )}
              {selectedClip?.file && (
                <button
                  type="button"
                  className="ai-caption-btn"
                  onClick={() => handleGenerateCaptions(selectedClip.file)}
                >
                  🔄 Regenerate
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 4 }}>
            <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: "0 0 8px 0" }}>
              Generate offline timestamped subtitles for this video without cloud APIs.
            </p>
            {selectedClip?.file ? (
              <button
                type="button"
                className="ai-caption-btn primary"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => handleGenerateCaptions(selectedClip.file)}
              >
                ⚡ Generate Captions
              </button>
            ) : (
              <button
                type="button"
                className="ai-caption-btn primary"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => captionFileRef.current?.click()}
              >
                📁 Upload Video for Captions
              </button>
            )}
          </div>
        )}

        {captionError && (
          <div style={{ fontSize: "0.75rem", color: "#f87171", marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Error: {captionError}</span>
            {selectedClip?.file && (
              <button
                type="button"
                className="ai-chip"
                style={{ background: "#dc2626", color: "#fff", borderColor: "#ef4444" }}
                onClick={() => handleGenerateCaptions(selectedClip.file)}
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {/* Quick Prompt Chips */}
      {videoRecord && (
        <div>
          <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Quick Editing Prompts:</span>
          <div className="ai-chips">
            <button className="ai-chip" onClick={() => handleSendPrompt("Reframe to 9:16 for Reels/Shorts")}>
              📱 Reframe 9:16
            </button>
            <button className="ai-chip" onClick={() => handleSendPrompt("Trim the first 15 seconds")}>
              ✂️ Trim First 15s
            </button>
            <button
              className="ai-chip"
              onClick={() => {
                if (selectedClip?.file) {
                  handleGenerateCaptions(selectedClip.file);
                } else {
                  handleSendPrompt("Add subtitles to the video");
                }
              }}
            >
              💬 Add Subtitles
            </button>
            <button className="ai-chip" onClick={() => handleSendPrompt("Speed up by 1.5x")}>
              ⚡ 1.5x Speed
            </button>
            <button className="ai-chip" onClick={() => handleSendPrompt("Mute video audio")}>
              🔇 Mute Audio
            </button>
          </div>
        </div>
      )}

      {/* Low-Resolution Preview & Approval Section (Architecture Spec) */}
      {previewOutput && (
        <div className="ai-preview-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "#a5b4fc" }}>
              ⚡ Low-Resolution Fast Preview
            </span>
            <span className="ai-badge" style={{ backgroundColor: "#312e81" }}>
              480p Preview
            </span>
          </div>
          <video
            className="ai-preview-video"
            src={`${API_BASE}${previewOutput.url}`}
            controls
            autoPlay
            loop
          />
          <div className="ai-preview-actions">
            <button className="ai-btn-approve" onClick={handleApproveRender}>
              ✅ Approve & Full Render
            </button>
            <button className="ai-btn-refine" onClick={() => setPreviewOutput(null)}>
              🔄 Refine Prompt
            </button>
          </div>
        </div>
      )}

      {/* Final Render Download Card */}
      {finalOutput && (
        <div className="ai-video-card" style={{ borderColor: "#10b981", backgroundColor: "#064e3b" }}>
          <h4 style={{ margin: "0 0 6px 0", color: "#a7f3d0" }}>🎉 Full-Quality Render Ready!</h4>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#d1fae5" }}>
            Rendered high-quality MP4 file.
          </p>
          <a
            href={`${API_BASE}${finalOutput.url}`}
            download={finalOutput.filename}
            className="ai-btn-approve"
            style={{ display: "inline-block", marginTop: 10, textAlign: "center", textDecoration: "none" }}
            target="_blank"
            rel="noreferrer"
          >
            ⬇️ Download Full-Quality Video
          </a>
        </div>
      )}

      {/* Chat Messages */}
      <div className="ai-chat-history">
        {chatHistory.map((msg, index) => (
          <div key={index} className={`ai-message ${msg.role}`}>
            <div>{msg.content}</div>
            {msg.plan && msg.plan.length > 0 && (
              <ol className="ai-plan-steps">
                {msg.plan.map((step, idx) => (
                  <li key={idx}>
                    <strong>{step.tool}</strong>: {JSON.stringify(step.params)}
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>

      {/* Prompt Input */}
      <div className="ai-prompt-input-container">
        <input
          type="text"
          className="ai-prompt-input"
          placeholder={videoRecord ? "E.g. Cut the first 10s, resize to 9:16 and add subtitles" : "Sync a video above first..."}
          value={prompt}
          disabled={!videoRecord || isSendingPrompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isSendingPrompt) handleSendPrompt();
          }}
        />
        <button
          className="ai-btn-send"
          disabled={!videoRecord || !prompt.trim() || isSendingPrompt}
          onClick={() => handleSendPrompt()}
        >
          {isSendingPrompt ? "Thinking..." : "Send"}
        </button>
      </div>
    </div>
  );
}

