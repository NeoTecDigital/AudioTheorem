/**
 * CloudCanvas - NeoTec, LLC, Richard Christopher
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The logging seam: one dependency-free leaf the plugin and add-ons report through instead of `console`. A
 * module asks once for a scoped logger (`createLogger('reactions')`); each call is a level check and, only when
 * enabled, a record handed to the installed sink. The default sink passes `error` to `console.error` and drops
 * the rest, so a silent catch stays silent until an application installs a sink at `debug` or `warn`.
 * Rule: no logging inside the frame phases (`./core/frame.js`), where it is paid per pixel.
 */

/** The four levels, by rank; a sink at `warn` receives `warn` and `error`. */
export const LOG_LEVELS = /* @__PURE__ */ Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

/**
 * The default sink: each level to its `console` method, falling back to `console.log`. The console is looked up
 * per call, so one an environment stubs or lacks is honoured at the moment of the record, not at import.
 * @param {{level: string, scope: string, message: string, args: unknown[]}} record
 */
export function consoleLogSink({ level, message, args }) {
  if (typeof console === 'undefined') return;
  const method = typeof console[level] === 'function' ? console[level] : console.log;
  if (typeof method === 'function') method.call(console, `[CloudCanvas] ${message}`, ...args);
}

let sink = consoleLogSink;
let threshold = LOG_LEVELS.error;

/**
 * Install the sink every logger reports to, or `null` to silence all of them.
 * @param {((record: object) => void)|null} nextSink
 * @param {{level?: keyof LOG_LEVELS}} [options] the lowest level delivered; `error` when omitted
 * @returns {((record: object) => void)|null} the sink that was installed before
 */
export function setLogSink(nextSink, { level = 'error' } = {}) {
  if (nextSink !== null && typeof nextSink !== 'function') throw new TypeError('setLogSink expects a function or null');
  if (!Object.hasOwn(LOG_LEVELS, level)) {
    throw new RangeError(`unknown log level "${level}"; expected one of ${Object.keys(LOG_LEVELS).join(', ')}`);
  }
  const previous = sink;
  sink = nextSink;
  threshold = LOG_LEVELS[level];
  return previous;
}

/**
 * Deliver one record. A sink is contained: one that throws never breaks the frame, gesture or restore that
 * logged, so its failure is swallowed here and nowhere else.
 */
function emit(level, scope, message, args) {
  if (sink === null || LOG_LEVELS[level] < threshold) return;
  try {
    sink({ level, scope, message, args });
  } catch {
    // A broken sink is the sink's problem, never the caller's.
  }
}

/**
 * A frozen `{debug, info, warn, error}` for one scope, each a thin alias over `emit` keyed by its level.
 * @param {string} scope the module or subsystem name carried on every record
 */
export function createLogger(scope) {
  const name = typeof scope === 'string' && scope !== '' ? scope : 'cloudcanvas';
  return Object.freeze(Object.fromEntries(Object.keys(LOG_LEVELS).map((level) =>
    [level, (message, ...args) => emit(level, name, String(message), args)])));
}
