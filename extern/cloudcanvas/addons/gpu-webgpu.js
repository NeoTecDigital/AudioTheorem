/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The WebGPU backend for the `gpu` add-on: hand-written WGSL drawing the scene of `./gpu-scene.js` in one pass -
 * instanced unit quads, one texture per run, and meshes (`./gpu-webgpu-mesh.js`) against a depth buffer - blended
 * premultiplied onto the canvas. An erase run clears it by coverage instead. `createBackend` resolves to the
 * `GpuBackend` that contract describes; `./gpu.js` loads it by `import()` only.
 */
import { FIELD, STRIDE } from './gpu-scene.js';
import { createMeshes } from './gpu-webgpu-mesh.js';
import { createLogger } from '../log.js';

const logger = /* @__PURE__ */ createLogger('gpu-webgpu');

const SHADER = `
struct Varyings {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) tint: vec4f,
};

@group(0) @binding(0) var<uniform> clip: mat4x4f;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

@vertex
fn vs(@location(0) corner: vec2f, @location(1) box: vec4f, @location(2) depth: vec2f,
      @location(3) tint: vec4f, @location(4) rect: vec4f) -> Varyings {
  let mid = box.zw * 0.5;
  let offset = box.zw * corner - mid;
  let s = sin(depth.y);
  let c = cos(depth.y);
  let turned = vec2f(offset.x * c - offset.y * s, offset.x * s + offset.y * c);
  var v: Varyings;
  v.position = clip * vec4f(box.xy + mid + turned, depth.x, 1.0);
  v.uv = mix(rect.xy, rect.zw, corner);
  v.tint = tint;
  return v;
}

@fragment
fn fs(v: Varyings) -> @location(0) vec4f {
  let c = textureSample(tex, samp, v.uv) * v.tint;
  return vec4f(c.rgb * c.a, c.a);
}
`;

/** Premultiplied source over: ONE, ONE_MINUS_SRC_ALPHA. */
const BLEND = /* @__PURE__ */ Object.freeze({ srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' });

/** An erase run's blend, ZERO, ONE_MINUS_SRC_ALPHA: the destination cleared by the fragment's coverage. */
const ERASE = /* @__PURE__ */ Object.freeze({ srcFactor: 'zero', dstFactor: 'one-minus-src-alpha', operation: 'add' });

/** The depth buffer both pipelines declare, as they share one pass: meshes test and write it, quads ignore it. */
const DEPTH_FORMAT = 'depth24plus';

/** The unit quad's corners as a triangle strip. */
const CORNERS = /* @__PURE__ */ Float32Array.of(0, 0, 1, 0, 0, 1, 1, 1);

/** The corner buffer's layout: one vec2 per vertex. */
const CORNER_LAYOUT = /* @__PURE__ */ Object.freeze({
  arrayStride: 8, stepMode: 'vertex', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }]
});

/** The instance buffer's layout: box, z and rotation, colour, uv rect, at their FIELD offsets. */
const INSTANCE_LAYOUT = /* @__PURE__ */ Object.freeze({
  arrayStride: STRIDE * 4,
  stepMode: 'instance',
  attributes: [
    { shaderLocation: 1, offset: FIELD.x * 4, format: 'float32x4' },
    { shaderLocation: 2, offset: FIELD.z * 4, format: 'float32x2' },
    { shaderLocation: 3, offset: FIELD.r * 4, format: 'float32x4' },
    { shaderLocation: 4, offset: FIELD.u0 * 4, format: 'float32x4' }
  ]
});

/** The adapter, device and configured canvas context, or a rejection naming what is missing. */
async function acquire(canvas, options) {
  const gpu = globalThis.navigator?.gpu;
  if (!gpu) throw new Error('gpu-webgpu: navigator.gpu is unavailable');
  const adapter = await gpu.requestAdapter({ powerPreference: options.powerPreference });
  if (!adapter) throw new Error('gpu-webgpu: no WebGPU adapter');
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) {
    device.destroy();
    throw new Error('gpu-webgpu: the canvas has no webgpu context');
  }
  const format = gpu.getPreferredCanvasFormat();
  const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC;
  context.configure({ device, format, alphaMode: 'premultiplied', usage });
  return { device, context, format };
}

/** Compile WGSL, reporting every compiler message through the logger. */
async function compile(device, code, label) {
  const module = device.createShaderModule({ label, code });
  const info = await module.getCompilationInfo();
  for (const message of info.messages) {
    const report = message.type === 'error' ? logger.error : logger.warn;
    report(`shader ${message.type} at ${message.lineNum}:${message.linePos}: ${message.message}`);
  }
  return module;
}

/** The quads' bind group layout, shared by both quad pipelines so one bind group serves either. */
function createQuadLayout(device) {
  return device.createBindGroupLayout({
    label: 'gpu-webgpu',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } }
    ]
  });
}

