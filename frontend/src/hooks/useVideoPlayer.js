import { useState, useRef, useCallback, useEffect } from "react";

export default function useVideoPlayer() {
  const videoRef = useRef(null);
  const scrubbingRef = useRef(false);

  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(120);

  const setScrubbing = useCallback((value) => {
    scrubbingRef.current = value;
  }, []);
  const isScrubbing = useCallback(() => scrubbingRef.current, []);

  const loadVideo = useCallback((file) => {
    if (!file) return Promise.resolve(null);

    const url = URL.createObjectURL(file);
    return new Promise((resolve, reject) => {
      const tempVideo = document.createElement("video");
      tempVideo.preload = "metadata";
      tempVideo.src = url;

      let settled = false;
      const finish = (rawDur) => {
        if (settled) return;
        settled = true;
        tempVideo.onloadedmetadata = null;
        tempVideo.onerror = null;
        tempVideo.ontimeupdate = null;
        let validDuration =
          Number.isFinite(rawDur) && rawDur > 0 ? rawDur : null;
        if (!validDuration || validDuration > 86400) {
          validDuration = 60;
        }
        const width = tempVideo.videoWidth || undefined;
        const height = tempVideo.videoHeight || undefined;
        try {
          tempVideo.removeAttribute("src");
          tempVideo.load();
        } catch {
          // Ignore cleanup errors
        }
        resolve({
          url,
          duration: validDuration,
          width,
          height,
          file,
        });
      };

      tempVideo.onloadedmetadata = () => {
        if (tempVideo.duration === Infinity) {
          // Chromium WebM / screen recorder duration workaround
          tempVideo.currentTime = 1e101;
          tempVideo.ontimeupdate = () => {
            tempVideo.ontimeupdate = null;
            const trueDur = tempVideo.duration;
            tempVideo.currentTime = 0;
            finish(trueDur);
          };
          setTimeout(() => finish(60), 1000);
        } else {
          finish(tempVideo.duration);
        }
      };

      tempVideo.onerror = () => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(url);
        reject(new Error(`Could not read video: ${file.name}`));
      };
    });
  }, []);

  const setVideoSource = useCallback((file, url) => {
    setVideoFile(file || null);
    setVideoUrl(url || null);
  }, []);

  const handleTimeUpdate = useCallback(
    (timelineStart = 0, sourceStart = 0, speed = 1) => {
      if (videoRef.current && !scrubbingRef.current) {
        setCurrentTime(
          timelineStart + (videoRef.current.currentTime - sourceStart) / speed
        );
      }
    },
    []
  );

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      if (videoRef.current) {
        if (next) {
          videoRef.current.play().catch(() => {});
        } else {
          videoRef.current.pause();
        }
      }
      return next;
    });
  }, []);

  // Timer ticker so playback and audio track can advance even if no video clip is under playhead
  useEffect(() => {
    if (!isPlaying) return undefined;
    let lastTime = performance.now();
    let frameId;

    const tick = (now) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      if (!scrubbingRef.current) {
        setCurrentTime((prev) => {
          const next = prev + delta;
          if (next >= duration) {
            setIsPlaying(false);
            return duration;
          }
          return next;
        });
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, duration]);

  const seekTo = useCallback(
    (seconds, clipStart, sourceStart, speed = 1) => {
      const clamped = Math.max(0, Math.min(seconds, duration));
      setCurrentTime(clamped);
      const video = videoRef.current;
      if (
        video &&
        clipStart !== undefined &&
        sourceStart !== undefined &&
        Number.isFinite(video.duration) &&
        video.duration > 0
      ) {
        const desired = Math.max(
          0,
          Math.min(
            sourceStart + (clamped - clipStart) * speed,
            video.duration - 0.03
          )
        );
        if (Math.abs(video.currentTime - desired) > 0.03) {
          try {
            video.currentTime = desired;
          } catch {
            // Ignore seek failures (e.g. metadata not loaded yet).
          }
        }
      }
    },
    [duration]
  );

  return {
    videoRef,
    videoFile,
    videoUrl,
    isPlaying,
    setIsPlaying,
    currentTime,
    duration,
    setDuration,
    setCurrentTime,
    setScrubbing,
    isScrubbing,
    loadVideo,
    setVideoSource,
    handleTimeUpdate,
    togglePlay,
    seekTo,
  };
}
