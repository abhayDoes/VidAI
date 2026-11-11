const PROJECT_FORMAT = "vidai-project";
const PROJECT_VERSION = 1;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not package ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export async function createProjectFile({ clips, tracks, markers }) {
  const assets = {};
  const fileIds = new Map();
  const savedClips = [];

  for (const clip of clips) {
    const { file, sourceUrl, ...metadata } = clip;
    if (!file) throw new Error(`Media for “${clip.title}” is missing; re-import it before saving.`);
    let assetId = fileIds.get(file);
    if (!assetId) {
      assetId = `asset-${fileIds.size + 1}`;
      fileIds.set(file, assetId);
      assets[assetId] = {
        name: file.name || clip.filename || clip.title,
        type: file.type || "application/octet-stream",
        dataUrl: await readFileAsDataUrl(file),
      };
    }
    savedClips.push({ ...metadata, assetId });
  }

  const project = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    tracks,
    markers,
    clips: savedClips,
    assets,
  };
  return new File([JSON.stringify(project)], "vidai-project.vidai", {
    type: "application/vnd.vidai.project+json",
  });
}

export async function readProjectFile(file) {
  let project;
  try {
    project = JSON.parse(await file.text());
  } catch {
    throw new Error("That file is not a readable VidAI project.");
  }
  if (project?.format !== PROJECT_FORMAT || project.version !== PROJECT_VERSION ||
      !Array.isArray(project.tracks) || !Array.isArray(project.clips) ||
      !Array.isArray(project.markers) || !project.assets) {
    throw new Error("This VidAI project has an unsupported or invalid format.");
  }

  const assetFiles = new Map();
  const assetUrls = new Map();
  for (const [assetId, asset] of Object.entries(project.assets)) {
    if (typeof asset?.dataUrl !== "string" || typeof asset?.name !== "string") {
      throw new Error("The project contains an invalid media asset.");
    }
    const response = await fetch(asset.dataUrl);
    const blob = await response.blob();
    const mediaFile = new File([blob], asset.name, { type: asset.type || blob.type });
    assetFiles.set(assetId, mediaFile);
    assetUrls.set(assetId, URL.createObjectURL(mediaFile));
  }

  const clips = project.clips.map((clip) => {
    const mediaFile = assetFiles.get(clip.assetId);
    const sourceUrl = assetUrls.get(clip.assetId);
    if (!mediaFile || !sourceUrl) throw new Error(`Project media is missing for “${clip.title || "a clip"}”.`);
    const { assetId, ...metadata } = clip;
    return { ...metadata, file: mediaFile, sourceUrl };
  });

  return { tracks: project.tracks, markers: project.markers, clips };
}
