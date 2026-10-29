/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The GPU scene: what a `gpu` root draws, packed for a backend. A quad record (a blit's global box, depth,
 * rotation, tint, texture and uv rect) becomes STRIDE floats in one instance array; a mesh record (geometry, a
 * transform, a colour) becomes one batch of its own. Both sit in one draw order (by `z`, then first seen), the
 * quads cut into runs of one texture. A move rewrites that one record and reports the range it touched; only an
 * insert, a removal, or a new `z`, texture or geometry re-sorts. This module is the contract
 * both backends (`./gpu-webgl2.js`, `./gpu-webgpu.js`) draw from; `./gpu.js` fills it from blits.
 */
import { multiply } from '../core/camera.js';

/** Floats per instance. */
export const STRIDE = 16;

/** Floats per mesh vertex: position `x, y, z`, then normal `nx, ny, nz`, in mesh units. */
export const MESH_STRIDE = 6;

/** The light a lit mesh is shaded by: a direction in canvas space (y down, z toward the viewer). */
export const LIGHT = /* @__PURE__ */ Object.freeze([-0.4, -0.6, 0.7]);

/** Where each field sits in an instance; 6 and 7 are reserved (zero). */
export const FIELD = /* @__PURE__ */ Object.freeze({
  x: 0, y: 1, w: 2, h: 3, z: 4, rotation: 5, r: 8, g: 9, b: 10, a: 11, u0: 12, v0: 13, u1: 14, v1: 15
});

/**
 * One frame for a backend.
 * @typedef {object} GpuFrame
 * @property {Float32Array} clip column-major 4x4: a canvas point (x, y, z, 1) in CSS px to clip space, depth in
 *   the backend's `depthRange`
 * @property {Float32Array} instances STRIDE floats per instance, draw order; `count` are live, the rest capacity
 * @property {number} count
 * @property {[number, number]|null} dirty the instance range [first, end) changed since the last frame, or null.
 *   A backend whose buffer is smaller than `instances` reallocates and uploads all of it.
 * @property {Array<{texture: number|null, first: number, count: number, erase?: true}|{mesh: number,
 *   transform: Float32Array, normal: Float32Array, color: number[], lit: boolean}>} batches drawn in order, each
 *   alpha-blended over the ones before: a run of quads (`texture` null samples white; `erase` clears instead - see
 *   below), or one mesh - `transform` (mat4, column-major) takes
 *   its vertices to canvas px, `normal` (mat3, column-major) is that transform's inverse transpose
 * @property {[number, number, number, number]} clear premultiplied RGBA the frame starts from
 */

/**
 * What `createBackend(canvas, options)` resolves to (it rejects when the API, an adapter or a context is missing).
 * Every frame covers the whole canvas (`canvas.width` x `canvas.height`, set by the caller) and clears first.
 * The shader: the unit quad's corner `c` maps to `(x, y) + (w, h) * c`, turned by `rotation` (radians,
 * clockwise on screen) about the box centre, at depth `z`, through `clip`; uv is `mix((u0, v0), (u1, v1), c)`
 * (v = 0 is the top row); colour is `texture(uv) * (r, g, b, a)`, straight alpha, written premultiplied and
 * blended ONE, ONE_MINUS_SRC_ALPHA; no depth test, no face culling. A mesh batch draws its indexed triangles at
 * `clip * transform * (x, y, z, 1)`, coloured `color` (straight) times a shade - `lit`: 0.35 + 0.65 * max(dot(
 * normalize(normal * n), normalize(LIGHT)), 0), else 1 - written premultiplied with the same blend. Meshes test
 * depth less-equal and write it, against a depth buffer cleared to far each frame; quads never test or write it.
 * `clipMatrix` puts nearer points at smaller depth. A quad run with `erase: true` punches a hole instead of painting:
 * the same fragment, blended ZERO, ONE_MINUS_SRC_ALPHA on colour and alpha, so what is under it is cleared by its
 * coverage (texture alpha times tint alpha) - the DOM under an `over` canvas shows through.
 * @typedef {object} GpuBackend
 * @property {'webgl2'|'webgpu'} kind
 * @property {'minus-one-to-one'|'zero-to-one'} depthRange for `clipMatrix`
 * @property {(id: number, source: object) => void} texture upload texture `id` from an image, canvas, video,
 *   ImageBitmap or OffscreenCanvas (size: `videoWidth || naturalWidth || width`); again re-uploads it, in place
 *   when the size is unchanged. Straight alpha, no flip, linear filtering, clamp to edge.
 * @property {(id: number) => void} dropTexture
 * @property {(id: number, geometry: {vertices: Float32Array, indices: Uint16Array|Uint32Array}) => void} mesh
 *   upload geometry `id`: MESH_STRIDE floats per vertex, indexed triangles
 * @property {(id: number) => void} dropMesh
 * @property {(frame: GpuFrame) => void} draw
 * @property {() => Promise<{width: number, height: number, data: Uint8Array}>} read the last frame's pixels,
 *   RGBA8 premultiplied, rows top to bottom; called in the same task as `draw`
 * @property {() => void} destroy
 */

