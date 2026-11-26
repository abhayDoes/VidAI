import React, { useEffect, useRef, useState } from "react";
import "./LandingPage.css";

export default function LandingPage({ onLaunchStudio }) {
  const [heroPrompt, setHeroPrompt] = useState("");
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const targets = root.querySelectorAll(".vl-reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 }
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const handleHeroSubmit = (e) => {
    e.preventDefault();
    onLaunchStudio({ prompt: heroPrompt.trim(), openAI: Boolean(heroPrompt.trim()) });
  };

  return (
    <div ref={rootRef} className="vidai-landing">
      {/* Top Navbar */}
      <header className="vl-nav">
        <div className="vl-nav-inner">
          <div className="vl-brand">
            <span className="vl-logo-mark">▶</span>
            <span className="vl-brand-name">VidAI Studio</span>
          </div>

          <nav className="vl-nav-links">
            <a href="#features">Features</a>
            <a href="#ai-editor">AI Prompting</a>
            <a href="#workflow">How It Works</a>
          </nav>

          <div className="vl-nav-actions">
            <button
              type="button"
              className="vl-btn-ghost"
              onClick={() => onLaunchStudio({ openAI: false })}
            >
              Open Editor
            </button>
            <button
              type="button"
              className="vl-btn-primary"
              onClick={() => onLaunchStudio({ openAI: true })}
            >
              Try AI Studio Free
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section (Semrush-style deep violet/navy + vibrant orange CTA) */}
      <section className="vl-hero">
        <div className="vl-hero-inner">
          <div className="vl-hero-copy">
            <span className="vl-eyebrow">
              AI-POWERED VIDEO EDITOR • ENGLISH, HINDI &amp; HINGLISH
            </span>
            <h1 className="vl-hero-title">
              Edit Any Video With Plain Language—In Seconds
            </h1>
            <p className="vl-hero-sub">
              Cut clips, strip silent dead air, extract audio tracks, and
              generate synced subtitles using natural prompts. Preview every AI
              edit on a non-destructive timeline before you export.
            </p>

            <form className="vl-hero-bar" onSubmit={handleHeroSubmit}>
              <input
                type="text"
                className="vl-hero-input"
                placeholder='Try: "remove silent parts", "add subtitles", or "cut last 10s"'
                value={heroPrompt}
                onChange={(e) => setHeroPrompt(e.target.value)}
              />
              <button type="submit" className="vl-hero-cta">
                Launch Studio →
              </button>
            </form>

            <div className="vl-hero-chips">
              <span>Popular prompts:</span>
              <button
                type="button"
                onClick={() => onLaunchStudio({ prompt: "remove silent parts", openAI: true })}
              >
                🔇 Remove silence
              </button>
              <button
                type="button"
                onClick={() => onLaunchStudio({ prompt: "add subtitles", openAI: true })}
              >
                💬 Add subtitles
              </button>
              <button
                type="button"
                onClick={() => onLaunchStudio({ prompt: "pehle 10 second hata do", openAI: true })}
              >
                ✂ Pehle 10s hata do
              </button>
            </div>
          </div>

          {/* Right Hero Mockup Card */}
          <div className="vl-hero-card">
            <div className="vl-card-topbar">
              <div className="vl-dots">
                <span />
                <span />
                <span />
              </div>
              <span className="vl-card-title">VidAI Studio — Live AI Plan Preview</span>
            </div>

            <div className="vl-card-body">
              <div className="vl-mock-prompt">
                <span className="vl-mock-label">Prompt</span>
                <div className="vl-mock-text">
                  "remove silent parts and keep only highlights"
                </div>
              </div>

              <div className="vl-mock-plan">
                <div className="vl-mock-plan-head">
                  <strong>💡 Proposed AI Edit Plan</strong>
                  <span className="vl-badge-preview">Preview Ready</span>
                </div>
                <div className="vl-mock-op">
                  <span className="vl-op-pill">remove_silence</span>
                  <span>Cut 4 silent pauses (&ge;0.5s below -30 dB)</span>
                </div>
                <div className="vl-mock-diff">
                  <span>Current: 45.0s</span>
                  <span>➔</span>
                  <strong>New: 28.4s (-37%)</strong>
                </div>
              </div>

              <div className="vl-mock-timeline">
                <div className="vl-track-row">
                  <span className="vl-track-tag">V1</span>
                  <div className="vl-seg" style={{ width: "34%" }}>Intro</div>
                  <div className="vl-seg-cut" style={{ width: "12%" }} />
                  <div className="vl-seg" style={{ width: "28%" }}>Main</div>
                  <div className="vl-seg" style={{ width: "22%" }}>Outro</div>
                </div>
                <div className="vl-track-row">
                  <span className="vl-track-tag">A1</span>
                  <div className="vl-seg-audio" style={{ width: "96%" }}>
                    Extracted Audio Track (Synced)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Metrics / Trust Strip */}
      <section className="vl-stats-bar vl-reveal">
        <div className="vl-stats-inner">
          <div className="vl-stat">
            <strong>3 Languages</strong>
            <span>English, Hindi &amp; Hinglish prompts</span>
          </div>
          <div className="vl-stat">
            <strong>0-Wait Local Edits</strong>
            <span>In-browser FFmpeg.wasm processing</span>
          </div>
          <div className="vl-stat">
            <strong>Preview-First AI</strong>
            <span>Approve or discard before rendering</span>
          </div>
          <div className="vl-stat">
            <strong>SRT &amp; VTT Ready</strong>
            <span>faster-whisper synced subtitles</span>
          </div>
        </div>
      </section>

      {/* Feature Deep-Dives (Alternating Sections) */}
      <section id="features" className="vl-features">
        <div className="vl-section-head">
          <h2>Everything You Need to Turn Raw Footage Into Final Cuts</h2>
          <p>
            Built on a hybrid browser + server engine so quick trims happen
            instantly and heavy AI tasks run reliably.
          </p>
        </div>

        {/* Feature 1 */}
        <div id="ai-editor" className="vl-feature-row vl-reveal">
          <div className="vl-feature-text">
            <span className="vl-feature-kicker">NATURAL LANGUAGE TIMELINE</span>
            <h3>Speak or Type What You Want Cut—In Your Own Language</h3>
            <p>
              Skip hunting for exact frames. Tell the AI{" "}
              <code>"cut the last 1 min"</code>,{" "}
              <code>"keep only from 0:10 to 0:45"</code>, or{" "}
              <code>"pehle 10 second hata do"</code>. VidAI validates every
              operation against your timeline and shows the exact time diff
              before committing.
            </p>
            <ul className="vl-checklist">
              <li>Non-destructive segment preview with 1-click Apply or Discard</li>
              <li>Full Undo &amp; Reset history snapshots</li>
              <li>Strict schema validation—never runs unsafe raw commands</li>
            </ul>
          </div>
          <div className="vl-feature-visual">
            <div className="vl-mini-card">
              <div className="vl-mini-row">
                <span className="vl-chip-demo">✂ cut last 1 min</span>
                <span className="vl-chip-demo">✂ pehle 10s hata do</span>
                <span className="vl-chip-demo">⏱ keep 0:10 to 0:45</span>
              </div>
              <div className="vl-mini-result">
                <span>Timeline updated: 3 segments</span>
                <span className="vl-green">✓ Ready to Export</span>
              </div>
            </div>
          </div>
        </div>

        {/* Feature 2 */}
        <div className="vl-feature-row vl-reverse vl-reveal">
          <div className="vl-feature-text">
            <span className="vl-feature-kicker">SMART AUDIO &amp; SILENCE ENGINE</span>
            <h3>Automatically Strip Dead Air &amp; Extract Clean Audio</h3>
            <p>
              Remove awkward pauses in one prompt with FFmpeg{" "}
              <code>silencedetect</code>—complete with speech-edge padding so
              words never feel clipped. Need the audio separately? Extract it to
              its own timeline track or export MP3 in-browser.
            </p>
            <ul className="vl-checklist">
              <li>Configurable dB threshold &amp; minimum pause duration</li>
              <li>0.1s padding preserves natural speech transitions</li>
              <li>Instant client-side audio extraction &amp; muting</li>
            </ul>
          </div>
          <div className="vl-feature-visual">
            <div className="vl-mini-card">
              <div className="vl-wave-box">
                <span className="vl-wave active" />
                <span className="vl-wave active" />
                <span className="vl-wave silent" title="Silence removed" />
                <span className="vl-wave silent" title="Silence removed" />
                <span className="vl-wave active" />
                <span className="vl-wave active" />
                <span className="vl-wave silent" title="Silence removed" />
                <span className="vl-wave active" />
              </div>
              <div className="vl-mini-result">
                <span>Detected 3 silent gaps</span>
                <span className="vl-orange">-16.6s trimmed</span>
              </div>
            </div>
          </div>
        </div>

        {/* Feature 3 */}
        <div className="vl-feature-row vl-reveal">
          <div className="vl-feature-text">
            <span className="vl-feature-kicker">SUBTITLES &amp; FULL NLE CONTROLS</span>
            <h3>Synced Captions + Multi-Track Timeline in One Workspace</h3>
            <p>
              Type <code>"add subtitles"</code> and VidAI transcribes your video
              with <code>faster-whisper</code>, syncs live captions onto the
              player preview, and lets you download <code>.SRT</code> or{" "}
              <code>.VTT</code> files—right alongside crop, rotate, split, and
              speed controls.
            </p>
            <ul className="vl-checklist">
              <li>Auto language detection across 90+ languages</li>
              <li>Live caption overlay synced to timeline playback</li>
              <li>Export final rendered MP4 with progress tracking</li>
            </ul>
          </div>
          <div className="vl-feature-visual">
            <div className="vl-mini-card">
              <div className="vl-caption-preview">
                <div className="vl-video-box">
                  <span className="vl-subtitle-pill">
                    "Welcome back to VidAI Studio..."
                  </span>
                </div>
              </div>
              <div className="vl-mini-result">
                <span>✓ 11 subtitles synced</span>
                <span className="vl-blue">⬇ SRT / VTT</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="workflow" className="vl-workflow">
        <div className="vl-section-head">
          <h2>From Raw Clip to Final Video in 3 Steps</h2>
        </div>
        <div className="vl-steps-grid vl-reveal">
          <div className="vl-step-card">
            <span className="vl-step-num">1</span>
            <h4>Import Your Video</h4>
            <p>
              Drop any MP4, MOV, MKV, or WebM into the studio timeline—zero setup
              required.
            </p>
          </div>
          <div className="vl-step-card">
            <span className="vl-step-num">2</span>
            <h4>Prompt the AI</h4>
            <p>
              Ask to cut ranges, remove silence, or add subtitles in English,
              Hindi, or Hinglish.
            </p>
          </div>
          <div className="vl-step-card">
            <span className="vl-step-num">3</span>
            <h4>Preview &amp; Export</h4>
            <p>
              Inspect the proposed timeline diff, fine-tune tracks, and export
              your final MP4.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA Banner */}
      <section className="vl-bottom-cta vl-reveal">
        <h2>Ready to Edit Faster With AI?</h2>
        <p>
          Jump straight into VidAI Studio—import a video and run your first
          prompt in seconds.
        </p>
        <button
          type="button"
          className="vl-hero-cta"
          onClick={() => onLaunchStudio({ openAI: true })}
        >
          Open VidAI Studio Now →
        </button>
      </section>

      {/* Footer */}
      <footer className="vl-footer">
        <div className="vl-footer-inner">
          <div className="vl-brand">
            <span className="vl-logo-mark">▶</span>
            <span className="vl-brand-name">VidAI Studio</span>
          </div>
          <span className="vl-footer-note">
            AI Video Editor • FastAPI + React + FFmpeg + Whisper
          </span>
        </div>
      </footer>
    </div>
  );
}
