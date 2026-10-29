/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The GPU add-on's WebGL2 backend: a hand-written GLSL 300 es program draws a unit quad per instance
 * (TRIANGLE_STRIP, `drawArraysInstanced`) from the STRIDE-float records of `./gpu-scene.js`, one call per run;
 * WebGL2 has no base instance, so each run rebinds the instance attributes at its first record. Mesh batches go
 * to `./gpu-webgl2-mesh.js`. Textures are straight-alpha RGBA8, linear and clamped; both programs write
 * premultiplied, blended ONE, ONE_MINUS_SRC_ALPHA.
 */
import { FIELD, STRIDE } from './gpu-scene.js';
import { MESH_FRAGMENT_SOURCE, MESH_VERTEX_SOURCE, MeshPipeline } from './gpu-webgl2-mesh.js';
import { createLogger } from '../log.js';

const logger = /* @__PURE__ */ createLogger('gpu-webgl2');

/** Bytes per float, and per instance record. */
const FLOAT_BYTES = 4;
const RECORD_BYTES = STRIDE * FLOAT_BYTES;

/** The drawing buffer the contract reads back: premultiplied, a depth buffer for meshes, no multisampling, not
 * kept past compositing. */
const CONTEXT_ATTRIBUTES = /* @__PURE__ */ Object.freeze({
  alpha: true, premultipliedAlpha: true, depth: true, antialias: false, preserveDrawingBuffer: false
});

/** Location 0 is the quad corner; each `[location, components, field]` below reads one run of a record. */
const CORNER_LOCATION = 0;
const INSTANCE_ATTRIBUTES = /* @__PURE__ */ Object.freeze([
  [1, 4, FIELD.x], [2, 2, FIELD.z], [3, 4, FIELD.r], [4, 4, FIELD.u0]
]);

/** Corner `c` to `(x, y) + (w, h) * c`, turned clockwise on screen about the box centre, at depth `z`. */
const VERTEX_SOURCE = `#version 300 es
layout(location = 0) in vec2 corner;
layout(location = 1) in vec4 box;
layout(location = 2) in vec2 depthTurn;
layout(location = 3) in vec4 tint;
layout(location = 4) in vec4 uvRect;
uniform mat4 clip;
out vec2 uv;
out vec4 color;
void main() {
  vec2 halfSize = box.zw * 0.5;
  vec2 local = box.zw * corner - halfSize;
  float s = sin(depthTurn.y);
  float c = cos(depthTurn.y);
  vec2 turned = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  gl_Position = clip * vec4(box.xy + halfSize + turned, depthTurn.x, 1.0);
  uv = mix(uvRect.xy, uvRect.zw, corner);
  color = tint;
}
`;

