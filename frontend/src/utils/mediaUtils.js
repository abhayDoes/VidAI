export const isImageFile = (file) => Boolean(file && (
  file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)
));

export const loadImageFile = (file, duration = 5) => {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({
      url,
      duration,
      width: image.naturalWidth,
      height: image.naturalHeight,
      file,
      type: "image",
    });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not load image: ${file.name}`));
    };
    image.src = url;
  });
};
