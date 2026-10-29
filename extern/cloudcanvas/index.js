/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * CloudCanvas (`cloudcanvas`): the core. Two exports - `blit`, a handle over
 * any DOM element, and `type`, a potential blit backed by a `<template>` - and
 * every add-on its own subpath, paid for only when imported (`cloudcanvas/drag`,
 * `cloudcanvas/pan`, ...). `cloudcanvas/defaults` names them all at once.
 */
export { blit, type } from './core/index.js';
