import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import classWorkerURL from "@ffmpeg/ffmpeg/worker?url";

const ffmpeg = new FFmpeg();
let loadPromise;
let operationId = 0;
let progressCallback = () => {};
let taskQueue = Promise.resolve();

function enqueueTask(task) {
  const pending = taskQueue.then(task, task);
  taskQueue = pending.catch(() => {});
  return pending;
}

ffmpeg.on("progress", ({ progress }) => {
  progressCallback(Math.max(0, Math.min(1, progress || 0)));
});

async function getFFmpeg(onProgress = () => {}) {
  progressCallback = onProgress;
  if (!loadPromise) {
    loadPromise = ffmpeg.load({ coreURL, wasmURL, classWorkerURL }).catch((error) => {
      loadPromise = undefined;
      throw error;
    });
  }
  await loadPromise;
  return ffmpeg;
}

function nextFileName(label, extension = "mp4") {
  operationId += 1;
  return `${label}-${Date.now()}-${operationId}.${extension}`;
}

async function writeInput(engine, file) {
  if (!(file instanceof Blob)) throw new Error("This clip has no local source file.");
  const name = nextFileName("input", file.name.split(".").pop() || "bin");
  await engine.writeFile(name, await fetchFile(file));
  return name;
}

async function readOutput(engine, path, name) {
  const bytes = await engine.readFile(path);
  const type = name.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "video/mp4";
  const file = new File([bytes], name, { type });
  return { file, url: URL.createObjectURL(file) };
}

async function execute(engine, args) {
  const exitCode = await engine.exec(args);
  if (exitCode !== 0) {
    throw new Error("FFmpeg could not process this media. Try a different input format or a shorter clip.");
  }
}

async function processClipInternal(file, operation, options = {}, onProgress) {
  const audioOnly = file.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|opus|flac)$/i.test(file.name);
  if (audioOnly && operation !== "trim") throw new Error("Rotate, resize, and crop are available for video clips only.");
  const engine = await getFFmpeg(onProgress);
  const input = await writeInput(engine, file);
  const output = nextFileName(operation, audioOnly ? "mp3" : "mp4");
  const filters = [];
  const args = ["-i", input];

  if (operation === "trim") {
    const start = Math.max(0, Number(options.start) || 0);
    const duration = Math.max(0.1, Number(options.duration) || 0.1);
    args.splice(0, 0, "-ss", String(start));
    args.push("-t", String(duration));
  } else if (operation === "rotate") {
    const angle = ((Number(options.angle) || 90) % 360 + 360) % 360;
    if (angle === 90) filters.push("transpose=1");
    else if (angle === 180) filters.push("transpose=1", "transpose=1");
    else if (angle === 270) filters.push("transpose=2");
    else if (angle !== 0) throw new Error("Rotation must be 0, 90, 180, or 270 degrees.");
  } else if (operation === "resize") {
    const width = Math.max(2, Math.floor(Number(options.width) / 2) * 2);
    const height = Math.max(2, Math.floor(Number(options.height) / 2) * 2);
    if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error("Choose a valid output resolution.");
    filters.push(`scale=${width}:${height}`);
  } else if (operation === "crop") {
    const width = Math.floor(Number(options.width));
    const height = Math.floor(Number(options.height));
    const x = Math.floor(Number(options.x));
    const y = Math.floor(Number(options.y));
    if (![width, height, x, y].every(Number.isFinite) || width < 2 || height < 2 || x < 0 || y < 0) {
      throw new Error("Choose positive crop dimensions and non-negative X and Y offsets.");
    }
    filters.push(`crop=${width}:${height}:${x}:${y}`);
  } else {
    throw new Error(`Unsupported local edit: ${operation}`);
  }

  if (filters.length) args.push("-vf", filters.join(","));
  if (audioOnly) {
    args.push("-vn", "-c:a", "libmp3lame", "-b:a", "192k", output);
  } else {
    args.push("-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output);
  }
  try {
    await execute(engine, args);
    return await readOutput(engine, output, output);
  } finally {
    await engine.deleteFile(input).catch(() => {});
    await engine.deleteFile(output).catch(() => {});
  }
}

export function processClip(file, operation, options = {}, onProgress) {
  return enqueueTask(() => processClipInternal(file, operation, options, onProgress));
}

