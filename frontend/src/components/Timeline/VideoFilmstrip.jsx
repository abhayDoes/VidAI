import { useEffect, useState } from "react";

const MAX_THUMBNAILS = 12;
const THUMBNAIL_WIDTH = 96;
const THUMBNAIL_HEIGHT = 54;

export default function VideoFilmstrip({ clip }) {
  const [thumbnails, setThumbnails] = useState([]);

  useEffect(() => {
    setThumbnails([]);
    if (!clip.sourceUrl || !Number.isFinite(clip.duration) || clip.duration <= 0) return undefined;

    let disposed = false;
    let index = 0;
    const count = Math.min(MAX_THUMBNAILS, Math.max(1, Math.ceil(clip.duration / 1.5)));
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    canvas.width = THUMBNAIL_WIDTH;
    canvas.height = THUMBNAIL_HEIGHT;
    video.muted = true;
    video.preload = "metadata";
    video.src = clip.sourceUrl;

    const captureNext = () => {
      if (disposed || index >= count || !video.videoWidth || !video.videoHeight) return;
      const sourceAspect = video.videoWidth / video.videoHeight;
      const targetAspect = THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT;
      if (sourceAspect > targetAspect) {
        const cropWidth = video.videoHeight * targetAspect;
        context.drawImage(video, (video.videoWidth - cropWidth) / 2, 0, cropWidth, video.videoHeight, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
      } else {
        const cropHeight = video.videoWidth / targetAspect;
        context.drawImage(video, 0, (video.videoHeight - cropHeight) / 2, video.videoWidth, cropHeight, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
      }
      setThumbnails((current) => [...current, canvas.toDataURL("image/jpeg", 0.62)]);
      index += 1;
      if (index < count) {
        const sourceStart = clip.sourceStart || 0;
        const sourceTime = sourceStart + (clip.duration * index * (clip.speed || 1)) / count;
        video.currentTime = Math.min(Math.max(0, video.duration - 0.05), sourceTime);
      }
    };

    video.addEventListener("loadedmetadata", () => {
      if (video.duration <= 0) return;
      const sourceStart = Math.max(0, clip.sourceStart || 0);
      if (sourceStart === 0 && video.readyState < 2) {
        video.addEventListener("loadeddata", captureNext, { once: true });
      } else {
        video.currentTime = sourceStart;
      }
    }, { once: true });
    video.addEventListener("seeked", captureNext);

    return () => {
      disposed = true;
      video.removeEventListener("seeked", captureNext);
      video.removeAttribute("src");
      video.load();
    };
  }, [clip.duration, clip.sourceStart, clip.sourceUrl, clip.speed]);

  if (thumbnails.length === 0) return null;

  return (
    <div className="clip-filmstrip" aria-hidden="true">
      {thumbnails.map((thumbnail, index) => (
        <img key={index} src={thumbnail} alt="" draggable="false" />
      ))}
    </div>
  );
}
