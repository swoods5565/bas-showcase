import { THEMES, DELTA, GROUPS } from './themes.js';

const $ = (s, el = document) => el.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
const ZONE = { cold: '#30a3dc', ok: '#a1bc2d', warm: '#ff9900', alarm: '#e03215' };

/* ---------------- toast + copy ---------------- */
const toast = (msg) => {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), 1600);
};
const copy = async (text, label) => {
  try { await navigator.clipboard.writeText(text); toast(`Copied ${label}`); }
  catch { toast(text.length < 40 ? text : 'Copy not allowed here'); }
};

/* ---------------- theme ---------------- */
const themeKey = (t) => (t === 'light' ? 'Nord_Light' : 'Nord_Dark');
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  document.querySelectorAll('[data-set-theme]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.setTheme === t));
  try { localStorage.setItem('entec-sg-theme', t); } catch {}
  renderThemeSwatches(themeKey(t));
}
document.querySelectorAll('[data-set-theme]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.setTheme)));

/* ---------------- swatches ---------------- */
const swatch = (name, hex, note = '') => {
  const b = document.createElement('button');
  b.className = 'sw';
  b.innerHTML = `<span class="sw-chip" style="background:${hex}"></span><span class="sw-txt"><b>${note || name}</b>${note ? `<span>${name}</span><br>` : ''}<span class="sw-hex">${hex}</span></span>`;
  b.addEventListener('click', () => copy(hex, hex));
  return b;
};
function renderThemeSwatches(key) {
  $('#themeName').textContent = key;
  const wrap = $('#themeSwatches');
  wrap.innerHTML = '';
  for (const [group, keys] of GROUPS) {
    const g = document.createElement('div');
    g.className = 'sw-group';
    g.innerHTML = `<div class="sw-group-name">${group}</div>`;
    const grid = document.createElement('div');
    grid.className = 'swatches';
    keys.forEach((k) => grid.appendChild(swatch(k, THEMES[key][k])));
    g.appendChild(grid);
    wrap.appendChild(g);
  }
}
DELTA.status.forEach(([k, hex, note]) => $('#statusSwatches').appendChild(swatch(k, hex, note)));
DELTA.piping.forEach(([k, hex, note]) => $('#pipeSwatches').appendChild(swatch(k, hex, note)));
[
  ['Cold', ZONE.cold, '3 °F or more below setpoint'],
  ['Comfortable', ZONE.ok, 'Within 2 °F of setpoint'],
  ['Too warm', ZONE.warm, '3 °F or more above setpoint'],
  ['Alarm', ZONE.alarm, 'Unit in alarm'],
].forEach(([n, hex, note]) => $('#zoneSwatches').appendChild(swatch(note, hex, n)));
DELTA.chart.forEach(([k, hex]) => {
  const b = document.createElement('button');
  b.style.background = hex;
  b.title = `${k} ${hex}`;
  b.setAttribute('aria-label', `${k} ${hex}`);
  b.addEventListener('click', () => copy(hex, `${k} ${hex}`));
  $('#chartStrip').appendChild(b);
});

/* ---------------- header clock ---------------- */
const tick = () => {
  const d = new Date();
  $('#clock').textContent = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' +
    d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};
tick(); setInterval(tick, 15000);

/* ---------------- nav mock ---------------- */
const NAV = [
  ['Floor Plans', [['BUILDING', ['Overall Building']], ['AREAS', ['Gym Area', 'Cafeterias', 'Band/Classrooms', 'Lab/Reception', 'Classes/Shops']]]],
  ['Air Systems', [['ROOFTOP UNITS', ['RTU-120 MS Cafeteria', 'RTU-124 HS Cafeteria']], ['DEDICATED OUTDOOR AIR', ['DOAS Band/Classrooms']], ['SUMMARY', ['RTU Summary']]]],
  ['Central Plant', [['HEATING & COOLING WATER', ['HW/CHW System']], ['SUMMARY', ['Plant Summary']]]],
  ['Terminal Units', [['HEAT PUMPS', ['Heat Pump Summary']], ['VAV BOXES', ['VAV Summary']], ['FAN COILS', ['FCU Summary']]]],
  ['Miscellaneous', [['EXHAUST FANS', ['Exhaust Fan Summary']], ['CABINET HEATERS', ['Cabinet Heater Summary']]]],
  ['Dashboards', [['', ['Building Summary', 'Outdoor Conditions', 'Energy & Utilities (if metered)']]]],
  ['Alarms', [['', ['Active Alarms', 'Events']]]],
  ['Trends', [['', ['Trend Viewer']]]],
  ['Schedules', [['', ['Building Schedules']]]],
  ['Reports', [['', ['Overrides', 'Alarm History', 'Points in Fault/Offline', 'Runtime Hours']]]],
  ['Legend', [['', ['Symbols & Colors']]]],
];
const l1 = $('#navL1');
const l2 = $('#navL2');
function openNav(i) {
  l1.querySelectorAll('li').forEach((li, j) => li.classList.toggle('on', i === j));
  const [, groups] = NAV[i];
  l2.innerHTML = groups.map(([h, pages]) =>
    (h ? `<div class="mn-h">${h}</div>` : '') + pages.map((p) => `<div class="mn-p">${p}</div>`).join('')).join('');
}
NAV.forEach(([name], i) => {
  const li = document.createElement('li');
  li.innerHTML = `<span>${name}</span><span aria-hidden="true">›</span>`;
  li.addEventListener('click', () => openNav(i));
  l1.appendChild(li);
});
openNav(1);

/* ---------------- floor plan ---------------- */
const ROOMS = [
  // id, x, y, w, h, name, zone
  ['gym', 20, 20, 400, 260, 'Gym', 'RTU-1'],
  ['lka', 20, 280, 200, 140, 'Locker Rm A', 'RTU-1'],
  ['lkb', 220, 280, 200, 140, 'Locker Rm B', 'RTU-1'],
  ['mech', 20, 420, 400, 120, 'Mechanical', null],
  ['c101', 420, 20, 140, 220, 'Class 101', 'HP-101'],
  ['c102', 560, 20, 140, 220, 'Class 102', 'HP-102'],
  ['c103', 700, 20, 140, 220, 'Class 103', 'HP-103'],
  ['c104', 840, 20, 140, 220, 'Class 104', 'HP-103'],
  ['cor', 420, 240, 560, 50, 'Corridor', null],
  ['off', 420, 290, 160, 120, 'Office', 'HP-105'],
  ['rec', 420, 410, 160, 130, 'Reception', 'HP-105'],
  ['band', 580, 290, 250, 250, 'Band', 'HP-106'],
  ['stor', 830, 290, 150, 250, 'Storage', null],
];
const ZONES = {
  'RTU-1': { t: 76.4, sp: 72, at: [220, 120] },
  'HP-101': { t: 72.3, sp: 72, at: [490, 120] },
  'HP-102': { t: 68.1, sp: 72, at: [630, 120] },
  'HP-103': { t: 71.6, sp: 72, at: [840, 120] },
  'HP-105': { t: 73.0, sp: 72, at: [500, 355] },
  'HP-106': { t: 70.2, sp: 72, alarm: true, at: [705, 400] },
};
const zoneColor = (z) => (z.alarm ? ZONE.alarm : z.t - z.sp <= -3 ? ZONE.cold : z.t - z.sp >= 3 ? ZONE.warm : ZONE.ok);

const fp = $('#fp');
const roomEls = {};
ROOMS.forEach(([id, x, y, w, h, name, zone]) => {
  const r = svg('rect', { x, y, width: w, height: h, class: 'room' }, fp);
  if (zone) { r.style.fill = zoneColor(ZONES[zone]); r.style.fillOpacity = 0.12; r.dataset.zone = zone; }
  roomEls[id] = r;
  const label = svg('text', { x: x + 10, y: y + 22, class: 'room-name' }, fp);
  label.textContent = name;
});
const tags = {};
for (const [name, z] of Object.entries(ZONES)) {
  const g = svg('g', { class: 'tag', transform: `translate(${z.at[0] - 46} ${z.at[1] - 26})`, tabindex: 0, role: 'button', 'aria-label': `${name} ${z.t} °F` }, fp);
  svg('rect', { class: 'bg', width: 92, height: 52, rx: 4 }, g);
  svg('text', { x: 46, y: 20, 'text-anchor': 'middle' }, g).textContent = name;
  svg('text', { x: 46, y: 40, 'text-anchor': 'middle', class: 't' }, g).textContent = `${z.t.toFixed(1)} °F`;
  svg('rect', { y: 47, width: 92, height: 5, fill: zoneColor(z) }, g);
  g.dataset.zone = name;
  tags[name] = g;
}
function highlight(zone) {
  fp.classList.toggle('hovering', !!zone);
  ROOMS.forEach(([id, , , , , , z]) => {
    const on = zone && z === zone;
    roomEls[id].classList.toggle('hl', on);
    if (z) roomEls[id].style.fillOpacity = on ? 0.5 : 0.12;
  });
  Object.entries(tags).forEach(([n, g]) => g.classList.toggle('hl', n === zone));
}
fp.addEventListener('pointerover', (e) => {
  const el = e.target.closest('[data-zone]');
  highlight(el ? el.dataset.zone : null);
});
fp.addEventListener('pointerleave', () => highlight(null));
fp.addEventListener('focusin', (e) => highlight(e.target.closest('[data-zone]')?.dataset.zone));
fp.addEventListener('focusout', () => highlight(null));

$('#fpLegend').innerHTML = [
  ['Cold', ZONE.cold], ['Comfortable', ZONE.ok], ['Too warm', ZONE.warm], ['Alarm', ZONE.alarm], ['Offline', 'var(--neutralAccent)'],
].map(([n, c]) => `<div class="lg-row"><i style="background:${c}"></i>${n}</div>`).join('');

const kp = $('#keyplan');
[
  [10, 10, 70, 60, 'on'], [80, 10, 110, 40, ''], [80, 50, 60, 60, ''], [140, 50, 50, 60, ''],
].forEach(([x, y, w, h, on]) => svg('rect', { x, y, width: w, height: h, class: `wing ${on}` }, kp));

/* ---------------- heat pump summary ---------------- */
const HP = [
  ['HP-101', 'Class 101', 72.3, 72, 'Cool', 'On', 'Running', ''],
  ['HP-102', 'Class 102', 68.1, 72, 'Heat', 'On', 'Running', ''],
  ['HP-103', 'Class 103/104', 71.6, 72, 'Cool', 'On', 'Off', ''],
  ['HP-105', 'Office', 73.0, 72, 'Cool', 'On', 'Running', ''],
  ['HP-106', 'Band', 70.2, 72, 'Heat', 'Off', 'Off', 'High head pressure'],
  ['HP-107', 'Class 107', 71.9, 70, 'Cool', 'On', 'Running', '', 'sp'],
];
$('#hpTable').innerHTML = `<thead><tr><th>Unit</th><th>Room</th><th>Space Temp</th><th>Active SP</th><th>Mode</th><th>Fan</th><th>Compressor</th><th>Alarm</th></tr></thead><tbody>` +
  HP.map(([u, r, t, sp, m, f, c, a, ov]) => `<tr><td><a href="#floorplans">${u}</a></td><td>${r}</td><td class="num">${t.toFixed(1)} °F</td>` +
    `<td class="num ${ov === 'sp' ? 't-warm' : ''}">${sp.toFixed(1)} °F${ov === 'sp' ? ' (override)' : ''}</td>` +
    `<td>${m}</td><td>${f}</td><td>${c}</td><td class="${a ? 't-alarm' : 't-ok'}">${a || 'Normal'}</td></tr>`).join('') + '</tbody>';

/* ---------------- setup: theme JSON + overlay ---------------- */
const fullTheme = (key) => {
  const o = { theme: key, ...THEMES[key] };
  DELTA.status.forEach(([k, v]) => (o[k] = v));
  DELTA.chart.forEach(([k, v]) => (o[k] = v));
  DELTA.piping.forEach(([k, v]) => (o[k] = v));
  return o;
};
$('[data-copy-theme]').addEventListener('click', () =>
  copy(JSON.stringify([fullTheme('Nord_Dark'), fullTheme('Nord_Light')], null, 4), 'Nord_Dark and Nord_Light JSON'));

$('#overlayCode').textContent = JSON.stringify({
  alias: 'RMT_RMTSP', valueObject: 'RM_T', setpointObject: 'RM_T_SP', mode: 'valueCompare', unit: '°F', opacity: 10, mouseOver: 50,
  values: [{ value: -3, color: ZONE.cold }, { value: -2, color: ZONE.ok }, { value: 2, color: ZONE.ok }, { value: 3, color: ZONE.warm }],
}, null, 2);

/* ---------------- side nav: active section + mobile ---------------- */
const links = [...document.querySelectorAll('.side a')];
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${e.target.id}`));
  });
}, { rootMargin: '-30% 0px -60% 0px' });
document.querySelectorAll('main section').forEach((s) => io.observe(s));
$('[data-menu]').addEventListener('click', () => document.body.classList.toggle('nav-open'));
links.forEach((a) => a.addEventListener('click', () => document.body.classList.remove('nav-open')));

let saved = 'dark';
try { saved = localStorage.getItem('entec-sg-theme') || 'dark'; } catch {}
setTheme(saved);
