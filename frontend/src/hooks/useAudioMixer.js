import { useEffect, useRef, useMemo } from "react";

/**
 * Hook to manage multi-source background audio playback at the frontend level.
 * Synchronizes background audio tracks with the main playhead time and video player
 * with butter-smooth playback, zero stuttering, and imperceptible drift correction.
 */
export default function useAudioMixer({
  clips = [],
  tracks = [],
  currentTime = 0,
  isPlaying = false,
  isScrubbing = false,
}) {
  // Map of clipId -> HTMLAudioElement
  const audioPoolRef = useRef(new Map());
  const lastTimeRef = useRef(currentTime);
  const wasPlayingRef = useRef(isPlaying);
  const wasScrubbingRef = useRef(isScrubbing);

  // Audio clips can be placed on any track.
  const trackMap = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);
  const audioClips = useMemo(
    () =>
      clips.filter((c) => c.type === "audio"),
    [clips]
  );

  useEffect(() => {
    const pool = audioPoolRef.current;

    // Detect if this update was triggered by an active user seek vs normal playback
    const timeDelta = currentTime - lastTimeRef.current;
    const isBigJump = Math.abs(timeDelta) > 0.35;
    const playbackStarted = isPlaying && !wasPlayingRef.current;
    const scrubEnded = wasScrubbingRef.current && !isScrubbing;
    const isUserSeek = isBigJump || playbackStarted || scrubEnded;

    lastTimeRef.current = currentTime;
    wasPlayingRef.current = isPlaying;
    wasScrubbingRef.current = isScrubbing;

    // Helper: Safely pause an audio element
    const safePause = (audio) => {
      try {
        if (!audio.paused) {
          audio.pause();
        }
        audio.playbackRate = 1.0;
      } catch (err) {
        console.warn("Audio pause error:", err);
      }
    };

    // Helper: Safely play an audio element
    const safePlay = (audio) => {
      try {
        const p = audio.play();
        if (p !== undefined) {
          p.catch((err) => {
            if (err.name !== "AbortError") {
              console.warn("Audio play error:", err);
            }
          });
        }
      } catch (err) {
        console.warn("Audio play error:", err);
      }
    };

    // Remove any audio elements for deleted or removed clips
    const currentClipIds = new Set(audioClips.map((c) => c.id));
    for (const [id, audio] of pool.entries()) {
      if (!currentClipIds.has(id)) {
        safePause(audio);
        audio.src = "";
        pool.delete(id);
      }
    }

    // 🛑 If paused or scrubbing, pause all audio immediately
    if (isScrubbing || !isPlaying) {
      for (const [id, audio] of pool.entries()) {
        safePause(audio);
        // Pre-position in-range audio so it starts immediately without delay when played
        const clip = audioClips.find((c) => c.id === id);
        if (clip) {
          const inRange =
            currentTime >= clip.start &&
            currentTime < clip.start + clip.duration;
          if (inRange) {
            const targetTime =
              (clip.sourceStart || 0) + (currentTime - clip.start) * (clip.speed || 1);
            try {
              if (Math.abs(audio.currentTime - targetTime) > 0.05) {
                audio.currentTime = Math.max(0, targetTime);
              }
            } catch {}
          }
        }
      }
      return;
    }

    // 🎵 Playback is active: synchronize all audio clips matching currentTime
    for (const clip of audioClips) {
      const track = trackMap.get(clip.trackId);
      const isMuted = !track || !track.visible || track.muted || clip.muted;
      const trackVolume = track?.volume ?? 1.0;
      const clipVolume = clip.volume ?? 1.0;
      const speed = clip.speed || 1;
      const finalVolume = isMuted
        ? 0
        : Math.max(0, Math.min(1, trackVolume * clipVolume));

      let audio = pool.get(clip.id);
      if (!audio) {
        audio = new Audio();
        audio.preload = "auto";
        audio.src = clip.sourceUrl;
        pool.set(clip.id, audio);
      } else if (audio.src !== clip.sourceUrl && clip.sourceUrl) {
        audio.src = clip.sourceUrl;
      }

      const inRange =
        currentTime >= clip.start &&
        currentTime < clip.start + clip.duration;

      if (inRange && !isMuted && finalVolume > 0) {
        audio.volume = finalVolume;
        const targetTime =
          (clip.sourceStart || 0) + (currentTime - clip.start) * speed;

        if (audio.paused) {
          // Audio just entered range or playback just started: seek once and play
          try {
            audio.currentTime = Math.max(0, targetTime);
          } catch {}
          audio.playbackRate = speed;
          safePlay(audio);
        } else if (isUserSeek) {
          // User clicked timeline or scrubbed: hard seek to new playhead position
          try {
            audio.currentTime = Math.max(0, targetTime);
          } catch {}
          audio.playbackRate = speed;
        } else {
          // Continuous smooth playback: NEVER hard seek audio.currentTime!
          // Use imperceptible pitch-neutral playbackRate micro-adjustments
          // to eliminate all stuttering, buffer flushing, and clicks.
          const drift = targetTime - audio.currentTime;
          if (Math.abs(drift) > 1.2) {
            // Massive drift (e.g. background tab throttling): hard seek
            try {
              audio.currentTime = Math.max(0, targetTime);
            } catch {}
            audio.playbackRate = speed;
          } else if (drift > 0.12) {
            // Audio slightly behind: catch up smoothly (+4% tempo)
            audio.playbackRate = speed * 1.04;
          } else if (drift < -0.12) {
            // Audio slightly ahead: ease back smoothly (-4% tempo)
            audio.playbackRate = speed * 0.96;
          } else if (audio.playbackRate !== speed) {
            // In sync (within 120ms): restore normal 1.0x rate
            audio.playbackRate = speed;
          }
        }
      } else {
        safePause(audio);
      }
    }
  }, [audioClips, trackMap, currentTime, isPlaying, isScrubbing]);

  // Clean up all audio elements on unmount
  useEffect(() => {
    const pool = audioPoolRef.current;
    return () => {
      for (const [, audio] of pool.entries()) {
        try {
          audio.pause();
          audio.src = "";
        } catch {}
      }
      pool.clear();
    };
  }, []);
}
