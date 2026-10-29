import {applied} from './connection.js';

const GROUPS = [
  ['Envelope', [['attack','Attack',0.001,5,0.001,'s'],['decay','Decay',0.001,5,0.001,'s'],['sustain','Sustain',0,1,0.01,''],['release','Release',0.005,10,0.005,'s']]],
  ['Tone & output', [['cutoff','Low-pass',20,20000,10,'Hz'],['gain','Output level',0,0.8,0.01,''],['morph','Wavetable morph',0,1,0.01,'']]],
  ['Audio-rate modulation', [['fm_hz','Modulator',0,1000,1,'Hz'],['fm_depth','FM depth',0,500,1,'Hz'],['am_depth','AM depth',0,1,0.01,'']]],
  ['Global LFOs', [['lfo_hz.0','LFO 1 rate',0,20,0.01,'Hz'],['lfo_depth.0','LFO 1 depth',0,1,0.01,''],['lfo_hz.1','LFO 2 rate',0,20,0.01,'Hz'],['lfo_depth.1','LFO 2 depth',0,1,0.01,'']]],
];
export const HISTORY_CONTROLS = [
  ['history_seconds','History duration',0.002,30,0.001,'s'],
  ['history_offset','Look-back',0,30,0.01,'s'],
];

const LAYERS = [['logical','□ Logical'],['measured','■ Measured'],['projected','┄ Projected'],['roots','Root candidates'],['modes','Mode geometry'],['cadence','Cadence trails'],['pythagorean','Fifths / octaves']];

function read(object, path) { return path.split('.').reduce((value, key) => value[key], object); }
function changed(object, path, value) {
  const next = structuredClone(object);
  const keys = path.split('.');
  if (keys.length === 1) next[path] = value;
  else next[keys[0]][keys[1]] = value;
  return next;
}

function commandQueue(connection, group, showError) {
  let chain = Promise.resolve();
  return (path, value, element) => {
    element?.classList.add('pending');
    chain = chain.then(async () => {
      if (!connection.state) throw new Error('Engine is disconnected.');
      const updated = changed(connection.state[group], path, value);
      await applied(connection, {action: group === 'controls' ? 'controls' : 'view', [group]: updated});
    }).catch(error => showError(error.message)).finally(() => {
      element?.classList.remove('pending');
      if (connection.state) connection.emit('snapshot', connection.state);
    });
  };
}

function slider(parent, spec, update) {
  const [path, title, min, max, step, unit] = spec;
  const label = document.createElement('label');
  label.innerHTML = `<span class="control-heading"><span>${title}</span><output>—</output></span><input type="range" min="${min}" max="${max}" step="${step}" data-live>`;
  const input = label.querySelector('input');
  const output = label.querySelector('output');
  input.addEventListener('change', () => update(path, Number(input.value), output));
  parent.append(label);
  return object => {
    const value = read(object, path);
    output.textContent = `${Number(value).toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0)}${unit ? ` ${unit}` : ''}${output.classList.contains('pending') ? ' · pending' : ''}`;
    if (!output.classList.contains('pending') && document.activeElement !== input) input.value = value;
  };
}

function group(parent, title) {
  const section = document.createElement('div');
  section.className = 'control-group';
  section.innerHTML = `<h3>${title}</h3><div class="control-grid"></div>`;
  parent.append(section);
  return section.querySelector('.control-grid');
}

export function mountControls(connection, showError) {
  const update = commandQueue(connection, 'controls', showError);
  const parent = document.querySelector('#sound-controls');
  const renderers = GROUPS.flatMap(([title, specs]) => {
    const grid = group(parent, title);
    return specs.map(spec => slider(grid, spec, update));
  });
  const lfo = group(parent, 'LFO destinations');
  renderers.push(...[0, 1].map(index => lfoDestination(lfo, index, update)));
  connection.addEventListener('snapshot', event => renderers.forEach(render => render(event.detail.controls)));
  mountView(connection, showError);
}

function lfoDestination(parent, index, update) {
  const label = document.createElement('label');
  label.innerHTML = `LFO ${index + 1} destination<select data-live><option value="0">Frequency</option><option value="1">Amplitude</option><option value="2">Wavetable morph</option><option value="3">Filter cutoff</option></select>`;
  const select = label.querySelector('select');
  select.addEventListener('change', () => update(`lfo_destination.${index}`, Number(select.value), select));
  parent.append(label);
  return controls => { if (!select.classList.contains('pending')) select.value = controls.lfo_destination[index]; };
}

function mountView(connection, showError) {
  const update = commandQueue(connection, 'view', showError);
  const layers = document.querySelector('#layers');
  const checks = LAYERS.map(([path, title]) => checkbox(layers, path, title, update));
  const camera = group(document.querySelector('#camera-controls'), 'Camera');
  const sliders = [['yaw','Orbit',-6.3,6.3,0.01,''],['pitch','Elevation',-1.5,1.5,0.01,''],['distance','Distance',4,80,0.1,'']].map(spec => slider(camera, spec, update));
  const history = group(document.querySelector('#camera-controls'), 'PCM + spectrum history');
  sliders.push(...HISTORY_CONTROLS.map(spec => slider(history, spec, update)));
  const presentation = document.querySelector('#presentation');
  const reduced = document.querySelector('#reduced-motion');
  presentation.addEventListener('change', () => update('immersive', presentation.value === 'true', presentation));
  reduced.addEventListener('change', () => update('reduced_motion', reduced.checked, reduced));
  document.querySelector('#camera-reset').addEventListener('click', () => {
    update('yaw', 0); update('pitch', 0.2); update('distance', 18.5);
  });
  connection.addEventListener('snapshot', event => {
    const view = event.detail.view;
    [...checks, ...sliders].forEach(render => render(view));
    if (!presentation.classList.contains('pending')) presentation.value = String(view.immersive);
    if (!reduced.classList.contains('pending')) reduced.checked = view.reduced_motion;
  });
}

function checkbox(parent, path, title, update) {
  const label = document.createElement('label');
  label.className = 'check';
  label.innerHTML = `<input type="checkbox" data-live>${title}`;
  const input = label.querySelector('input');
  input.addEventListener('change', () => update(path, input.checked, input));
  parent.append(label);
  return view => { if (!input.classList.contains('pending')) input.checked = view[path]; };
}
