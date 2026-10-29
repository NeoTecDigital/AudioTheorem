import {applied} from './connection.js';

export function mountInstrument(connection, showError) {
  const canvas = document.querySelector('#wavetable');
  const status = document.querySelector('#wave-status');
  const editor = {draft: Array(64).fill(0), actual: [], dirty: false};
  const render = () => drawWave(canvas, editor);
  bindDrawing(canvas, editor, () => { status.textContent = 'Drawing is a draft · not yet audible'; render(); });
  document.querySelectorAll('[data-wave]').forEach(button => button.addEventListener('click', () => {
    editor.draft = preset(button.dataset.wave); editor.dirty = true;
    status.textContent = `${button.textContent} draft · apply to engine`; render();
  }));
  document.querySelector('#wave-apply').addEventListener('click', async () => {
    status.textContent = 'Waiting for engine acknowledgement…';
    try {
      await applied(connection, {action: 'wavetable', samples: editor.draft.slice()});
      editor.dirty = false; status.textContent = 'Applied by engine';
      editor.draft = [...connection.state.wavetable]; render();
    } catch (error) { status.textContent = 'Not applied'; showError(error.message); }
  });
  connection.addEventListener('snapshot', event => {
    editor.actual = event.detail.wavetable || [];
    if (!editor.dirty && editor.actual.length) editor.draft = [...editor.actual];
    render();
  });
  render(); mountPartials(connection, showError);
}

function preset(kind) {
  return Array.from({length: 64}, (_, i) => {
    const phase = i / 64;
    if (kind === 'triangle') return 1 - 4 * Math.abs(phase - 0.5);
    if (kind === 'saw') return phase * 2 - 1;
    if (kind === 'square') return phase < 0.5 ? 1 : -1;
    return Math.sin(phase * Math.PI * 2);
  });
}

function bindDrawing(canvas, editor, changed) {
  let drawing = false;
  const draw = event => {
    if (!drawing || !editor.draft.length) return;
    const rect = canvas.getBoundingClientRect();
    const index = Math.max(0, Math.min(editor.draft.length - 1, Math.floor((event.clientX - rect.left) / rect.width * editor.draft.length)));
    editor.draft[index] = Math.max(-1, Math.min(1, 1 - 2 * (event.clientY - rect.top) / rect.height));
    editor.dirty = true; changed();
  };
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId); drawing = true; draw(event);
  });
  canvas.addEventListener('pointermove', draw);
  for (const type of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(type, () => { drawing = false; });
}

function drawWave(canvas, editor) {
  const context = canvas.getContext('2d');
  const {width, height} = canvas;
  context.clearRect(0, 0, width, height);
  context.strokeStyle = '#263b44'; context.lineWidth = 1;
  context.beginPath(); context.moveTo(0, height / 2); context.lineTo(width, height / 2); context.stroke();
  trace(context, editor.actual, width, height, '#4b6872');
  trace(context, editor.draft, width, height, '#79e7ed');
}

function trace(context, samples, width, height, color) {
  context.strokeStyle = color; context.lineWidth = 2; context.beginPath();
  samples.forEach((value, i) => {
    const x = i / Math.max(1, samples.length - 1) * width;
    const y = height / 2 - value * (height / 2 - 6);
    if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
  });
  context.stroke();
}

function mountPartials(connection, showError) {
  const parent = document.querySelector('#partials');
  const status = document.querySelector('#partials-status');
  let dirty = false;
  const sliders = Array.from({length: 32}, (_, i) => {
    const label = document.createElement('label');
    label.innerHTML = `<input type="range" min="0" max="1" step="0.01" value="${i ? 0 : 1}" aria-label="Partial ${i + 1}"><span>${i + 1}</span>`;
    const slider = label.querySelector('input');
    slider.addEventListener('input', () => { dirty = true; status.textContent = ' Draft · not applied'; });
    parent.append(label); return slider;
  });
  document.querySelector('#partials-apply').addEventListener('click', async () => {
    status.textContent = ' Waiting for acknowledgement…';
    try {
      await applied(connection, {action: 'partials', amplitudes: sliders.map(slider => Number(slider.value))});
      dirty = false; status.textContent = ' Applied';
    } catch (error) { status.textContent = ' Not applied'; showError(error.message); }
  });
  connection.addEventListener('snapshot', event => {
    if (dirty) return;
    sliders.forEach((slider, i) => { slider.value = event.detail.partials?.[i] || 0; });
  });
}
