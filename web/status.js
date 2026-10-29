export function showError(message) {
  const element = document.querySelector('#error');
  element.textContent = message;
  element.hidden = !message;
}

export function mountStatus(connection) {
  connection.addEventListener('error', event => showError(event.detail));
  connection.addEventListener('status', event => {
    const online = event.detail === 'online';
    document.querySelector('#connection').textContent = online ? 'Engine connected' : event.detail === 'connecting' ? 'Connecting…' : 'Disconnected · retrying';
    document.querySelector('#connection-dot').classList.toggle('online', online);
    document.body.classList.toggle('offline', !online);
    document.querySelectorAll('[data-live]').forEach(element => { element.disabled = !online || element.dataset.busy === 'true'; });
  });
  connection.addEventListener('snapshot', event => renderStatus(event.detail));
}

function renderStatus(state) {
  const device = state.device;
  document.querySelector('#revision').textContent = `ENGINE R${state.revision} / E${state.epoch}`;
  document.querySelector('#audio-status').textContent = device.available
    ? `${device.name} · ${device.sample_rate} Hz · ${device.channels}ch ${device.format} · ${device.actual_buffer || '?'} frames`
    : 'AUDIO UNAVAILABLE · EXPLICIT VIRTUAL CLOCK';
  document.querySelector('#audio-status').classList.toggle('warning', !device.available);
  document.querySelector('#overload-status').textContent = `Overloads ${state.overloads} · device errors ${device.errors} · analysis gaps ${device.analysis_drops}`;
  document.querySelector('#overload-status').classList.toggle('warning', state.overloads + device.errors + device.analysis_drops > 0);
  document.querySelector('#panic-status').textContent = state.panic ? 'PANIC · SILENCED' : 'Panic ready';
  document.querySelector('#panic-status').classList.toggle('warning', state.panic);
  const analysis = state.analysis;
  if (!analysis) return;
  const lag = Math.max(0, state.sample - analysis.end) / device.sample_rate * 1000;
  const ages = analysis.age_samples.map(age => age === 4294967295 ? 'warming' : Math.round(age / device.sample_rate * 1000));
  document.querySelector('#analysis-status').textContent = `Analysis lag ${lag.toFixed(0)}ms · window ages ${ages.join('/')}ms${analysis.gap ? ' · GAP' : ''}${analysis.contributions.some(link => link.layer === 'processing') ? ' · BUS PROTECTION ACTIVE' : ''}`;
  document.querySelector('#analysis-status').classList.toggle('warning', lag > 80 || analysis.gap);
}
