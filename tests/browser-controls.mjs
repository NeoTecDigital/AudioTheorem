import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {HeldVoices} from '../web/keyboard.js';
import {Connection, applied} from '../web/connection.js';
import {HISTORY_CONTROLS} from '../web/controls.js';

function fakeConnection() {
  const commands = [];
  return {commands, command(action) { commands.push(action); return Promise.resolve({}); }};
}

test('press/release uses stable voice identity across controls, not pitch labels', async () => {
  const connection = fakeConnection();
  const held = new HeldVoices(connection, assert.fail);
  held.press('KeyZ', 130.8128, 0.8, 0);
  held.press('KeyZ', 261.6256, 0.5, 5);
  held.release('KeyZ');
  assert.equal(connection.commands.length, 2);
  assert.deepEqual(connection.commands[1], {action: 'release', voice: 1});
  held.press('KeyZ', 261.6256, 0.5, 5);
  assert.equal(connection.commands[2].voice, 2);
  assert.equal(connection.commands[2].instrument, 5);
});

test('typing and pointer sources at the same frequency retain independent voices', () => {
  const connection = fakeConnection();
  const held = new HeldVoices(connection, assert.fail);
  held.press('key:z', 130.8128, 0.8, 0);
  held.press('pointer:0', 130.8128, 0.8, 0);
  held.release('pointer:0');
  assert.equal(held.held.get('key:z'), 1);
  assert.deepEqual(connection.commands[2], {action: 'release', voice: 2});
});

test('focus loss releases every held voice exactly once', () => {
  const connection = fakeConnection();
  const held = new HeldVoices(connection, assert.fail);
  held.press('z', 100, 0.8, 0);
  held.press('s', 200, 0.8, 1);
  held.releaseAll(); held.releaseAll();
  assert.deepEqual(connection.commands.slice(2), [
    {action: 'release', voice: 1}, {action: 'release', voice: 2},
  ]);
  assert.equal(held.held.size, 0);
});

test('disconnect forgets prior identities and reconnect never replays starts', () => {
  const connection = fakeConnection();
  const held = new HeldVoices(connection, assert.fail);
  held.press('z', 100, 0.8, 0); held.forget(); held.releaseAll();
  assert.equal(connection.commands.length, 1);
  held.press('z', 100, 0.8, 0);
  assert.equal(connection.commands[1].voice, 2);
});

test('late rejected start cannot delete a newer activation', async () => {
  let reject;
  const connection = {command: () => new Promise((_, fail) => { reject = fail; })};
  const errors = [];
  const held = new HeldVoices(connection, error => errors.push(error));
  held.press('z', 100, 1, 0);
  const firstReject = reject;
  held.forget(); held.press('z', 200, 1, 0);
  firstReject(new Error('Rejected')); await Promise.resolve();
  assert.equal(held.held.get('z'), 2);
  assert.deepEqual(errors, ['Rejected']);
});

test('controls await applied acknowledgement and authoritative snapshot', async () => {
  const connection = new Connection('token');
  connection.client = 1; connection.state = {revision: 0};
  const messages = [];
  connection.socket = {readyState: 1, send: text => messages.push(JSON.parse(text))};
  const pending = applied(connection, {action: 'controls', controls: {gain: 0.4}});
  assert.equal(connection.state.revision, 0);
  connection.receive(JSON.stringify({type: 'ack', ack: {id: 1, revision: 3}}));
  await Promise.resolve();
  connection.receive(JSON.stringify({type: 'snapshot', state: {revision: 3, controls: {gain: 0.4}}}));
  assert.equal((await pending).revision, 3);
  assert.equal(messages[0].at_sample, null);
  assert.equal(connection.state.controls.gain, 0.4);
});

test('a disconnected client cannot send and pending commands fail explicitly', async () => {
  const connection = new Connection('token');
  await assert.rejects(connection.command({action: 'start'}), /disconnected/);
  connection.client = 1; connection.state = {};
  connection.socket = {readyState: 1, send() {}};
  const pending = connection.command({action: 'release', voice: 1});
  connection.stopped = true; connection.disconnected();
  await assert.rejects(pending, /Connection lost/);
  assert.equal(connection.pending.size, 0);
});

test('waveform history sliders match acknowledged engine view bounds', () => {
  assert.deepEqual(HISTORY_CONTROLS.map(([path, , min, max, step, unit]) => [path, min, max, step, unit]), [
    ['history_seconds', 0.002, 30, 0.001, 's'],
    ['history_offset', 0, 30, 0.01, 's'],
  ]);
  const source = readFileSync(new URL('../web/controls.js', import.meta.url), 'utf8');
  assert.match(source, /HISTORY_CONTROLS\.map\(spec => slider\(history, spec, update\)\)/);
  assert.match(source, /commandQueue\(connection, 'view', showError\)/);
});

test('every packaged browser module parses; no alternate audio or harmonic engine', () => {
  const files = readdirSync(new URL('../web/', import.meta.url)).filter(file => file.endsWith('.js'));
  for (const file of files) {
    const path = new URL(`../web/${file}`, import.meta.url);
    const source = readFileSync(path, 'utf8');
    assert.equal(spawnSync(process.execPath, ['--check', path.pathname]).status, 0, file);
    assert.doesNotMatch(source, /AudioContext|OscillatorNode|createOscillator|createScriptProcessor|new\s+Worker\s*\(/);
    assert.ok(source.split('\n').length <= 500, file);
  }
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /sequencer|cloudcanvas|daw-harness/);
});