/** Canvas to clip space: `camera.projected`, then the host box to [-1, 1] (y up), depth scaled into `depthRange`
 * (WebGPU's `zero-to-one`, else WebGL's `-1..1`) - nearer is smaller - far enough out that a tilted board is never
 * clipped; what comes within a fifth of the perspective of the viewer is. */
export function clipMatrix(camera, hostRect = {}, depthRange = 'minus-one-to-one') {
  const w = hostRect.width || 800;
  const h = hostRect.height || 600;
  const depth = -1 / (4 * (camera.perspective ?? 2000));
  const ndc = Float64Array.of(2 / w, 0, 0, 0, 0, -2 / h, 0, 0, 0, 0, depth, 0, -1, 1, 0, 1);
  if (depthRange === 'zero-to-one') {
    ndc[10] = depth / 2;
    ndc[14] = 0.5;
  }
  return Float32Array.from(multiply(ndc, camera.projected(hostRect)));
}

const WHITE = /* @__PURE__ */ Object.freeze([1, 1, 1, 1]);
const WHOLE = /* @__PURE__ */ Object.freeze([0, 0, 1, 1]);
const IDENTITY = /* @__PURE__ */ Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** The inverse transpose of a mat4's upper 3x3, column-major: what turns a normal (shading needs only its
 * direction). A singular transform gives zeros. */
export function normalMatrix(t) {
  const at = (row, col) => t[col * 4 + row];
  const cofactor = (row, col) => {
    const [r0, r1] = [0, 1, 2].filter((r) => r !== row);
    const [c0, c1] = [0, 1, 2].filter((c) => c !== col);
    const minor = at(r0, c0) * at(r1, c1) - at(r0, c1) * at(r1, c0);
    return (row + col) % 2 === 0 ? minor : -minor;
  };
  const det = at(0, 0) * cofactor(0, 0) + at(0, 1) * cofactor(0, 1) + at(0, 2) * cofactor(0, 2);
  const out = new Float32Array(9);
  for (let col = 0; col < 3; col += 1) {
    for (let row = 0; row < 3; row += 1) out[col * 3 + row] = det ? cofactor(row, col) / det : 0;
  }
  return out;
}

/**
 * Sources counted by the records using them: a new one is queued to upload, one let go is dropped at `take()`
 * only if nothing took it again meanwhile (a trait restart, a frame flip), and never dropped if never sent.
 */
class Pool {
  #entries = new Map();
  #uploads = new Map();
  #idle = new Set();
  #sent = new Set();
  #next = 1;