/** The two instanced-quad pipelines, painting and erasing, alike but for the blend: no culling, no depth. */
async function createQuadPipelines(device, format, layout) {
  const module = await compile(device, SHADER, 'gpu-webgpu');
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const create = (blend, label) => device.createRenderPipelineAsync({
    label,
    layout: pipelineLayout,
    vertex: { module, entryPoint: 'vs', buffers: [CORNER_LAYOUT, INSTANCE_LAYOUT] },
    fragment: { module, entryPoint: 'fs', targets: [{ format, blend: { color: blend, alpha: blend } }] },
    primitive: { topology: 'triangle-strip', cullMode: 'none' },
    depthStencil: { format: DEPTH_FORMAT, depthCompare: 'always', depthWriteEnabled: false }
  });
  const [paint, erase] = await Promise.all([create(BLEND, 'gpu-webgpu'), create(ERASE, 'gpu-webgpu-erase')]);
  return { paint, erase };
}

/** A buffer holding `data` from the start. */
function bufferWith(device, data, usage) {
  const buffer = device.createBuffer({ size: data.byteLength, usage: usage | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

/** The shared GPU objects: the pipelines, corner and clip buffers, sampler and the 1x1 white texture. */
async function createResources(device, format) {
  const uniform = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const shared = { format, depthFormat: DEPTH_FORMAT, blend: { color: BLEND, alpha: BLEND }, clip: uniform };
  const layout = createQuadLayout(device);
  const [quads, meshes] = await Promise.all([
    createQuadPipelines(device, format, layout), createMeshes(device, { ...shared, compile, bufferWith })
  ]);
  const usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;
  const white = device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage });
  device.queue.writeTexture({ texture: white }, Uint8Array.of(255, 255, 255, 255), { bytesPerRow: 4 }, [1, 1]);
  return {
    layout,
    quads,
    meshes,
    white,
    uniform,
    corners: bufferWith(device, CORNERS, GPUBufferUsage.VERTEX),
    sampler: device.createSampler({
      magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge'
    })
  };
}

/** Upload one texture from its source: in place when the size is unchanged, else into a new one. */
function uploadTexture(state, id, source) {
  const width = source.videoWidth || source.naturalWidth || source.width;
  const height = source.videoHeight || source.naturalHeight || source.height;
  if (!width || !height) {
    logger.warn(`texture ${id} has no size yet; not uploaded`);
    return;
  }
  let entry = state.textures.get(id);
  if (!entry || entry.width !== width || entry.height !== height) {
    entry?.texture.destroy();
    const usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT;
    const texture = state.device.createTexture({ size: [width, height], format: 'rgba8unorm', usage });
    entry = { texture, width, height };
    state.textures.set(id, entry);
    state.groups.delete(id);
  }
  try {
    state.device.queue.copyExternalImageToTexture(
      { source, flipY: false }, { texture: entry.texture, premultipliedAlpha: false }, [width, height]);
  } catch (error) {
    logger.error(`texture ${id} upload failed`, error);
  }
}

/** The bind group for a batch's texture (null or unknown samples white), cached per id. */
function groupFor(state, id) {
  const cached = state.groups.get(id);
  if (cached) return cached;
  const texture = (id !== null && state.textures.get(id)?.texture) || state.resources.white;
  const { layout, uniform, sampler } = state.resources;
  const group = state.device.createBindGroup({
    layout,
    entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: sampler },
      { binding: 2, resource: texture.createView() }]
  });
  state.groups.set(id, group);
  return group;
}

/** Bring the instance buffer up to date: all of it into a new buffer when it outgrew the old, else `dirty`. */
function uploadInstances(state, frame) {
  const { instances, dirty } = frame;
  if (!state.instances || instances.byteLength > state.instances.size) {
    state.instances?.destroy();
    state.instances = bufferWith(state.device, instances, GPUBufferUsage.VERTEX);
    return;
  }
  if (!dirty) return;
  const first = Math.max(0, dirty[0]);
  const end = Math.min(dirty[1], instances.length / STRIDE);
  if (end <= first) return;
  const at = first * STRIDE;
  state.device.queue.writeBuffer(state.instances, at * 4, instances, at, (end - first) * STRIDE);
}

/** The depth texture for `target`'s size, recreated when that changes. */
function depthFor(state, target) {
  const { depth } = state;
  if (depth && depth.width === target.width && depth.height === target.height) return depth;
  depth?.destroy();
  const size = [target.width, target.height];
  state.depth = state.device.createTexture({ size, format: DEPTH_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT });
  return state.depth;
}

