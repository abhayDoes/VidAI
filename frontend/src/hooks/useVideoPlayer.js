import { useState, useRef, useCallback } from "react";

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
      tempVideo.onloadedmetadata = () => {
        const duration = tempVideo.duration || 60;
        tempVideo.onloadedmetadata = null;
        tempVideo.onerror = null;
        tempVideo.removeAttribute("src");
        tempVideo.load();
        resolve({ url, duration, file });
      };
      tempVideo.onerror = () => {
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
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      setIsPlaying(true);
      videoRef.current.play().catch(() => setIsPlaying(false));
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

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
