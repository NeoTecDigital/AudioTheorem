import {Connection, applied, launchToken} from './connection.js';
import {mountKeyboard} from './keyboard.js';
import {mountControls} from './controls.js';
import {mountInstrument} from './instrument.js';
import {mountAnalysis} from './analysis.js';
import {mountStatus, showError} from './status.js';

const connection = new Connection(launchToken());
mountStatus(connection);
const held = mountKeyboard(connection, showError);
mountControls(connection, showError);
mountInstrument(connection, showError);
mountAnalysis(connection);
mountFiles();
document.querySelector('#panic').addEventListener('click', () => {
  held.forget(); connection.panic().catch(error => showError(error.message));
});
document.querySelector('#reset-analysis').addEventListener('click', () => {
  applied(connection, {action: 'reset_analysis'}).catch(error => showError(error.message));
});
window.addEventListener('pagehide', () => { held.releaseAll(); connection.stop(); });
connection.connect();

function mountFiles() {
  const input = document.querySelector('#file');
  const status = document.querySelector('#file-status');
  const play = document.querySelector('#playback');
  const seek = document.querySelector('#seek');
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    status.textContent = `Importing ${file.name}…`; input.disabled = true; input.dataset.busy = 'true';
    try {
      const asset = await connection.upload(file);
      status.textContent = `${file.name} · asset ${asset} · measured evidence only`;
    } catch (error) { status.textContent = 'Import rejected.'; showError(error.message); }
    finally { input.dataset.busy = 'false'; input.disabled = !connection.state; input.value = ''; }
  });
  play.addEventListener('click', () => applied(connection, {action: 'playback', playing: !connection.state.playing}).catch(error => showError(error.message)));
  seek.addEventListener('change', () => applied(connection, {action: 'seek', seconds: Number(seek.value)}).catch(error => showError(error.message)));
  connection.addEventListener('snapshot', event => {
    const state = event.detail;
    play.textContent = state.playing ? 'Pause' : 'Play';
    play.disabled = !state.asset;
    seek.disabled = !state.asset;
    seek.max = state.duration_seconds;
    if (document.activeElement !== seek) seek.value = state.playback_seconds;
    document.querySelector('#position').textContent = `${clock(state.playback_seconds)} / ${clock(state.duration_seconds)}`;
  });
}

function clock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