/** Each batch in list order: a quad run through the painting or erasing quad pipeline, a mesh through its own. */
function encodeBatches(state, pass, batches) {
  const { resources } = state;
  let meshIndex = 0;
  let bound = null;
  for (const batch of batches) {
    if ('mesh' in batch) {
      resources.meshes.draw(pass, batch, meshIndex++);
      bound = null;
      continue;
    }
    const pipeline = batch.erase ? resources.quads.erase : resources.quads.paint;
    if (bound !== pipeline) {
      pass.setPipeline(pipeline);
      pass.setVertexBuffer(0, resources.corners);
      pass.setVertexBuffer(1, state.instances);
      bound = pipeline;
    }
    pass.setBindGroup(0, groupFor(state, batch.texture));
    pass.draw(4, batch.count, 0, batch.first);
  }
}

/** Clear the current canvas texture and the depth buffer, then draw each batch over the ones before. */
function drawFrame(state, frame) {
  if (state.lost) return;
  const { device, context, resources } = state;
  uploadInstances(state, frame);
  device.queue.writeBuffer(resources.uniform, 0, frame.clip);
  resources.meshes.prepare(frame.batches);
  const target = context.getCurrentTexture();
  const [r, g, b, a] = frame.clear;
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r, g, b, a } }],
    depthStencilAttachment: {
      view: depthFor(state, target).createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard'
    }
  });
  encodeBatches(state, pass, frame.batches);
  pass.end();
  device.queue.submit([encoder.finish()]);
  state.target = target;
}

/** Rows without their 256-byte padding, top to bottom, BGRA swizzled to RGBA when `bgra`. */
function unpad(padded, width, height, bytesPerRow, bgra) {
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    data.set(padded.subarray(row * bytesPerRow, row * bytesPerRow + width * 4), row * width * 4);
  }
  if (!bgra) return data;
  for (let at = 0; at < data.length; at += 4) [data[at], data[at + 2]] = [data[at + 2], data[at]];
  return data;
}

/** The last frame's pixels: copy the drawn texture out now (same task as `draw`), map and unpad it after. */
async function readFrame(state) {
  const { device, target, format } = state;
  if (!target) throw new Error('gpu-webgpu: nothing drawn to read');
  const { width, height } = target;
  const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
  const usage = GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST;
  const buffer = device.createBuffer({ size: bytesPerRow * height, usage });
  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer({ texture: target }, { buffer, bytesPerRow }, [width, height]);
  device.queue.submit([encoder.finish()]);
  try {
    await buffer.mapAsync(GPUMapMode.READ);
    const data = unpad(new Uint8Array(buffer.getMappedRange()), width, height, bytesPerRow, format === 'bgra8unorm');
    buffer.unmap();
    return { width, height, data };
  } finally {
    buffer.destroy();
  }
}

/** Destroy every buffer and texture, meshes and depth included, then release the canvas. */
function destroyAll(state) {
  const { resources } = state;
  state.lost = true;
  state.target = null;
  state.instances?.destroy();
  state.depth?.destroy();
  resources.meshes.destroy();
  for (const { texture } of state.textures.values()) texture.destroy();
  state.textures.clear();
  state.groups.clear();
  for (const owned of [resources.corners, resources.uniform, resources.white]) owned.destroy();
  state.context.unconfigure();
}

/**
 * A WebGPU `GpuBackend` drawing into `canvas`; rejects when WebGPU, an adapter, a device or the canvas context is
 * missing. `options.powerPreference` is handed to `requestAdapter`.
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {{powerPreference?: 'low-power'|'high-performance'}} [options]
 * @returns {Promise<import('./gpu-scene.js').GpuBackend>}
 */
export async function createBackend(canvas, options = {}) {
  const { device, context, format } = await acquire(canvas, options);
  const resources = await createResources(device, format).catch((error) => {
    context.unconfigure();
    device.destroy();
    throw error;
  });
  const state = {
    device, context, format, resources, textures: new Map(), groups: new Map(),
    instances: null, depth: null, target: null, lost: false
  };
  device.lost.then((info) => {
    if (info.reason !== 'destroyed') logger.error(`device lost (${info.reason}): ${info.message}`);
    state.lost = true;
  });
  device.addEventListener('uncapturederror', (event) => logger.error('uncaptured error', event.error));
  return {
    kind: 'webgpu',
    depthRange: 'zero-to-one',
    texture: (id, source) => uploadTexture(state, id, source),
    dropTexture(id) {
      state.textures.get(id)?.texture.destroy();
      state.textures.delete(id);
      state.groups.delete(id);
    },
    mesh: (id, geometry) => resources.meshes.upload(id, geometry),
    dropMesh: (id) => resources.meshes.drop(id),
    draw: (frame) => drawFrame(state, frame),
    read: () => readFrame(state),
    destroy: () => destroyAll(state)
  };
}
