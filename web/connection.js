export class Connection extends EventTarget {
  constructor(token, socketFactory = url => new WebSocket(url)) {
    super();
    this.token = token;
    this.socketFactory = socketFactory;
    this.client = null;
    this.state = null;
    this.sequence = 0;
    this.pending = new Map();
    this.retry = 250;
    this.stopped = false;
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, {detail})); }
  connect() { openSocket(this); }
  receive(text) { receive(this, text); }
  command(action) { return sendCommand(this, action); }
  disconnected() { disconnect(this); }
  upload(file) { return upload(this, file); }
  panic() { return requestPanic(this); }

  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }
}

function openSocket(connection) {
  if (connection.stopped || !connection.token) {
    connection.emit('error', 'Open the authenticated launch URL printed by the engine.'); return;
  }
  connection.emit('status', 'connecting');
  connection.socket = connection.socketFactory(`ws://${location.host}/ws`);
  connection.socket.onopen = () => connection.socket.send(JSON.stringify({type: 'auth', token: connection.token}));
  connection.socket.onmessage = event => receive(connection, event.data);
  connection.socket.onclose = () => disconnect(connection);
  connection.socket.onerror = () => connection.emit('error', 'The local engine connection failed.');
}

function receive(connection, text) {
  let message;
  try { message = JSON.parse(text); } catch { return connection.emit('error', 'Invalid server response.'); }
  if (message.type === 'hello') connection.client = message.client;
  if (message.type === 'snapshot') snapshot(connection, message.state);
  if (message.type === 'ack') acknowledge(connection, message.ack);
  if (message.type === 'error') fail(connection, message.id, message.error);
}

function snapshot(connection, state) {
  connection.state = state;
  connection.retry = 250;
  connection.emit('status', 'online');
  connection.emit('snapshot', state);
}

function acknowledge(connection, ack) {
  const pending = connection.pending.get(ack.id);
  if (!pending) return;
  clearTimeout(pending.timer);
  connection.pending.delete(ack.id);
  if (ack.error) pending.reject(new Error(ack.error));
  else pending.resolve(ack);
  connection.emit('ack', ack);
}

function fail(connection, id, message) {
  const pending = connection.pending.get(id);
  if (pending) {
    clearTimeout(pending.timer);
    connection.pending.delete(id);
    pending.reject(new Error(message));
  }
  connection.emit('error', message);
}

function sendCommand(connection, action) {
  if (!connection.client || !connection.state || connection.socket?.readyState !== 1) return Promise.reject(new Error('Engine is disconnected.'));
  if (connection.pending.size >= 128) return Promise.reject(new Error('Too many unacknowledged commands.'));
  const id = ++connection.sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => fail(connection, id, 'Engine acknowledgement timed out.'), 3000);
    connection.pending.set(id, {resolve, reject, timer});
    try { connection.socket.send(JSON.stringify({id, at_sample: null, ...action})); }
    catch (error) { clearTimeout(timer); connection.pending.delete(id); reject(error); }
  });
}

function disconnect(connection) {
  connection.client = null;
  connection.state = null;
  for (const id of connection.pending.keys()) fail(connection, id, 'Connection lost; held voices are being released.');
  connection.emit('status', 'offline');
  if (connection.stopped) return;
  connection.reconnectTimer = setTimeout(() => openSocket(connection), connection.retry);
  connection.retry = Math.min(4000, connection.retry * 2);
}

async function upload(connection, file) {
  if (!connection.client) throw new Error('Connect to the engine before importing.');
  if (file.size > 256 * 1024 * 1024) throw new Error('The import limit is 256 MiB.');
  const response = await fetch('/api/import', {method: 'POST', body: file,
    headers: {Authorization: `Bearer ${connection.token}`, 'X-Client-Id': String(connection.client)}});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Import failed.');
  return result.asset;
}

function requestPanic(connection) {
  return fetch('/api/panic', {method: 'POST', headers: {Authorization: `Bearer ${connection.token}`}})
    .then(response => { if (!response.ok) throw new Error('Emergency silence request failed.'); });
}

export function launchToken() {
  const supplied = new URLSearchParams(location.hash.slice(1)).get('token');
  if (supplied) sessionStorage.setItem('harmonic-session', supplied);
  history.replaceState(null, '', location.pathname);
  return supplied || sessionStorage.getItem('harmonic-session') || '';
}

export async function applied(connection, action) {
  const ack = await connection.command(action);
  if (connection.state?.revision >= ack.revision) return ack;
  return new Promise((resolve, reject) => {
    const done = () => { clearTimeout(timer); connection.removeEventListener('snapshot', observe); };
    const observe = event => {
      if (event.detail.revision < ack.revision) return;
      done(); resolve(ack);
    };
    const timer = setTimeout(() => { done(); reject(new Error('Waiting for authoritative snapshot timed out.')); }, 2500);
    connection.addEventListener('snapshot', observe);
  });
}
