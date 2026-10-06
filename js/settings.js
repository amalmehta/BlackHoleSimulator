/*
 * Black Hole Simulator — settings.
 *
 * Every preference lives here: the schema (labels, ranges, defaults), the
 * saved values (localStorage), and the Settings panel (gear button or ⌘, / Ctrl+,).
 */
(function (root) {
  'use strict';

  const KEY = 'blackHoleSimulator.settings.v1';

  const SCHEMA = [
    { group: 'Picture quality' },
    { key: 'renderScale', label: 'Resolution', type: 'range', min: 0.25, max: 1, step: 0.05, def: 0.7, fmt: (v) => `${Math.round(v * 100)}%`,
      help: 'Fraction of screen pixels traced. Lower is faster.' },
    { key: 'maxSteps', label: 'Max ray steps', type: 'range', min: 100, max: 1200, step: 50, def: 500, fmt: (v) => `${v}`,
      help: 'Upper limit on integration steps per ray.' },
    { key: 'stepSize', label: 'Step size', type: 'range', min: 0.01, max: 0.12, step: 0.005, def: 0.04, fmt: (v) => v.toFixed(3),
      help: 'Step length as a fraction of distance r. Smaller is more accurate.' },
    { key: 'bloom', label: 'Bloom', type: 'range', min: 0, max: 1.5, step: 0.05, def: 0.45, fmt: (v) => v.toFixed(2) },
    { key: 'exposure', label: 'Exposure', type: 'range', min: 0.2, max: 4, step: 0.05, def: 1.0, fmt: (v) => v.toFixed(2) },

    { group: 'Accretion disk' },
    { key: 'showDisk', label: 'Show disk', type: 'toggle', def: true },
    { key: 'diskInner', label: 'Inner edge', type: 'range', min: 3.5, max: 15, step: 0.5, def: 6, fmt: (v) => `${v} M`,
      help: 'Real thin disks end at the ISCO, r = 6M.' },
    { key: 'diskOuter', label: 'Outer edge', type: 'range', min: 10, max: 40, step: 1, def: 24, fmt: (v) => `${v} M` },
    { key: 'diskTemperature', label: 'Peak temperature', type: 'range', min: 2500, max: 30000, step: 250, def: 5500, fmt: (v) => `${v.toLocaleString()} K`,
      help: 'Temperature of the hottest ring, before redshift.' },
    { key: 'timeScale', label: 'Disk spin speed', type: 'range', min: 0, max: 30, step: 0.5, def: 8, fmt: (v) => `${v}×` },

    { group: 'Physics' },
    { key: 'lensing', label: 'Bend light (lensing)', type: 'toggle', def: true, help: 'Off = straight rays, for comparison.' },
    { key: 'doppler', label: 'Doppler beaming', type: 'toggle', def: true, help: 'Light from the side moving toward you is brighter and bluer.' },
    { key: 'gravRedshift', label: 'Gravitational redshift', type: 'toggle', def: true },

    { group: 'Sky & camera' },
    { key: 'showStars', label: 'Stars', type: 'toggle', def: true },
    { key: 'starBrightness', label: 'Star brightness', type: 'range', min: 0, max: 3, step: 0.1, def: 1, fmt: (v) => v.toFixed(1) },
    { key: 'fov', label: 'Field of view', type: 'range', min: 25, max: 100, step: 1, def: 55, fmt: (v) => `${v}°` },
    { key: 'autoRotate', label: 'Auto-orbit', type: 'toggle', def: true },
    { key: 'rotateSpeed', label: 'Orbit speed', type: 'range', min: 0, max: 1, step: 0.02, def: 0.12, fmt: (v) => v.toFixed(2) },
  ];

  const defaults = () => Object.fromEntries(SCHEMA.filter((f) => f.key).map((f) => [f.key, f.def]));

  function load() {
    const s = defaults();
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      for (const k of Object.keys(s)) if (typeof saved[k] === typeof s[k]) s[k] = saved[k];
    } catch (e) { /* storage unavailable: use defaults */ }
    return s;
  }

  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }

  const listeners = [];
  const settings = load();

  function set(key, value) {
    settings[key] = value;
    save(settings);
    listeners.forEach((fn) => fn(key, value));
  }

  function onChange(fn) { listeners.push(fn); }

  // ---- panel ----------------------------------------------------------------
  let syncPanel = () => {};

  function buildPanel() {
    const panel = document.getElementById('settings-panel');
    const body = panel.querySelector('.settings-body');
    const inputs = {};
    body.innerHTML = '';
    let section = body;
    for (const f of SCHEMA) {
      if (f.group) {
        section = document.createElement('fieldset');
        section.innerHTML = `<legend>${f.group}</legend>`;
        body.appendChild(section);
        continue;
      }
      const row = document.createElement('label');
      row.className = 'setting ' + f.type;
      const id = 'set-' + f.key;
      if (f.type === 'toggle') {
        row.innerHTML = `<span class="setting-label">${f.label}</span>
          <input type="checkbox" id="${id}" role="switch">`;
      } else {
        row.innerHTML = `<span class="setting-label">${f.label}<output for="${id}"></output></span>
          <input type="range" id="${id}" min="${f.min}" max="${f.max}" step="${f.step}">`;
      }
      if (f.help) row.insertAdjacentHTML('beforeend', `<small>${f.help}</small>`);
      section.appendChild(row);
      const input = row.querySelector('input');
      const out = row.querySelector('output');
      inputs[f.key] = { input, out, f };
      input.addEventListener('input', () => {
        const v = f.type === 'toggle' ? input.checked : parseFloat(input.value);
        if (out) out.textContent = f.fmt(v);
        set(f.key, v);
      });
    }
    syncPanel = () => {
      for (const { input, out, f } of Object.values(inputs)) {
        if (f.type === 'toggle') input.checked = settings[f.key];
        else { input.value = settings[f.key]; out.textContent = f.fmt(settings[f.key]); }
      }
    };
    syncPanel();
    panel.querySelector('[data-action="reset"]').addEventListener('click', () => {
      const d = defaults();
      for (const k of Object.keys(d)) set(k, d[k]);
      syncPanel();
    });
  }

  function open() {
    const panel = document.getElementById('settings-panel');
    syncPanel();
    panel.hidden = false;
    panel.querySelector('input')?.focus({ preventScroll: true });
  }
  function close() { document.getElementById('settings-panel').hidden = true; }
  function toggle() { document.getElementById('settings-panel').hidden ? open() : close(); }

  function init() {
    buildPanel();
    document.querySelectorAll('[data-action="open-settings"]').forEach((b) => b.addEventListener('click', toggle));
    document.querySelector('#settings-panel [data-action="close"]').addEventListener('click', close);
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') { e.preventDefault(); toggle(); }
      else if (e.key === 'Escape') close();
    });
  }

  // Change a value from elsewhere on the page and keep the panel in step.
  function apply(key, value) { set(key, value); syncPanel(); }

  root.Settings = { values: settings, set: apply, onChange, init, open, close, defaults, SCHEMA };
})(typeof globalThis !== 'undefined' ? globalThis : this);
