/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The WebGPU backend's mesh pipeline (`./gpu-webgpu.js`): indexed triangles of MESH_STRIDE-float vertices, placed
 * by each mesh batch's transform, shaded toward LIGHT when lit (ambient only where the turned normal is zero),
 * tested and written against the pass's depth buffer.
 * One uniform buffer holds every mesh batch of a frame, each in its own slot, bound at a dynamic offset.
 */
import { LIGHT, MESH_STRIDE } from './gpu-scene.js';
import { createLogger } from '../log.js';

const logger = /* @__PURE__ */ createLogger('gpu-webgpu-mesh');

/** Bytes of one mesh's uniforms as WGSL lays out `Mesh`: mat4 (64), mat3 as three 16-byte columns (48), vec4, f32. */
const UNIFORM_BYTES = 144;

/** Where each uniform sits, in floats. */
const AT = /* @__PURE__ */ Object.freeze({ transform: 0, normal: 16, color: 28, lit: 32 });

const SHADER = `
struct Mesh {
  transform: mat4x4f,
  normal: mat3x3f,
  color: vec4f,
  lit: f32,
};

struct Varyings {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
};

const LIGHT = vec3f(${LIGHT.join(', ')});

@group(0) @binding(0) var<uniform> clip: mat4x4f;
@group(0) @binding(1) var<uniform> item: Mesh;

@vertex
fn vs(@location(0) p: vec3f, @location(1) n: vec3f) -> Varyings {
  var v: Varyings;
  v.position = clip * item.transform * vec4f(p, 1.0);
  v.normal = item.normal * n;
  return v;
}

@fragment
fn fs(v: Varyings) -> @location(0) vec4f {
  let facing = select(0.0, dot(normalize(v.normal), normalize(LIGHT)), dot(v.normal, v.normal) > 0.0);
  let shade = select(1.0, 0.35 + 0.65 * max(facing, 0.0), item.lit > 0.5);
  return vec4f(item.color.rgb * shade * item.color.a, item.color.a);
}
`;

/** Position then normal, MESH_STRIDE floats per vertex. */
const VERTEX_LAYOUT = /* @__PURE__ */ Object.freeze({
  arrayStride: MESH_STRIDE * 4,
  stepMode: 'vertex',
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' },
    { shaderLocation: 1, offset: 12, format: 'float32x3' }
  ]
});

/** The shared clip, then one mesh's uniforms at a dynamic offset. */
function createLayout(device) {
  return device.createBindGroupLayout({
    label: 'gpu-webgpu-mesh',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: UNIFORM_BYTES }
      }
    ]
  });
}

