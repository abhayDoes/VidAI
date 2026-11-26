import React, { useState, useEffect, useRef } from "react";
import { API_BASE } from "../../config/api";
import "./AIAssistant.css";

export default function AIAssistant({
  selectedClip,
  timeline,
  player,
  onApplyTimelineSegments = () => {},
  captions = [],
  setCaptions = () => {},
  activeVideoId,
  setActiveVideoId = () => {},
  initialPrompt = "",
}) {
  const [prompt, setPrompt] = useState(initialPrompt || "");

  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialPrompt]);
  const [isPlanning, setIsPlanning] = useState(false);
  const [planError, setPlanError] = useState("");
  const [candidatePlan, setCandidatePlan] = useState(null); // { plan_id, operations, message, resulting_timeline }
  const [isPreviewingPlan, setIsPreviewingPlan] = useState(false);

  // Active backend timeline state
  const [backendTimeline, setBackendTimeline] = useState(null); // { video_id, source_duration, total_duration, version, segments }
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);

  // Render job state
  const [renderJob, setRenderJob] = useState(null); // { job_id, status, progress, error, output_url }
  const [isStartingRender, setIsStartingRender] = useState(false);
  const renderPollRef = useRef(null);

  // Captions state
  const [captionProgress, setCaptionProgress] = useState(null);
  const [captionStage, setCaptionStage] = useState("");
  const [captionError, setCaptionError] = useState("");
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const captionPollRef = useRef(null);
  const captionFileRef = useRef(null);

  // Fetch active timeline and captions whenever activeVideoId changes
  useEffect(() => {
    if (activeVideoId) {
      fetchTimeline(activeVideoId);
      fetchCaptions(activeVideoId);
    }
  }, [activeVideoId]);

  // Clean up polling intervals on unmount
  useEffect(() => {
    return () => {
      if (renderPollRef.current) clearInterval(renderPollRef.current);
      if (captionPollRef.current) clearInterval(captionPollRef.current);
    };
  }, []);

  const fetchTimeline = async (videoId) => {
    setIsLoadingTimeline(true);
    try {
      const res = await fetch(`${API_BASE}/videos/${videoId}/timeline`);
      if (res.ok) {
        const data = await res.json();
        setBackendTimeline(data);
        if (data.segments && data.segments.length > 0) {
          onApplyTimelineSegments(data.segments);
        }
      }
    } catch (e) {
      console.error("Failed to load timeline:", e);
    } finally {
      setIsLoadingTimeline(false);
    }
  };

  // Helper: find a local video File from selectedClip or timeline
  const getTimelineVideoFile = () => {
    if (selectedClip?.file && selectedClip.type === "video") return selectedClip.file;
    if (selectedClip?.file) return selectedClip.file;
    const firstVideo = timeline?.clips?.find((c) => c.type === "video" && c.file);
    return firstVideo?.file || null;
  };

  // Helper: upload a local File to backend and return its video_id
  const uploadVideoForAI = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/videos`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || `Upload failed with status ${res.status}`);
    }
    // Ensure timeline.json is initialized before /plan is called
    await fetchTimeline(data.video_id);
    setActiveVideoId(data.video_id);
    return data.video_id;
  };

  // 1. Generate editing plan from natural language prompt
  const handleGeneratePlan = async (e) => {
    if (e) e.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || isPlanning) return;

    // ── Subtitle / Caption intent ─────────────────────────────────────────
    if (isSubtitleIntent(cleanPrompt)) {
      setPrompt("");
      setPlanError("");
      setCaptionError("");
      handleGenerateCaptions(getTimelineVideoFile());
      return;
    }
    // ─────────────────────────────────────────────────────────────────────

    setIsPlanning(true);
    setPlanError("");
    setCandidatePlan(null);
    setIsPreviewingPlan(false);

    try {
      let targetVideoId = activeVideoId;
      if (!targetVideoId) {
        const localFile = getTimelineVideoFile();
        if (!localFile) {
          setPlanError("Import a video into the timeline first.");
          return;
        }
        targetVideoId = await uploadVideoForAI(localFile);
      }

      const res = await fetch(`${API_BASE}/videos/${targetVideoId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: cleanPrompt }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errDetail = data.detail;
        if (typeof errDetail === "object" && errDetail.errors) {
          setPlanError(errDetail.errors.join(", "));
        } else {
          setPlanError(errDetail || "Failed to generate plan");
        }
        return;
      }

      setCandidatePlan(data);
      // Auto-preview candidate segments in timeline preview
      if (data.resulting_timeline?.segments) {
        setIsPreviewingPlan(true);
        onApplyTimelineSegments(data.resulting_timeline.segments);
      }
    } catch (err) {
      setPlanError(`Network error: ${err.message}`);
    } finally {
      setIsPlanning(false);
    }
  };

  // 2. Approve candidate plan
  const handleApprovePlan = async () => {
    if (!candidatePlan || !activeVideoId) return;

    try {
      const res = await fetch(
        `${API_BASE}/videos/${activeVideoId}/plan/${candidatePlan.plan_id}/approve`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json();
        setPlanError(err.detail || "Failed to approve plan");
        return;
      }
      const newTimeline = await res.json();
      setBackendTimeline(newTimeline);
      onApplyTimelineSegments(newTimeline.segments);
      setCandidatePlan(null);
      setIsPreviewingPlan(false);
      setPrompt("");
    } catch (err) {
      setPlanError(`Approval error: ${err.message}`);
    }
  };

  // 3. Reject candidate plan
  const handleRejectPlan = async () => {
    if (!candidatePlan || !activeVideoId) return;

    try {
      await fetch(
        `${API_BASE}/videos/${activeVideoId}/plan/${candidatePlan.plan_id}/reject`,
        { method: "POST" }
      );
    } catch (err) {
      console.warn("Reject request notice:", err);
    } finally {
      // Revert preview back to active timeline
      if (backendTimeline?.segments) {
        onApplyTimelineSegments(backendTimeline.segments);
      }
      setCandidatePlan(null);
      setIsPreviewingPlan(false);
    }
  };

  // 4. Undo last timeline version
  const handleUndo = async () => {
    if (!activeVideoId) return;
    try {
      const res = await fetch(`${API_BASE}/videos/${activeVideoId}/timeline/undo`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        setPlanError(err.detail || "Undo failed");
        return;
      }
      const reverted = await res.json();
      setBackendTimeline(reverted);
      onApplyTimelineSegments(reverted.segments);
      setCandidatePlan(null);
      setIsPreviewingPlan(false);
    } catch (err) {
      setPlanError(`Undo error: ${err.message}`);
    }
  };

  // 5. Reset timeline to full original video
  const handleReset = async () => {
    if (!activeVideoId) return;
    setPrompt("reset");
    setIsPlanning(true);
    setPlanError("");
    try {
      const res = await fetch(`${API_BASE}/videos/${activeVideoId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "reset timeline to original" }),
      });
      const data = await res.json();
      if (res.ok && data.plan_id) {
        const appr = await fetch(
          `${API_BASE}/videos/${activeVideoId}/plan/${data.plan_id}/approve`,
          { method: "POST" }
        );
        if (appr.ok) {
          const resetTl = await appr.json();
          setBackendTimeline(resetTl);
          onApplyTimelineSegments(resetTl.segments);
          setCandidatePlan(null);
          setIsPreviewingPlan(false);
          setPrompt("");
        }
      }
    } catch (err) {
      setPlanError(`Reset error: ${err.message}`);
    } finally {
      setIsPlanning(false);
    }
  };

  // 6. Start Render & Poll Progress
  const handleStartRender = async () => {
    if (!activeVideoId || isStartingRender) return;

    setIsStartingRender(true);
    setPlanError("");
    setRenderJob({ status: "queued", progress: 0 });

    try {
      const res = await fetch(`${API_BASE}/videos/${activeVideoId}/render`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setPlanError(data.detail || "Failed to start render");
        setRenderJob(null);
        return;
      }

      const jobId = data.job_id;
      setRenderJob({ job_id: jobId, status: "queued", progress: 0 });

      // Poll render progress
      if (renderPollRef.current) clearInterval(renderPollRef.current);
      renderPollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`${API_BASE}/videos/${activeVideoId}/render/${jobId}`);
          if (!pollRes.ok) return;
          const job = await pollRes.json();
          setRenderJob(job);

          if (job.status === "done" || job.status === "failed") {
            clearInterval(renderPollRef.current);
            renderPollRef.current = null;
          }
        } catch (e) {
          console.error("Render poll error:", e);
        }
      }, 1000);
    } catch (err) {
      setPlanError(`Render trigger error: ${err.message}`);
      setRenderJob(null);
    } finally {
      setIsStartingRender(false);
    }
  };

  // Helper: detect subtitle/caption intent in a natural language prompt
  const isSubtitleIntent = (text) => {
    const lower = text.toLowerCase();
    const keywords = [
      "subtitle", "subtitles", "caption", "captions",
      "transcript", "transcribe", "transcription",
      "sub ", "subs", "cc",
      // Hinglish / Hindi variants
      "subtitles lagao", "subtitle lagao", "caption lagao", "captions lagao",
      "subtitles add", "subtitle add", "caption add", "captions add",
      "add subtitles", "add subtitle", "add captions", "add caption",
      "generate subtitles", "generate subtitle", "generate captions",
      "likho", "text lagao", "bolne wala",
    ];
    return keywords.some((kw) => lower.includes(kw));
  };

  // 7. Generate Captions
  const handleGenerateCaptions = (file) => {
    const targetFile = file || getTimelineVideoFile();
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
        setCaptionProgress(Math.round((e.loaded / e.total) * 100));
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
        const progress = data.progress != null ? Math.round(data.progress) : 0;
        setCaptionProgress(progress);
        setCaptionStage(data.message || data.stage || data.state || "Processing audio...");

        const isDone =
          data.state === "done" ||
          data.status === "completed" ||
          data.status === "done" ||
          (progress >= 100 && (data.state === "done" || data.status === "completed"));

        const isFailed = data.state === "failed" || data.status === "failed";

        if (isDone) {
          clearInterval(captionPollRef.current);
          captionPollRef.current = null;
          setIsGeneratingCaptions(false);
          await fetchCaptions(videoId);
          await fetchTimeline(videoId);
        } else if (isFailed) {
          clearInterval(captionPollRef.current);
          captionPollRef.current = null;
          setIsGeneratingCaptions(false);
          setCaptionError(data.error || data.message || "Caption generation failed");
        }
      } catch (err) {
        console.error("Caption polling error:", err);
      }
    }, 1200);
  };

  const fetchCaptions = async (videoId) => {
    try {
      const res = await fetch(`${API_BASE}/videos/${videoId}/captions`);
      if (res.ok) {
        const data = await res.json();
        if (data.captions && setCaptions) {
          setCaptions(data.captions);
        }
      }
    } catch (e) {
      console.error("Failed to fetch captions:", e);
    }
  };

  const isRenderRunning = renderJob && (renderJob.status === "running" || renderJob.status === "queued");

  return (
    <div className="ai-assistant">
      {/* Top Header with Compact Undo/Reset */}
      <div className="ai-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>
            <span>✨</span> AI Prompt Editor
          </h3>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              className="ai-btn-icon"
              onClick={handleUndo}
              disabled={isPlanning || isRenderRunning || (backendTimeline?.version || 1) <= 1}
              title="Undo last edit"
            >
              ↩ Undo
            </button>
            <button
              type="button"
              className="ai-btn-icon"
              onClick={handleReset}
              disabled={isPlanning || isRenderRunning}
              title="Reset timeline to original"
            >
              ↺ Reset
            </button>
          </div>
        </div>
        <p>Edit videos with natural language prompts (English, Hindi, Hinglish)</p>
      </div>

      {/* Prompt Box with Small Arrow Button */}
      <form onSubmit={handleGeneratePlan} className="ai-prompt-box">
        <label style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 500 }}>
          Natural Language Prompt:
        </label>
        <div className="ai-input-wrapper">
          <input
            type="text"
            className="ai-prompt-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              isRenderRunning
                ? "Rendering in progress..."
                : "e.g. cut last 1 min, add subtitles, pehle 10s hata do"
            }
            disabled={isPlanning || isRenderRunning}
          />
          <button
            type="submit"
            className="ai-btn-arrow"
            disabled={!prompt.trim() || isPlanning || isRenderRunning}
            title="Generate Edit"
          >
            {isPlanning ? (
              <span className="ai-spinner-small" />
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            )}
          </button>
        </div>

        {planError && <div className="ai-error-banner">{planError}</div>}
      </form>

      {/* Proposed Plan Card (Preview without committing) */}
      {candidatePlan && (
        <div className="ai-plan-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: "0.85rem", color: "#f8fafc" }}>
              💡 Proposed AI Edit Plan
            </strong>
            <span className="ai-badge" style={{ backgroundColor: "#854d0e", color: "#fde047" }}>
              Uncommitted Preview
            </span>
          </div>

          <p className="ai-plan-message">{candidatePlan.message}</p>

          <div className="ai-operations-list">
            {candidatePlan.operations.map((op, idx) => (
              <div key={idx} className="ai-op-item">
                <span className="ai-op-tag">{op.op}</span>
                <span className="ai-op-desc">{op.description || JSON.stringify(op.params)}</span>
              </div>
            ))}
          </div>

          {/* Candidate resulting timeline stats */}
          {candidatePlan.resulting_timeline && (
            <div className="ai-diff-stat">
              <span>Current: {backendTimeline?.total_duration?.toFixed(1) || "--"}s</span>
              <span>➔</span>
              <strong style={{ color: "#38bdf8" }}>
                New: {candidatePlan.resulting_timeline.segments?.reduce(
                  (acc, s) => acc + (s.src_end - s.src_start), 0
                ).toFixed(1)}s
              </strong>
            </div>
          )}

          <div className="ai-plan-actions">
            <button
              type="button"
              className="ai-btn-approve"
              onClick={handleApprovePlan}
              disabled={isRenderRunning}
            >
              ✓ Apply Edit
            </button>
            <button
              type="button"
              className="ai-btn-reject"
              onClick={handleRejectPlan}
              disabled={isRenderRunning}
            >
              ✗ Discard
            </button>
          </div>
        </div>
      )}

      <input
        ref={captionFileRef}
        type="file"
        accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files?.[0]) handleGenerateCaptions(e.target.files[0]);
        }}
      />

      {/* Subtitle progress / results (triggered via AI prompt e.g. "add subtitles") */}
      {(isGeneratingCaptions || captions?.length > 0 || captionError) && (
        <div className="ai-subtitles-card">
          {isGeneratingCaptions ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#94a3b8" }}>
                <span>{captionStage}</span>
                <span>{captionProgress || 0}%</span>
              </div>
              <div className="ai-progress-bar">
                <div className="ai-progress-fill" style={{ width: `${captionProgress || 5}%` }}></div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {captions?.length > 0 && (
                <div style={{ fontSize: "0.75rem", color: "#4ade80", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>✓</span> {captions.length} subtitles generated & synced
                </div>
              )}

              {activeVideoId && captions?.length > 0 && (
                <div className="ai-caption-btn-group">
                  <a
                    href={`${API_BASE}/videos/${activeVideoId}/captions.srt`}
                    download="captions.srt"
                    className="ai-caption-btn"
                  >
                    ⬇ Download SRT
                  </a>
                  <a
                    href={`${API_BASE}/videos/${activeVideoId}/captions.vtt`}
                    download="captions.vtt"
                    className="ai-caption-btn"
                  >
                    ⬇ Download VTT
                  </a>
                </div>
              )}
            </div>
          )}

          {captionError && <div className="ai-error-banner">{captionError}</div>}
        </div>
      )}

      {/* Export Final Video at the Very Bottom */}
      <div className="ai-export-footer">
        {renderJob && (
          <div className={`ai-render-card status-${renderJob.status}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                {renderJob.status === "done"
                  ? "✓ Render Complete"
                  : renderJob.status === "failed"
                  ? "✗ Render Failed"
                  : "⚡ Rendering Final MP4..."}
              </span>
              <span style={{ fontSize: "0.8rem", color: "#a5b4fc" }}>
                {Math.round(renderJob.progress || 0)}%
              </span>
            </div>

            {renderJob.status !== "done" && renderJob.status !== "failed" && (
              <div className="ai-progress-bar">
                <div className="ai-progress-fill" style={{ width: `${renderJob.progress || 5}%` }}></div>
              </div>
            )}

            {renderJob.status === "done" && (
              <a
                href={`${API_BASE}/videos/${activeVideoId}/render/${renderJob.job_id}/download`}
                className="ai-btn-download"
                download
              >
                📥 Download Final Video (.mp4)
              </a>
            )}

            {renderJob.error && (
              <div className="ai-error-banner" style={{ marginTop: 6 }}>
                {renderJob.error}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className="ai-btn-export-final"
          onClick={handleStartRender}
          disabled={!activeVideoId || isPlanning || isRenderRunning}
        >
          {isRenderRunning ? "⚡ Rendering Video..." : "⚡ Export Final Video"}
        </button>
      </div>
    </div>
  );
}
