const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const KEYS = ['z','s','x','d','c','v','g','b','h','n','j','m','q','2','w','3','e','r','5','t','6','y','7','u','i'];
const CODES = KEYS.map(key => /[0-9]/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`);

export class HeldVoices {
  constructor(connection, onError) {
    this.connection = connection;
    this.onError = onError;
    this.held = new Map();
    this.nextVoice = 0;
  }

  press(key, hz, velocity, instrument) {
    if (this.held.has(key)) return;
    const voice = ++this.nextVoice;
    this.held.set(key, voice);
    this.connection.command({action: 'start', voice, hz, velocity, instrument}).catch(error => {
      if (this.held.get(key) === voice) this.held.delete(key);
      this.onError(error.message);
    });
  }

  release(key) {
    const voice = this.held.get(key);
    if (voice === undefined) return;
    this.held.delete(key);
    this.connection.command({action: 'release', voice}).catch(error => this.onError(error.message));
  }

  releaseAll() { for (const key of this.held.keys()) this.release(key); }
  forget() { this.held.clear(); }
}

function inputFrequency(offset, octave) {
  return 440 * 2 ** (((octave + 1) * 12 + offset - 69) / 12);
}

function typing(event) {
  return /INPUT|SELECT|TEXTAREA/.test(event.target?.tagName) || event.target?.isContentEditable;
}

export function mountKeyboard(connection, showError) {
  const held = new HeldVoices(connection, showError);
  const board = document.querySelector('#keyboard');
  const octave = document.querySelector('#octave');
  const instrument = document.querySelector('#instrument');
  const velocity = document.querySelector('#velocity');
  const tone = document.querySelector('#hz-play');
  const press = (key, hz) => held.press(key, hz, Number(velocity.value), Number(instrument.value));
  const buttons = KEYS.map((key, offset) => keyButton(board, key, offset));
  const noteOn = (index, source = `key:${KEYS[index]}`) => press(source, inputFrequency(index, Number(octave.value)));
  buttons.forEach((button, index) => bindHold(button, () => noteOn(index, `pointer:${index}`), () => held.release(`pointer:${index}`)));
  bindHold(tone, () => press('hz', Number(document.querySelector('#frequency').value)), () => held.release('hz'));
  bindTyping(held, noteOn, connection);
  window.addEventListener('blur', () => held.releaseAll());
  document.addEventListener('visibilitychange', () => { if (document.hidden) held.releaseAll(); });
  connection.addEventListener('status', event => { if (event.detail !== 'online') held.forget(); });
  connection.addEventListener('snapshot', event => markPlaying(event.detail, connection, held, buttons, tone));
  octave.addEventListener('change', () => labelKeys(buttons, Number(octave.value)));
  labelKeys(buttons, Number(octave.value));
  return held;
}

function keyButton(board, key, index) {
  const button = document.createElement('button');
  button.className = `key ${[1, 3, 6, 8, 10].includes(index % 12) ? 'black' : ''}`;
  button.dataset.live = '';
  button.innerHTML = `<span class="key-note"></span><kbd>${key.toUpperCase()}</kbd>`;
  button.setAttribute('aria-pressed', 'false');
  board.append(button);
  return button;
}

function labelKeys(buttons, octave) {
  buttons.forEach((button, index) => {
    const note = `${NAMES[index % 12]}${octave + Math.floor(index / 12)}`;
    button.querySelector('.key-note').textContent = note;
    button.setAttribute('aria-label', `Play ${note}, ${inputFrequency(index, octave).toFixed(2)} Hz`);
  });
}

function bindTyping(held, noteOn, connection) {
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') { held.forget(); connection.panic().catch(() => {}); return; }
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || typing(event)) return;
    const index = CODES.indexOf(event.code);
    if (index < 0) return;
    event.preventDefault(); noteOn(index);
  });
  window.addEventListener('keyup', event => held.release(`key:${KEYS[CODES.indexOf(event.code)]}`));
}

function bindHold(button, press, release) {
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); button.setPointerCapture(event.pointerId); press();
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, release);
  button.addEventListener('keydown', event => {
    if (![' ', 'Enter'].includes(event.key) || event.repeat) return;
    event.preventDefault(); press();
  });
  button.addEventListener('keyup', event => { if ([' ', 'Enter'].includes(event.key)) release(); });
  button.addEventListener('blur', release);
}

function markPlaying(state, connection, held, buttons, tone) {
  const voices = state.voices.filter(voice => voice.client === connection.client && voice.held);
  const active = new Set(voices.map(voice => voice.voice));
  [...buttons, tone].forEach((button, index) => {
    const sources = index < KEYS.length ? [`key:${KEYS[index]}`, `pointer:${index}`] : ['hz'];
    const playing = sources.some(source => active.has(held.held.get(source)));
    button.classList.toggle('held', playing);
    button.setAttribute('aria-pressed', String(playing));
  });
  document.querySelector('#voices').textContent = `${state.voices.length} / 16 voices`;
}