/** The mesh pipeline: triangle lists, no culling, depth less-equal and written, the quads' blend. */
async function createPipeline(device, shared, layout) {
  const module = await shared.compile(device, SHADER, 'gpu-webgpu-mesh');
  return device.createRenderPipelineAsync({
    label: 'gpu-webgpu-mesh',
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    vertex: { module, entryPoint: 'vs', buffers: [VERTEX_LAYOUT] },
    fragment: { module, entryPoint: 'fs', targets: [{ format: shared.format, blend: shared.blend }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: shared.depthFormat, depthCompare: 'less-equal', depthWriteEnabled: true }
  });
}

/** Replace geometry `id`; Uint16 indices of odd count are padded to the 4-byte multiple a buffer write needs. */
function uploadGeometry(state, id, geometry) {
  dropGeometry(state, id);
  const { vertices, indices } = geometry ?? {};
  if (!(vertices instanceof Float32Array) || !(indices instanceof Uint16Array || indices instanceof Uint32Array)) {
    logger.warn(`mesh ${id} needs Float32Array vertices and Uint16Array or Uint32Array indices; not uploaded`);
    return;
  }
  if (!vertices.length || !indices.length) {
    logger.warn(`mesh ${id} has no triangles; not uploaded`);
    return;
  }
  const format = indices instanceof Uint32Array ? 'uint32' : 'uint16';
  let data = indices;
  if (indices.byteLength % 4 !== 0) {
    data = new Uint16Array(indices.length + 1);
    data.set(indices);
  }
  const { device, shared } = state;
  state.geometries.set(id, {
    vertices: shared.bufferWith(device, vertices, GPUBufferUsage.VERTEX),
    indices: shared.bufferWith(device, data, GPUBufferUsage.INDEX),
    format,
    count: indices.length
  });
}

/** Free geometry `id`; an unknown id is ignored. */
function dropGeometry(state, id) {
  const geometry = state.geometries.get(id);
  if (!geometry) return;
  geometry.vertices.destroy();
  geometry.indices.destroy();
  state.geometries.delete(id);
}

/** Room for `count` mesh slots: a bigger uniform buffer and staging array, and the bind group over them. */
function reserve(state, count) {
  if (count <= state.capacity) return;
  const { device } = state;
  state.capacity = Math.max(count, state.capacity * 2, 8);
  state.uniforms?.destroy();
  const usage = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
  state.uniforms = device.createBuffer({ size: state.capacity * state.slot, usage });
  state.staging = new Float32Array((state.capacity * state.slot) / 4);
  state.group = device.createBindGroup({
    layout: state.layout,
    entries: [
      { binding: 0, resource: { buffer: state.shared.clip } },
      { binding: 1, resource: { buffer: state.uniforms, size: UNIFORM_BYTES } }
    ]
  });
}

/** One batch's uniforms at float `at`: the normal matrix's columns each padded to four floats. */
function pack(data, at, { transform, normal, color, lit }) {
  data.set(transform, at + AT.transform);
  for (let col = 0; col < 3; col += 1) data.set(normal.subarray(col * 3, col * 3 + 3), at + AT.normal + col * 4);
  data.set(color, at + AT.color);
  data[at + AT.lit] = lit ? 1 : 0;
}

/** Write every mesh batch's uniforms, in batch order, with one buffer write. */
function writeUniforms(state, batches) {
  const meshes = batches.filter((batch) => 'mesh' in batch);
  if (meshes.length === 0) return;
  reserve(state, meshes.length);
  const stride = state.slot / 4;
  meshes.forEach((batch, index) => pack(state.staging, index * stride, batch));
  state.device.queue.writeBuffer(state.uniforms, 0, state.staging, 0, meshes.length * stride);
}

/** Draw the `index`-th mesh batch of the frame; one whose geometry is unknown draws nothing. */
function drawMesh(state, pass, batch, index) {
  const geometry = state.geometries.get(batch.mesh);
  if (!geometry) return;
  pass.setPipeline(state.pipeline);
  pass.setBindGroup(0, state.group, [index * state.slot]);
  pass.setVertexBuffer(0, geometry.vertices);
  pass.setIndexBuffer(geometry.indices, geometry.format);
  pass.drawIndexed(geometry.count);
}

/** Free every geometry and the uniform buffer. */
function destroyMeshes(state) {
  for (const id of Array.from(state.geometries.keys())) dropGeometry(state, id);
  state.uniforms?.destroy();
  Object.assign(state, { uniforms: null, group: null, capacity: 0 });
}

/**
 * The mesh half of a WebGPU backend, drawn in the backend's pass: `upload(id, geometry)`, `drop(id)`,
 * `prepare(batches)` before the pass, `draw(pass, batch, index)` per mesh batch within it, `destroy()`.
 * @param {GPUDevice} device
 * @param {{format: string, depthFormat: string, blend: object, clip: GPUBuffer,
 *   compile: (device: GPUDevice, code: string, label: string) => Promise<GPUShaderModule>,
 *   bufferWith: (device: GPUDevice, data: ArrayBufferView, usage: number) => GPUBuffer}} shared the backend's
 *   target formats, blend, clip uniform buffer and helpers
 */
export async function createMeshes(device, shared) {
  const layout = createLayout(device);
  const pipeline = await createPipeline(device, shared, layout);
  const align = device.limits.minUniformBufferOffsetAlignment;
  const state = {
    device, shared, layout, pipeline, geometries: new Map(), slot: Math.ceil(UNIFORM_BYTES / align) * align,
    uniforms: null, staging: null, group: null, capacity: 0
  };
  return {
    upload: (id, geometry) => uploadGeometry(state, id, geometry),
    drop: (id) => dropGeometry(state, id),
    prepare: (batches) => writeUniforms(state, batches),
    draw: (pass, batch, index) => drawMesh(state, pass, batch, index),
    destroy: () => destroyMeshes(state)
  };
}
