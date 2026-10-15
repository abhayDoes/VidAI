// Audio utilities for file detection and media loading

export const isAudioFile = (file) => {
  if (!file) return false;
  return (
    file.type.startsWith("audio/") ||
    /\.(mp3|wav|ogg|m4a|aac|flac|wma)$/i.test(file.name)
  );
};

export const loadAudioFile = (file) => {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = url;
    audio.onloadedmetadata = () => {
      const duration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : 30;
      resolve({
        url,
        duration,
        file,
        type: "audio",
      });
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not load audio file: ${file.name}`));
    };
  });
};
