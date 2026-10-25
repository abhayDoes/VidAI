import { useEffect, useState } from "react";

const SHADER = `
struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOut {
  var positions = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
  );
  var uvs = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(1.0, 0.0)
  );
  var output: VertexOut;
  output.position = vec4<f32>(positions[index], 0.0, 1.0);
  output.uv = uvs[index];
  return output;
}

@group(0) @binding(0) var videoTexture: texture_external;
@group(0) @binding(1) var videoSampler: sampler;

@fragment fn fragmentMain(input: VertexOut) -> @location(0) vec4<f32> {
  return textureSampleBaseClampToEdge(videoTexture, videoSampler, input.uv);
}
`;

export default function useWebGpuPreview(videoRef, canvasRef, videoUrl, enabled, onStatus) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let frameId;
    let device;
    let context;
    let pipeline;
    let sampler;
    let lastStatus = "";
    const report = (message) => {
      if (message !== lastStatus) {
        lastStatus = message;
        onStatus?.(message);
      }
    };

    const start = async () => {
      if (!enabled) {
        setReady(false);
        report("Browser video preview active");
        return;
      }
      try {
        if (!navigator.gpu) throw new Error("WebGPU is unavailable in this browser.");
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("No WebGPU adapter is available.");
        device = await adapter.requestDevice();
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video || cancelled) return;
        context = canvas.getContext("webgpu");
        if (!context) throw new Error("Could not create a WebGPU canvas.");

        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({ device, format, alphaMode: "opaque" });
        const shader = device.createShaderModule({ code: SHADER });
        pipeline = device.createRenderPipeline({
          layout: "auto",
          vertex: { module: shader, entryPoint: "vertexMain" },
          fragment: { module: shader, entryPoint: "fragmentMain", targets: [{ format }] },
          primitive: { topology: "triangle-list" },
        });
        sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
        if (cancelled) return;
        setReady(true);
        report("WebGPU preview active");

        const render = () => {
          if (cancelled) return;
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) {
            const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
            const width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
            const height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
            if (canvas.width !== width || canvas.height !== height) {
              canvas.width = width;
              canvas.height = height;
            }
            try {
              const externalTexture = device.importExternalTexture({ source: video });
              const bindGroup = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                  { binding: 0, resource: externalTexture },
                  { binding: 1, resource: sampler },
                ],
              });
              const encoder = device.createCommandEncoder();
              const pass = encoder.beginRenderPass({
                colorAttachments: [{
                  view: context.getCurrentTexture().createView(),
                  clearValue: { r: 0, g: 0, b: 0, a: 1 },
                  loadOp: "clear",
                  storeOp: "store",
                }],
              });
              const sourceAspect = video.videoWidth / video.videoHeight;
              const canvasAspect = width / height;
              const viewportWidth = sourceAspect > canvasAspect ? width : height * sourceAspect;
              const viewportHeight = sourceAspect > canvasAspect ? width / sourceAspect : height;
              pass.setViewport(
                (width - viewportWidth) / 2,
                (height - viewportHeight) / 2,
                viewportWidth,
                viewportHeight,
                0,
                1,
              );
              pass.setPipeline(pipeline);
              pass.setBindGroup(0, bindGroup);
              pass.draw(6);
              pass.end();
              device.queue.submit([encoder.finish()]);
            } catch (error) {
              if (!cancelled) {
                setReady(false);
                report("WebGPU preview failed; using browser video preview");
              }
              console.warn("WebGPU video frame render failed", error);
              return;
            }
          }
          frameId = requestAnimationFrame(render);
        };
        render();
      } catch (error) {
        if (!cancelled) {
          setReady(false);
          report(`${error.message} Using browser video preview.`);
        }
      }
    };

    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      context?.unconfigure?.();
      device?.destroy?.();
    };
  }, [canvasRef, enabled, onStatus, videoRef, videoUrl]);

  return ready;
}
