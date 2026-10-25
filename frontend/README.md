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
- Export joins visible video clips in timeline order, applies clip speed and visual transforms, and mixes audio from video and audio clips.
- WebGPU is an optional preview renderer. The editor falls back to the browser video renderer when WebGPU is unavailable or fails.
- FFmpeg.wasm loads on the first edit or export. Its core is about 32 MB before transfer compression, so the first operation takes longer.
- Video is processed on the user's device. Large clips can be slow or exceed browser memory; FFmpeg.wasm documents a 2 GB input limit.

The app uses FFmpeg's single-thread WebAssembly core to avoid cross-origin isolation requirements for the multithreaded core. WebGPU works in supporting secure browser contexts; localhost and HTTPS are typical origins.