/** Straight-alpha texel times tint, written premultiplied. */
const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
uniform sampler2D tex;
in vec2 uv;
in vec4 color;
out vec4 outColor;
void main() {
  vec4 c = texture(tex, uv) * color;
  outColor = vec4(c.rgb * c.a, c.a);
}
`;

/** Compile one stage; a failure logs the info log and throws. */
function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  const info = gl.getShaderInfoLog(shader);
  const stage = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
  gl.deleteShader(shader);
  logger.error(`${stage} shader failed to compile`, info);
  throw new Error(`gpu-webgl2: ${stage} shader failed to compile: ${info}`);
}

/** Compile and link one program; the shaders are released either way, the program on failure. */
function link(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  const shaders = [];
  try {
    shaders.push(compile(gl, gl.VERTEX_SHADER, vertexSource));
    shaders.push(compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
    for (const shader of shaders) gl.attachShader(program, shader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      logger.error('program failed to link', info);
      throw new Error(`gpu-webgl2: program failed to link: ${info}`);
    }
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    for (const shader of shaders) gl.deleteShader(shader);
  }
}

/** Link each `[vertex, fragment]` pair; a failure deletes the ones already linked, then throws. */
function linkAll(gl, pairs) {
  const programs = [];
  try {
    for (const [vertexSource, fragmentSource] of pairs) programs.push(link(gl, vertexSource, fragmentSource));
    return programs;
  } catch (error) {
    for (const program of programs) gl.deleteProgram(program);
    throw error;
  }
}

/** The vertex array: a static unit-quad corner buffer, and the instance buffer whose pointers each batch sets. */
function createGeometry(gl) {
  const vao = gl.createVertexArray();
  const corners = gl.createBuffer();
  const instances = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.bufferData(gl.ARRAY_BUFFER, Float32Array.of(0, 0, 1, 0, 0, 1, 1, 1), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(CORNER_LOCATION);
  gl.vertexAttribPointer(CORNER_LOCATION, 2, gl.FLOAT, false, 0, 0);
  for (const [location] of INSTANCE_ATTRIBUTES) {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribDivisor(location, 1);
  }
  gl.bindVertexArray(null);
  return { vao, corners, instances };
}

/** A new texture, bound to TEXTURE_2D: linear filtering, clamped edges, no mipmaps. */
function createTexture(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

/** Both programs, the quad geometry, a 1x1 white texture and the fixed pipeline state for a fresh context. */
function createState(gl, canvas) {
  const [program, meshProgram] = linkAll(gl, [
    [VERTEX_SOURCE, FRAGMENT_SOURCE], [MESH_VERTEX_SOURCE, MESH_FRAGMENT_SOURCE]
  ]);
  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program, 'tex'), 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthFunc(gl.LEQUAL);
  gl.clearDepth(1);
  gl.disable(gl.CULL_FACE);
  const white = createTexture(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, Uint8Array.of(255, 255, 255, 255));
  return {
    gl, canvas, program, white, ...createGeometry(gl),
    meshes: new MeshPipeline(gl, meshProgram),
    clip: gl.getUniformLocation(program, 'clip'),
    textures: new Map(),
    instanceBytes: 0,
    lost: false, destroyed: false
  };
}

/** A source's pixel size: `videoWidth || naturalWidth || width`, and likewise for height. */
function sizeOf(source) {
  return [
    source.videoWidth || source.naturalWidth || source.width,
    source.videoHeight || source.naturalHeight || source.height
  ];
}

/** Upload texture `id` from `source`: in place when its size is unchanged, else (re)allocated. */
function uploadTexture(state, id, source) {
  const { gl, textures } = state;
  if (state.lost || state.destroyed) return;
  let entry = textures.get(id);
  if (!entry) {
    entry = { texture: createTexture(gl), width: -1, height: -1 };
    textures.set(id, entry);
  }
  const [width, height] = sizeOf(source);
  gl.bindTexture(gl.TEXTURE_2D, entry.texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  // A cross-origin source without CORS is refused (SecurityError): logged, and the texture keeps what it had.
  try {
    if (entry.width === width && entry.height === height) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
      return;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    entry.width = width;
    entry.height = height;
  } catch (error) {
    logger.warn(`texture ${id} could not be uploaded`, error);
  }
}

/** Delete texture `id`; an unknown id is ignored. */
function dropTexture(state, id) {
  const entry = state.textures.get(id);
  if (!entry) return;
  state.textures.delete(id);
  if (!state.destroyed) state.gl.deleteTexture(entry.texture);
}

/** Bind and update the instance buffer: all of it when it grew, else a non-empty dirty range (0 = to the end). */
function uploadInstances(state, frame) {
  const { gl } = state;
  const { instances, dirty } = frame;
  gl.bindBuffer(gl.ARRAY_BUFFER, state.instances);
  if (instances.byteLength > state.instanceBytes) {
    gl.bufferData(gl.ARRAY_BUFFER, instances, gl.DYNAMIC_DRAW);
    state.instanceBytes = instances.byteLength;
  } else if (dirty && dirty[1] > dirty[0]) {
    const [first, end] = dirty;
    gl.bufferSubData(gl.ARRAY_BUFFER, first * RECORD_BYTES, instances, first * STRIDE, (end - first) * STRIDE);
  }
}

/** Point the instance attributes at record `first` of the bound buffer: WebGL2's stand-in for a base instance. */
function pointInstances(gl, first) {
  const base = first * RECORD_BYTES;
  for (const [location, components, field] of INSTANCE_ATTRIBUTES) {
    gl.vertexAttribPointer(location, components, gl.FLOAT, false, RECORD_BYTES, base + field * FLOAT_BYTES);
  }
}

/** The texture a batch samples: its uploaded one, else (null, or never uploaded) white. */
function textureFor(state, id) {
  return (id !== null && state.textures.get(id)?.texture) || state.white;
}

/** One run of quads, depth neither tested nor written. */
function drawQuads(state, batch) {
  const { gl } = state;
  if (batch.count <= 0) return;
  gl.useProgram(state.program);
  gl.disable(gl.DEPTH_TEST);
  gl.bindVertexArray(state.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, state.instances);
  gl.bindTexture(gl.TEXTURE_2D, textureFor(state, batch.texture));
  pointInstances(gl, batch.first);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, batch.count);
  gl.bindVertexArray(null);
}

/** Clear colour and depth over the whole canvas, update the instances, then draw each batch over the ones before
 * (a quad run - erasing when `erase` - or a mesh when it has `mesh`); a no-op while lost. */
function drawFrame(state, frame) {
  const { gl, canvas } = state;
  if (state.lost || state.destroyed) return;
  const [r, g, b, a] = frame.clear;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(r, g, b, a);
  gl.depthMask(true);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  uploadInstances(state, frame);
  gl.useProgram(state.program);
  gl.uniformMatrix4fv(state.clip, false, frame.clip);
  state.meshes.begin(frame.clip);
  gl.activeTexture(gl.TEXTURE0);
  for (const batch of frame.batches) {
    const mesh = 'mesh' in batch;
    // An erase run clears what is under it by its coverage; everything else paints over.
    gl.blendFunc(!mesh && batch.erase === true ? gl.ZERO : gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (mesh) state.meshes.draw(batch);
    else drawQuads(state, batch);
  }
}

/** GL's bottom-to-top rows, top to bottom, in a new array. */
function flipRows(pixels, width, height) {
  const row = width * 4;
  const flipped = new Uint8Array(pixels.length);
  for (let y = 0; y < height; y += 1) {
    flipped.set(pixels.subarray((height - 1 - y) * row, (height - y) * row), y * row);
  }
  return flipped;
}

/** The drawing buffer, read at once (before compositing clears it): RGBA8 premultiplied, top row first. */
function readFrame(state) {
  const { gl, canvas } = state;
  const { width, height } = canvas;
  const pixels = new Uint8Array(width * height * 4);
  if (!state.lost && !state.destroyed) gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return Promise.resolve({ width, height, data: flipRows(pixels, width, height) });
}

/** Delete every GL object; later calls are no-ops. */
function destroyState(state) {
  const { gl } = state;
  if (state.destroyed) return;
  for (const entry of state.textures.values()) gl.deleteTexture(entry.texture);
  state.textures.clear();
  gl.deleteTexture(state.white);
  gl.deleteBuffer(state.corners);
  gl.deleteBuffer(state.instances);
  gl.deleteVertexArray(state.vao);
  gl.deleteProgram(state.program);
  state.meshes.destroy();
  state.destroyed = true;
  // Hand the context back now rather than at the browser's leisure: pages cap how many are live.
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}

/**
 * A WebGL2 `GpuBackend` (see `./gpu-scene.js`) drawing into `canvas`; rejects when the canvas has no WebGL2
 * context. On `webglcontextlost` drawing and uploads stop (the loss is logged) until the backend is destroyed.
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {object} [options] none are read by this backend
 * @returns {Promise<import('./gpu-scene.js').GpuBackend>}
 */
export async function createBackend(canvas, options = {}) {
  const gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
  if (!gl || gl.isContextLost()) throw new Error('gpu-webgl2: no WebGL2 context on this canvas');
  const state = createState(gl, canvas);
  const onLost = (event) => {
    event.preventDefault();
    state.lost = true;
    logger.warn('WebGL2 context lost; drawing stops');
  };
  canvas.addEventListener('webglcontextlost', onLost);
  return Object.freeze({
    kind: 'webgl2',
    depthRange: 'minus-one-to-one',
    texture: (id, source) => uploadTexture(state, id, source),
    dropTexture: (id) => dropTexture(state, id),
    mesh: (id, geometry) => {
      if (!state.lost && !state.destroyed) state.meshes.upload(id, geometry);
    },
    dropMesh: (id) => {
      if (!state.destroyed) state.meshes.drop(id);
    },
    draw: (frame) => drawFrame(state, frame),
    read: () => readFrame(state),
    destroy: () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      destroyState(state);
    }
  });
}
