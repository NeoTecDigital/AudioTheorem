/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The WebGL2 backend's mesh pipeline (`./gpu-webgl2.js`): each mesh batch draws its indexed triangles of
 * MESH_STRIDE-float vertices at `clip * transform`, shaded by LIGHT through the normal matrix when lit, written
 * premultiplied. Meshes test depth less-equal and write it; the quads between them leave depth alone.
 */
import { LIGHT, MESH_STRIDE } from './gpu-scene.js';
import { createLogger } from '../log.js';

const logger = /* @__PURE__ */ createLogger('gpu-webgl2');

const FLOAT_BYTES = 4;
const POSITION_LOCATION = 0;
const NORMAL_LOCATION = 1;

/** A vertex to `clip * transform * (p, 1)`; its normal through the transform's inverse transpose. */
export const MESH_VERTEX_SOURCE = `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
uniform mat4 clip;
uniform mat4 transform;
uniform mat3 normalMatrix;
out vec3 turnedNormal;
void main() {
  gl_Position = clip * transform * vec4(position, 1.0);
  turnedNormal = normalMatrix * normal;
}
`;

/** `color` times the shade (0.35 ambient + 0.65 diffuse when lit; a zero normal gets the ambient), premultiplied. */
export const MESH_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
uniform vec4 color;
uniform bool lit;
uniform vec3 light;
in vec3 turnedNormal;
out vec4 outColor;
void main() {
  float facing = dot(turnedNormal, turnedNormal) > 0.0 ? dot(normalize(turnedNormal), normalize(light)) : 0.0;
  float shade = lit ? 0.35 + 0.65 * max(facing, 0.0) : 1.0;
  outColor = vec4(color.rgb * shade * color.a, color.a);
}
`;

/** The GL index type for a geometry's indices, or null when they are neither Uint16Array nor Uint32Array. */
function indexTypeOf(gl, geometry) {
  if (!(geometry?.vertices instanceof Float32Array)) return null;
  if (geometry.indices instanceof Uint16Array) return gl.UNSIGNED_SHORT;
  if (geometry.indices instanceof Uint32Array) return gl.UNSIGNED_INT;
  return null;
}

/** The meshes of one context over a linked mesh program: upload, drop, draw, destroy. */
export class MeshPipeline {
  #gl;
  #program;
  #uniforms;
  #meshes = new Map();

  constructor(gl, program) {
    const at = (name) => gl.getUniformLocation(program, name);
    this.#gl = gl;
    this.#program = program;
    this.#uniforms = {
      clip: at('clip'), transform: at('transform'), normal: at('normalMatrix'), color: at('color'), lit: at('lit')
    };
    gl.useProgram(program);
    gl.uniform3fv(at('light'), LIGHT);
  }

  /** Upload geometry `id`, replacing what it had; geometry off the contract is logged and leaves it as it was. */
  upload(id, geometry) {
    const gl = this.#gl;
    const type = indexTypeOf(gl, geometry);
    if (type === null) {
      logger.warn(`mesh ${id} skipped: expected {vertices: Float32Array, indices: Uint16Array|Uint32Array}`);
      return;
    }
    const entry = this.#meshes.get(id) ?? this.#create(id);
    gl.bindVertexArray(entry.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, entry.vertices);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, entry.indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    entry.type = type;
    entry.count = geometry.indices.length;
  }

  /** Delete geometry `id`; an unknown id is ignored. */
  drop(id) {
    const entry = this.#meshes.get(id);
    if (!entry) return;
    this.#meshes.delete(id);
    this.#delete(entry);
  }

  /** Set the frame's clip matrix. */
  begin(clip) {
    this.#gl.useProgram(this.#program);
    this.#gl.uniformMatrix4fv(this.#uniforms.clip, false, clip);
  }

  /** Draw one mesh batch, depth-tested less-equal and written; one whose geometry never arrived draws nothing. */
  draw(batch) {
    const gl = this.#gl;
    const entry = this.#meshes.get(batch.mesh);
    if (!entry || entry.count === 0) return;
    const uniforms = this.#uniforms;
    gl.useProgram(this.#program);
    gl.enable(gl.DEPTH_TEST);
    gl.uniformMatrix4fv(uniforms.transform, false, batch.transform);
    gl.uniformMatrix3fv(uniforms.normal, false, batch.normal);
    gl.uniform4fv(uniforms.color, batch.color);
    gl.uniform1i(uniforms.lit, batch.lit ? 1 : 0);
    gl.bindVertexArray(entry.vao);
    gl.drawElements(gl.TRIANGLES, entry.count, entry.type, 0);
    gl.bindVertexArray(null);
  }

  /** Delete every mesh and the program. */
  destroy() {
    for (const entry of this.#meshes.values()) this.#delete(entry);
    this.#meshes.clear();
    this.#gl.deleteProgram(this.#program);
  }

  /** A mesh's vertex array over its own vertex and index buffers, attributes pointed at the interleaved layout. */
  #create(id) {
    const gl = this.#gl;
    const entry = { vao: gl.createVertexArray(), vertices: gl.createBuffer(), indices: gl.createBuffer(), count: 0 };
    const stride = MESH_STRIDE * FLOAT_BYTES;
    gl.bindVertexArray(entry.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, entry.vertices);
    gl.enableVertexAttribArray(POSITION_LOCATION);
    gl.vertexAttribPointer(POSITION_LOCATION, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(NORMAL_LOCATION);
    gl.vertexAttribPointer(NORMAL_LOCATION, 3, gl.FLOAT, false, stride, 3 * FLOAT_BYTES);
    gl.bindVertexArray(null);
    this.#meshes.set(id, entry);
    return entry;
  }

  #delete(entry) {
    this.#gl.deleteVertexArray(entry.vao);
    this.#gl.deleteBuffer(entry.vertices);
    this.#gl.deleteBuffer(entry.indices);
  }
}
