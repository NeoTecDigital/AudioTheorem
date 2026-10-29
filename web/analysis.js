const PITCHES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const MODES = ['Ionian','Dorian','Phrygian','Lydian','Mixolydian','Aeolian','Locrian'];

export function mountAnalysis(connection) {
  const fields = ['logical', 'measured'].map(layer => makeField(layer));
  const tensions = ['logical', 'measured'].map(layer => makeTension(layer));
  connection.addEventListener('snapshot', event => {
    const analysis = event.detail.analysis;
    if (!analysis) return;
    document.querySelector('#model-version').textContent = `MODEL ${analysis.model_version}`;
    fields.forEach(render => render(analysis));
    tensions.forEach(render => render(analysis));
    renderEvents(analysis, event.detail.device.sample_rate);
  });
}

function makeField(layer) {
  const parent = document.querySelector(`#${layer}-field`);
  const meters = PITCHES.map(name => {
    const column = document.createElement('div');
    column.className = 'pitch-column';
    column.innerHTML = `<meter min="0" max="1" low="0.35" high="0.7" optimum="1" value="0.5" aria-label="${layer} compatibility ${name}"></meter><span>${name}</span>`;
    parent.append(column); return column.querySelector('meter');
  });
  return analysis => {
    const field = analysis[layer];
    meters.forEach((meter, index) => { meter.value = field.compatibility[index]; });
    document.querySelector(`#${layer}-confidence`).textContent = `Context confidence ${(field.confidence * 100).toFixed(0)}%${field.confidence < 0.02 ? ' · neutral / uncertain' : ''}`;
    renderCandidates(document.querySelector(`#${layer}-modes`), analysis[`${layer}_modes`], field.confidence);
  };
}

function renderCandidates(parent, candidates, confidence) {
  parent.replaceChildren();
  if (confidence < 0.02 || !candidates.length) {
    const item = document.createElement('li');
    item.textContent = 'No supported tonal center'; parent.append(item); return;
  }
  candidates.slice(0, 3).forEach(candidate => {
    const item = document.createElement('li');
    item.append(document.createTextNode(`${PITCHES[candidate.root]} ${MODES[candidate.mode]} `));
    const score = document.createElement('span');
    score.textContent = `score ${candidate.weight.toFixed(3)}`;
    item.append(score); parent.append(item);
  });
}

function makeTension(layer) {
  const row = document.createElement('div');
  row.className = 'tension-row';
  row.innerHTML = `<span>${layer === 'logical' ? 'Logical' : 'Measured'}</span><meter min="0" max="1" low="0.25" high="0.6" optimum="0" value="0" aria-label="${layer} estimated tension"></meter><output>—</output>`;
  document.querySelector('#cadence-traces').append(row);
  return analysis => {
    const cadence = analysis[`${layer}_cadence`];
    row.querySelector('meter').value = cadence.tension;
    const direction = cadence.direction > 0.005 ? '↑' : cadence.direction < -0.005 ? '↓' : '→';
    row.querySelector('output').textContent = analysis.gap ? 'gap / reset' : `${cadence.tension.toFixed(2)} ${direction} ${cadence.settling > 0 ? 'settling' : ''}`;
  };
}

function renderEvents(analysis, rate) {
  const messages = ['logical','measured'].flatMap(layer => analysis[`${layer}_cadence`].events.slice(-2).map(event => {
    const time = (event.sample / rate).toFixed(1);
    return `${layer}: estimated arrival at ${PITCHES[event.root]} · ${time}s`;
  }));
  document.querySelector('#cadence-events').textContent = messages.join(' / ') || 'No completed model-estimated arrivals.';
}