  get pending() { return this.#uploads.size > 0 || this.#idle.size > 0; }

  retain(source) {
    if (!source) return null;
    let entry = this.#entries.get(source);
    if (!entry) {
      entry = { id: this.#next++, refs: 0 };
      this.#entries.set(source, entry);
      this.#uploads.set(entry.id, source);
    }
    entry.refs += 1;
    this.#idle.delete(source);
    return entry.id;
  }

  release(source) {
    const entry = source && this.#entries.get(source);
    if (entry && (entry.refs -= 1) === 0) this.#idle.add(source);
  }

  /** Send a source again (a new frame of a video, a redrawn canvas). */
  refresh(source) {
    const entry = this.#entries.get(source);
    if (entry) this.#uploads.set(entry.id, source);
  }

  /** @returns {{uploads: Array<[number, object]>, drops: number[]}} */
  take() {
    const drops = [];
    for (const source of this.#idle) {
      const { id } = this.#entries.get(source);
      this.#entries.delete(source);
      this.#uploads.delete(id);
      if (this.#sent.delete(id)) drops.push(id);
    }
    this.#idle.clear();
    const uploads = Array.from(this.#uploads);
    this.#uploads.clear();
    for (const [id] of uploads) this.#sent.add(id);
    return { uploads, drops };
  }
}

/** The source a record draws from, and the pool it is counted in. */
const sourceOf = (record) => (record.mesh ? record.mesh : (record.texture ?? null));

/**
 * Records keyed by any object (a blit's state), packed on demand. `set(key, record)` takes a quad -
 * `{x, y, w, h, z?, rotation?, color?: [r, g, b, a] (0..1), texture?: source|null, uv?: [u0, v0, u1, v1],
 * version?, erase?}`, where a new `version` on the same texture re-uploads it (a video frame, a redrawn canvas) - or a
 * mesh, `{mesh: {vertices, indices}, transform?: mat4, z?, color?, lit?: true}`.
 */
export class Scene {
  #records = new Map();
  #textures = new Pool();
  #geometries = new Pool();
  #order = [];
  #quads = 0;
  #data = new Float32Array(STRIDE * 64);
  #batches = [];
  #changed = new Set();
  #resort = false;
  #seq = 0;

  get size() { return this.#records.size; }

  has(key) { return this.#records.has(key); }

  keys() { return this.#records.keys(); }

  /** Whether `pack()` has anything new to hand over. */
  get dirty() {
    return this.#resort || this.#changed.size > 0 || this.#textures.pending || this.#geometries.pending;
  }

  #poolOf(record) {
    return record.mesh ? this.#geometries : this.#textures;
  }

  set(key, record) {
    const entry = this.#records.get(key);
    const source = sourceOf(record);
    if (!entry) {
      this.#records.set(key, { record, seq: this.#seq++, slot: -1, id: this.#poolOf(record).retain(source), batch: null });
      this.#resort = true;
      return;
    }
    const was = entry.record;
    if (source !== sourceOf(was) || Boolean(record.mesh) !== Boolean(was.mesh)) {
      // Take the new source before letting the old go, so one both share is never dropped in between.
      entry.id = this.#poolOf(record).retain(source);
      this.#poolOf(was).release(sourceOf(was));
      entry.batch = null;
      this.#resort = true;
    } else if (!record.mesh && source && record.version !== was.version) {
      this.#textures.refresh(source);
    }
    if ((was.z ?? 0) !== (record.z ?? 0) || Boolean(was.erase) !== Boolean(record.erase)) this.#resort = true;
    entry.record = record;
    this.#changed.add(entry);
  }

  delete(key) {
    const entry = this.#records.get(key);
    if (!entry) return false;
    this.#records.delete(key);
    this.#poolOf(entry.record).release(sourceOf(entry.record));
    this.#changed.delete(entry);
    this.#resort = true;
    return true;
  }

  /**
   * Hand over what changed: the instance array and its dirty range, the batches, and the texture and geometry
   * uploads and drops a backend must apply first. @returns {{instances: Float32Array, count: number,
   * dirty: [number, number]|null, batches: Array, uploads: Array<[number, object]>, drops: number[],
   * meshUploads: Array<[number, object]>, meshDrops: number[]}}
   */
  pack() {
    let dirty = null;
    if (this.#resort) {
      this.#sort();
      dirty = [0, this.#quads];
    } else if (this.#changed.size > 0) {
      let first = Infinity;
      let end = 0;
      for (const entry of this.#changed) {
        if (entry.record.mesh) {
          this.#writeMesh(entry);
          continue;
        }
        this.#write(entry);
        first = Math.min(first, entry.slot);
        end = Math.max(end, entry.slot + 1);
      }
      if (end > 0) dirty = [first, end];
    }
    this.#changed.clear();
    const textures = this.#textures.take();
    const geometries = this.#geometries.take();
    return {
      instances: this.#data, count: this.#quads, dirty, batches: this.#batches,
      uploads: textures.uploads, drops: textures.drops, meshUploads: geometries.uploads, meshDrops: geometries.drops
    };
  }

  /** Re-sort by z then first seen, rewrite every quad slot and mesh batch, and re-cut the batches. */
  #sort() {
    this.#order = Array.from(this.#records.values()).sort((a, b) => ((a.record.z ?? 0) - (b.record.z ?? 0)) || a.seq - b.seq);
    const quads = this.#order.filter((entry) => !entry.record.mesh).length;
    if (this.#data.length < quads * STRIDE) {
      this.#data = new Float32Array(Math.max(quads, this.#data.length / STRIDE * 2) * STRIDE);
    }
    const batches = [];
    let slot = 0;
    for (const entry of this.#order) {
      if (entry.record.mesh) {
        batches.push(this.#writeMesh(entry));
        continue;
      }
      entry.slot = slot;
      this.#write(entry);
      const last = batches[batches.length - 1];
      const erase = entry.record.erase === true;
      if (last && !('mesh' in last) && last.texture === entry.id && Boolean(last.erase) === erase) last.count += 1;
      else batches.push(erase ? { texture: entry.id, first: slot, count: 1, erase } : { texture: entry.id, first: slot, count: 1 });
      slot += 1;
    }
    this.#quads = slot;
    this.#batches = batches;
    this.#resort = false;
  }

  /** One record into its slot, field by field (no array made per write: this runs for every move). */
  #write(entry) {
    const { record } = entry;
    const data = this.#data;
    const at = entry.slot * STRIDE;
    const color = record.color ?? WHITE;
    const uv = record.uv ?? WHOLE;
    data[at] = record.x;
    data[at + 1] = record.y;
    data[at + 2] = record.w;
    data[at + 3] = record.h;
    data[at + 4] = record.z ?? 0;
    data[at + 5] = record.rotation ?? 0;
    data[at + 6] = 0;
    data[at + 7] = 0;
    for (let i = 0; i < 4; i += 1) {
      data[at + FIELD.r + i] = color[i];
      data[at + FIELD.u0 + i] = uv[i];
    }
  }

  /** A mesh's batch, updated in place so the batch list needs no re-cut. */
  #writeMesh(entry) {
    const { record } = entry;
    const transform = Float32Array.from(record.transform ?? IDENTITY);
    entry.batch ??= {};
    return Object.assign(entry.batch, {
      mesh: entry.id, transform, normal: normalMatrix(transform), color: record.color ?? WHITE, lit: record.lit !== false
    });
  }
}