function atempoFilters(speed) {
  let remaining = speed;
  const filters = [];
  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining}`);
  return filters;
}

function evenDimension(value, fallback) {
  const dimension = Number(value) || fallback;
  return Math.max(2, Math.floor(dimension / 2) * 2);
}

async function hasAudioStream(engine, input) {
  const report = nextFileName("probe", "json");
  const exitCode = await engine.ffprobe([
    "-v", "error", "-show_entries", "stream=codec_type", "-of", "json", input, "-o", report,
  ]);
  if (exitCode !== 0) throw new Error("Could not inspect the audio streams in a source file.");
  const data = await engine.readFile(report);
  await engine.deleteFile(report).catch(() => {});
  const json = new TextDecoder().decode(data);
  return JSON.parse(json).streams?.some((stream) => stream.codec_type === "audio") ?? false;
}

async function exportTimelineInternal(clips, tracks = [], onProgress) {
  const videos = clips
    .filter((clip) => clip.type !== "audio" && clip.file && clip.duration > 0)
    .sort((a, b) => a.start - b.start);
  if (!videos.length) throw new Error("Add a video clip to the timeline before exporting.");

  const audioTracks = new Map(tracks.map((track) => [track.id, track]));
  const audio = clips.filter((clip) => {
    const track = audioTracks.get(clip.trackId);
    return (clip.type === "audio" || track?.type === "audio") &&
      track?.visible !== false && track?.muted !== true && clip.file && clip.duration > 0;
  });

  const engine = await getFFmpeg(onProgress);
  const args = [];
  const inputNames = [];
  for (const clip of videos) {
    inputNames.push(await writeInput(engine, clip.file));
    args.push("-i", inputNames.at(-1));
  }
  const audioInputStart = inputNames.length;
  for (const clip of audio) {
    inputNames.push(await writeInput(engine, clip.file));
    args.push("-i", inputNames.at(-1));
  }

  let width = evenDimension(videos[0].width, 1280);
  let height = evenDimension(videos[0].height, 720);
  const ratios = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1 };
  const targetAspect = ratios[videos[0].aspectRatio] || width / height;
  if (width / height > targetAspect) width = evenDimension(height * targetAspect, height);
  else height = evenDimension(width / targetAspect, width);
  const graph = [];
  const concatLabels = [];
  const videoAudioStreams = await Promise.all(inputNames.map((name) => hasAudioStream(engine, name)));

  videos.forEach((clip, index) => {
    const speed = Math.max(0.05, Number(clip.speed) || 1);
    const sourceStart = Math.max(0, Number(clip.sourceStart) || 0);
    const sourceDuration = Math.max(0.1, clip.duration * speed);
    const targetDuration = sourceDuration / speed;
    const visualFilters = [
      `trim=start=${sourceStart}:duration=${sourceDuration}`,
      "setpts=PTS-STARTPTS",
      `setpts=PTS/${speed}`,
    ];
    const rotation = ((Number(clip.rotation) || 0) % 360 + 360) % 360;
    if (rotation === 90) visualFilters.push("transpose=1");
    else if (rotation === 180) visualFilters.push("transpose=1", "transpose=1");
    else if (rotation === 270) visualFilters.push("transpose=2");
    if (clip.flipH) visualFilters.push("hflip");
    if (clip.flipV) visualFilters.push("vflip");
    visualFilters.push(
      `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
      "setsar=1",
      "fps=30",
    );
    visualFilters.push("format=yuv420p");
    graph.push(`[${index}:v]${visualFilters.join(",")}[v${index}]`);

    const audioLabel = `a${index}`;
    const audioFilters = [
      `atrim=start=${sourceStart}:duration=${sourceDuration}`,
      "asetpts=PTS-STARTPTS",
      "aresample=44100",
      "aformat=sample_rates=44100:channel_layouts=stereo",
      ...atempoFilters(speed),
      `apad=pad_dur=${targetDuration}`,
      `atrim=duration=${targetDuration}`,
    ];
    if (videoAudioStreams[index]) {
      graph.push(`[${index}:a]${audioFilters.join(",")} [${audioLabel}]`);
    } else {
      graph.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${targetDuration},asetpts=PTS-STARTPTS[${audioLabel}]`);
    }
    concatLabels.push(`[v${index}][${audioLabel}]`);
  });

  graph.push(`${concatLabels.join("")}concat=n=${videos.length}:v=1:a=1[outv][baseaudio]`);
  const audioLabels = ["[baseaudio]"];
  audio.forEach((clip, index) => {
    const inputIndex = audioInputStart + index;
    const track = audioTracks.get(clip.trackId);
    const volume = Math.max(0, Math.min(1, (clip.volume ?? 1) * (track?.volume ?? 1)));
    const start = Math.max(0, Number(clip.sourceStart) || 0);
    const duration = Math.max(0.1, Number(clip.duration) || 0.1);
    const delay = Math.round(Math.max(0, Number(clip.start) || 0) * 1000);
    const label = `music${index}`;
    graph.push(`[${inputIndex}:a]atrim=start=${start}:duration=${duration},asetpts=PTS-STARTPTS,aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo,volume=${volume},adelay=${delay}|${delay}[${label}]`);
    audioLabels.push(`[${label}]`);
  });

  if (audio.length) {
    graph.push(`${audioLabels.join("")}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0,alimiter=limit=0.95[outa]`);
  } else {
    graph.push("[baseaudio]anull[outa]");
  }

  const output = nextFileName("vidai-export");
  args.push(
    "-filter_complex", graph.join(";"),
    "-map", "[outv]", "-map", "[outa]",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
    "-c:a", "aac", "-b:a", "160k", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-shortest", output,
  );
  try {
    await execute(engine, args);
    return await readOutput(engine, output, "vidai-export.mp4");
  } finally {
    for (const input of inputNames) await engine.deleteFile(input).catch(() => {});
    await engine.deleteFile(output).catch(() => {});
  }
}

export function exportTimeline(clips, tracks = [], onProgress) {
  return enqueueTask(() => exportTimelineInternal(clips, tracks, onProgress));
}

export function downloadFile(file, filename = file.name) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
