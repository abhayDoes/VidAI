# VidAI Studio frontend

The editor handles media in the browser. Imported files stay in browser memory; the editing flow does not upload them or call the backend API.

## Run locally

```sh
npm install
npm run dev
```

Build a production bundle with `npm run build` and serve the generated `dist/` folder from any static web host.

## Browser media features

- FFmpeg.wasm powers local trim, rotate, resize, audio trim, and MP4 timeline export.
- Export layers visible video clips in track order, applies clip speed and visual transforms, and mixes audio from video and audio clips. Empty video intervals appear black.
- Drag a clip to move it or drag its left and right edges to trim it. Playback follows timeline positions and continues through gaps.
- Trim, rotate, resize, crop, speed changes, and merging are available locally through the inspector and timeline export.
- Extract audio from a video to an audio track, mute video audio, download an audio clip as MP3, and apply volume, fade, normalization, denoise, equalizer, echo, reverse, and mono effects to a selected audio range. Speed and trim controls also apply to audio clips.
- WebGPU is an optional preview renderer. The editor falls back to the browser video renderer when WebGPU is unavailable or fails.
- FFmpeg.wasm loads on the first edit or export. Its core is about 32 MB before transfer compression, so the first operation takes longer.
- Video is processed on the user's device. Large clips can be slow or exceed browser memory; FFmpeg.wasm documents a 2 GB input limit.
- The Crop Video inspector applies a pixel crop locally. Width, height, X, and Y use source-video coordinates; crop bounds must remain inside the source frame.

The app uses FFmpeg's single-thread WebAssembly core to avoid cross-origin isolation requirements for the multithreaded core. WebGPU works in supporting secure browser contexts; localhost and HTTPS are typical origins.

## Deployment and compatibility

Serve all files in `dist/` together over HTTPS, including the FFmpeg worker and WebAssembly assets. The first editing operation downloads the core, so it requires a network connection unless the assets are already cached. Use a recent browser with WebAssembly and Web Workers; WebGPU is optional and accelerates preview only. Start with small clips on devices with limited memory. Closing or reloading the page clears the current project.
