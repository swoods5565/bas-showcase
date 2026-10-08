import { CSS_THEMES } from './delta-themes.js';
import { TAG_LIST, TYPES, SECTIONS } from './tags.js';
import { RMCTRL_STRUCT } from './rmctrl-struct.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('entec-cfg-' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('entec-cfg-' + k, JSON.stringify(v)); } catch {} },
};
const toast = (msg) => {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), 1800);
};

/* ---------------- theme + menu (same as the guide) ---------------- */
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  document.querySelectorAll('[data-set-theme]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.setTheme === t));
  try { localStorage.setItem('entec-sg-theme', t); } catch {}
}
document.querySelectorAll('[data-set-theme]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.setTheme)));
try { setTheme(localStorage.getItem('entec-sg-theme') || 'dark'); } catch { setTheme('dark'); }
$('[data-menu]').addEventListener('click', () => document.body.classList.toggle('nav-open'));
document.querySelectorAll('.side a').forEach((a) => a.addEventListener('click', () => document.body.classList.remove('nav-open')));

/* ---------------- standard: tag prefixes -> type -> nav section ---------------- */
// Master tag list lives in tags.js. Extra prefixes a tech adds here are kept in this browser.
const extraTags = store.get('tags', []);
const PREFIXES = {};
const rebuildPrefixes = () => {
  Object.keys(PREFIXES).forEach((k) => delete PREFIXES[k]);
  [...TAG_LIST, ...extraTags].forEach(([p, t]) => (PREFIXES[p.toUpperCase()] = t));
};
rebuildPrefixes();
const isRoomType = (t) => ['TU', 'MISC'].includes(TYPES[t]?.section);
const isLight = (t) => t === 'LIGHT';
const hasRooms = (t) => isRoomType(t) || isLight(t);

function renderPrefixes() {
  const secName = (t) => SECTIONS.find((x) => x[0] === TYPES[t].section)?.[1] || 'Lighting (room file only)';
  $('#prefix-table').innerHTML = '<thead><tr><th>Tag prefix</th><th>What it is</th><th>Type</th><th>Nav section</th><th>Flyout heading</th><th></th></tr></thead><tbody>' +
    [...TAG_LIST.map((r) => [...r, false]), ...extraTags.map((r, i) => [...r, i])].map(([p, t, what, extra]) =>
      `<tr><td><code>${esc(p)}-</code></td><td>${esc(what)}</td><td>${t}</td><td>${secName(t)}</td><td>${TYPES[t].heading}</td>
      <td>${extra === false ? '' : `<button class="btn" data-del-tag="${extra}" type="button">Remove</button>`}</td></tr>`).join('') +
    `<tr><td><input id="nt-p" placeholder="TU" size="6"></td><td><input id="nt-w" placeholder="What it is"></td>
      <td><select id="nt-t">${Object.keys(TYPES).map((t) => `<option>${t}</option>`).join('')}</select></td>
      <td colspan="3"><button class="btn" id="nt-add" type="button">Add prefix</button> <span class="hint">kept in this browser; ask to add it to the master list</span></td></tr></tbody>`;
}
renderPrefixes();
$('#prefix-table').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del-tag]');
  if (del) extraTags.splice(Number(del.dataset.delTag), 1);
  else if (e.target.id === 'nt-add') {
    const p = $('#nt-p').value.trim().toUpperCase().replace(/-$/, '');
    if (!p) return toast('Enter a prefix');
    extraTags.push([p, $('#nt-t').value, $('#nt-w').value.trim() || p]);
  } else return;
  store.set('tags', extraTags);
  rebuildPrefixes(); renderPrefixes();
  project.buildings.forEach((b) => b.devices.forEach((d) => { const t = PREFIXES[d.tag.split('-')[0]]; if (t && d.type === 'OTHER') d.type = t; }));
  saveProject();
  renderAll();
});

/* ---------------- room control columns (Delta RmCtrlStruct.json) ---------------- */
const STRUCT = new Map(RMCTRL_STRUCT.map(([a, en, ro]) => [a, { en, ro }]));
// RM_ columns must match an alias exactly; others are CATEGORY_NAME, both parts looked up.
const colKnown = (c) => {
  if (STRUCT.has(c)) return true;
  if (c.startsWith('RM_')) return false;
  const i = c.indexOf('_');
  return i > 0 && STRUCT.has(c.slice(0, i)) && STRUCT.has(c.slice(i + 1));
};
const dl = document.createElement('datalist');
dl.id = 'rm-cols';
dl.innerHTML = RMCTRL_STRUCT.map(([a, en]) => `<option value="${esc(a)}">${esc(en)}</option>`).join('');
document.body.appendChild(dl);
const SYMBOL_LIST = document.createElement('datalist');
SYMBOL_LIST.id = 'rm-symbols';
document.body.appendChild(SYMBOL_LIST);

/* ---------------- object map defaults ---------------- */
// Room view symbols that exist in Delta's palette/RoomControlEquipment.dg5.
const SYMBOLS = ['VAV', 'VAV_RH', 'CAV', 'CAV_RH', 'FPB', 'TA', 'FCU_6W_VLV', 'FCU_CLG', 'FCU_FLT_EF', 'CRAC', 'FH', 'IND', 'LIGHT', 'SimpleLight', 'VAV MECH'];
SYMBOL_LIST.innerHTML = SYMBOLS.map((x) => `<option value="${x}">`).join('');
const DEFAULT_SYMBOL = { VAV: 'VAV_RH', FPVAV: 'FPB', FCU: 'FCU_6W_VLV', LIGHT: 'LIGHT' };
// VAV and LIGHT come from Delta's EWM example; the heat pump map is Brown County's. Confirm against ENTEC's programs.
const DEFAULT_MAPS = {
  VAV: '# From Delta\'s EWM example VAV: confirm\nRM_T=AI1\nRM_T_SP=AV6\nSA_T=AI2\nDMP_POS=AV16\nFLOW_AMP=AV18\nFLOW_SP=AV5\nHC=AO3',
  FPVAV: 'RM_T=\nRM_T_SP=\nSA_T=\nDMP_POS=\nFLOW_AMP=\nFLOW_SP=\nFAN_ST=\nHC=',
  HP: '# From Brown County heat pumps\nMODE_OPER=MV101\nRM_T=AI201001\nRM_T_SP=AV10290\nSA_T=AI1\nFAN_SS=BO1\nCOMP_CMD=BO3\nCOMP_REV_VLV_CMD=BO2\nCOMP_ENT_TMP=AI2\nCOMP_LVG_TMP=AI3\nCOMP_CONDENSATE=BI5\nCOMP_FAULT=BI4',
  FCU: 'RM_T=\nRM_T_SP=\nFAN_SS=\nHC=\nCC=\nSA_T=',
  UV: 'RM_T=\nRM_T_SP=\nFAN_SS=\nHC=\nDMP_POS=',
  CUH: 'RM_T=\nRM_T_SP=\nFAN_SS=\nHC=',
  EF: 'FAN_SS=\nFAN_ST=',
  OTHER: 'RM_T=\nRM_T_SP=',
  LIGHT: '# From Delta\'s EWM example lighting: confirm\nLIGHT_CMD=BO101\nLIGHT_MOD=AV101\nRM_OCC=BI101',
};
const maps = { ...DEFAULT_MAPS, ...store.get('maps', {}) };
const symbols = { ...DEFAULT_SYMBOL, ...store.get('symbols', {}) };
const parseMap = (txt) => (txt || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; });

/* ---------------- CSV parse / write ---------------- */
function parseCSV(text) {
  const rows = []; let row = []; let f = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); rows.push(row); row = []; f = '';
    } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x !== ''));
}
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCSV = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

/* ---------------- device name parsing ---------------- */
const TAG_RE = /^[A-Z]{1,5}-[A-Z0-9]+(?:-[A-Z0-9]+)*$/i;
const fixCase = (s) => s.replace(/'S\b/g, "'s").replace(/\s+/g, ' ').trim();

function parseRooms(text) {
  return (text || '').split(',').map((r) => fixCase(r)).filter(Boolean).map((r) => {
    const m = r.match(/^(.*?)\s+([A-Z]?\d+[A-Z]?)$/i);
    return m ? { name: m[1], number: m[2] } : { name: r, number: '' };
  });
}

function parseDevice(name, instance) {
  const clean = name.split('//')[0].trim();
  const tokens = clean.split(/\s+/);
  let idx = tokens.findIndex((t) => TAG_RE.test(t.replace(/,$/, '')) && PREFIXES[t.split('-')[0].toUpperCase()]);
  if (idx < 0) idx = tokens.findIndex((t) => TAG_RE.test(t.replace(/,$/, '')));
  const tag = idx >= 0 ? tokens[idx].replace(/,$/, '').toUpperCase() : '';
  const rest = idx >= 0 ? [...tokens.slice(0, idx), ...tokens.slice(idx + 1)].join(' ') : clean;
  const type = PREFIXES[tag.split('-')[0]] || 'OTHER';
  const roomType = hasRooms(type);
  return {
    include: true,
    instance: String(instance).trim(),
    tag: tag || clean,
    type,
    desc: roomType ? '' : fixCase(rest),
    rooms: roomType ? fixCase(rest) : '',
    servedBy: '',
    note: name.includes('//') ? name.split('//').slice(1).join('//').trim() : '',
  };
}

// AT-3-11 -> fed by the air unit numbered 3 (AHU-3, RTU-3, ...).
function linkServedBy(devs) {
  const air = devs.filter((d) => TYPES[d.type].section === 'AIR');
  devs.forEach((d) => {
    if (!isRoomType(d.type) || d.servedBy) return;
    const parts = d.tag.split('-');
    if (parts.length < 3) return;
    const hit = air.find((a) => a.tag.split('-').slice(1).join('-') === parts[1]);
    d.servedBy = hit ? hit.tag : '';
  });
}

/* ---------------- project state ---------------- */
const blankBuilding = () => ({ bldg: '', proj: '', projTouched: false, site: '', range: '', city: '', level: '1', oadev: '', oat: '', oah: '', light: false, areas: '', devices: [] });
let project = store.get('project', null);
if (!project?.buildings?.length) project = { campus: '', pkg: 'good', theme: 'Nord_Dark', extra: false, active: 0, buildings: [blankBuilding()] };
const cur = () => project.buildings[project.active];
const multi = () => project.buildings.length > 1;
const bName = (b, i) => b.bldg || `Building ${i + 1}`;
const projName = (b, i) => b.proj || (b.bldg ? b.bldg.replace(/[^A-Za-z0-9]/g, '') : `Building${i + 1}`);
function saveProject() { store.set('project', project); }

const P_FIELDS = ['campus', 'pkg', 'theme', 'extra'];
const B_FIELDS = ['bldg', 'proj', 'site', 'range', 'city', 'level', 'oadev', 'oat', 'oah', 'light', 'areas'];
const setField = (el, v) => { if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? ''; };
const readField = (el) => (el.type === 'checkbox' ? el.checked : el.value.trim());
P_FIELDS.forEach((k) => {
  const el = $('#p-' + k);
  setField(el, project[k]);
  el.addEventListener('input', () => { project[k] = readField(el); saveProject(); renderDerived(); });
});
B_FIELDS.forEach((k) => {
  const el = $('#b-' + k);
  el.addEventListener('input', () => {
    const b = cur();
    b[k] = readField(el);
    b.typed = { ...b.typed, [k]: !!b[k] };
    if (k === 'proj') b.projTouched = true;
    if (k === 'bldg' && !b.projTouched) { b.proj = b.bldg.replace(/[^A-Za-z0-9]/g, ''); $('#b-proj').value = b.proj; }
    saveProject();
    if (k === 'bldg') renderTabs();
    renderDerived();
  });
});
function fillBuildingForm() { B_FIELDS.forEach((k) => setField($('#b-' + k), cur()[k])); }

function renderTabs() {
  $('#bldg-tabs').innerHTML = project.buildings.map((b, i) =>
    `<button type="button" role="tab" data-tab="${i}" aria-selected="${i === project.active}">${esc(bName(b, i))}</button>`).join('') +
    '<button type="button" class="add" data-add>+ Add building</button>';
  const label = multi() ? `for ${bName(cur(), project.active)}` : '';
  $('#eq-for').textContent = label;
  $('#areas-for').textContent = label;
  $('#b-remove').hidden = !multi();
}
$('#bldg-tabs').addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) project.active = Number(t.dataset.tab);
  else if (e.target.closest('[data-add]')) { project.buildings.push(blankBuilding()); project.active = project.buildings.length - 1; }
  else return;
  saveProject(); fillBuildingForm(); renderAll();
});
$('#b-remove').addEventListener('click', () => {
  if (!multi() || !confirm(`Remove ${bName(cur(), project.active)} and its equipment list?`)) return;
  project.buildings.splice(project.active, 1);
  project.active = Math.max(0, project.active - 1);
  saveProject(); fillBuildingForm(); renderAll();
});

/* ---------------- load export ---------------- */
function loadCSV(text, label) {
  const rows = parseCSV(text);
  if (!rows.length) return toast('That file is empty');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n) => head.indexOf(n);
  const iName = col('device name') >= 0 ? col('device name') : col('name');
  const iDev = col('device');
  const iRef = col('object reference');
  const iSite = col('site');
  if (iName < 0 || iDev < 0) return toast('Expected "Device Name" and "Device" columns');
  const body = rows.slice(1).filter((r) => iRef < 0 || /\.DEV\d+/i.test(r[iRef] || '') || !r[iRef]);
  const b = cur();
  b.devices = body.filter((r) => r[iName] && r[iDev]).map((r) => parseDevice(r[iName], r[iDev]));
  b.devices.sort((x, y) => Number(x.instance) - Number(y.instance));
  linkServedBy(b.devices);
  // Fields filled from the export are refilled on every load; ones the tech typed are kept.
  const auto = (k, v) => { if (!b.typed?.[k]) b[k] = v ?? ''; };
  auto('site', iSite >= 0 ? body[0]?.[iSite] : '');
  const inst = b.devices.map((d) => Number(d.instance)).filter((n) => !Number.isNaN(n));
  auto('range', inst.length ? `${Math.floor(Math.min(...inst) / 100) * 100}/${Math.floor(Math.max(...inst) / 100) * 100 + 99}` : '');
  const air = b.devices.find((d) => TYPES[d.type].section === 'AIR');
  auto('bldg', air?.desc);
  if (!b.projTouched) b.proj = b.bldg.replace(/[^A-Za-z0-9]/g, '');
  auto('oadev', air?.instance);
  saveProject();
  fillBuildingForm();
  toast(`Loaded ${b.devices.length} devices from ${label}`);
  renderAll();
}

const drop = $('#drop');
['dragenter', 'dragover'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, () => drop.classList.remove('over')));
drop.addEventListener('drop', (ev) => { ev.preventDefault(); const f = ev.dataTransfer.files[0]; if (f) f.text().then((t) => loadCSV(t, f.name)); });
$('#file').addEventListener('change', (ev) => { const f = ev.target.files[0]; if (f) f.text().then((t) => loadCSV(t, f.name)); ev.target.value = ''; });
$('#paste-btn').addEventListener('click', () => { $('#paste').hidden = false; $('#paste-use').hidden = false; $('#paste').focus(); });
$('#paste-use').addEventListener('click', () => loadCSV($('#paste').value, 'pasted text'));
$('#sample-btn').addEventListener('click', () => fetch('sample-objectlist.csv').then((r) => r.text()).then((t) => {
  const b = cur();
  Object.assign(b, { bldg: '', proj: '', projTouched: false, site: '', range: '', oadev: '', typed: {} });
  if (!b.areas) b.areas = 'Overall Building\nClassroom Wing\nGym';
  loadCSV(t, 'the sample');
}).catch(() => toast('Sample needs the page served over http')));

/* ---------------- equipment table ---------------- */
const typeOptions = (sel) => Object.keys(TYPES).map((t) => `<option ${t === sel ? 'selected' : ''}>${t}</option>`).join('');
function renderEquipment() {
  const devices = cur().devices;
  $('#eq-wrap').hidden = !devices.length;
  if (!devices.length) { $('#eq-summary').textContent = 'No devices loaded for this building yet.'; return; }
  const counts = {};
  devices.filter((d) => d.include).forEach((d) => (counts[d.type] = (counts[d.type] || 0) + 1));
  $('#eq-summary').innerHTML = `<b>${devices.filter((d) => d.include).length}</b> devices: ` +
    Object.entries(counts).map(([t, n]) => `${n} ${t}`).join(' · ') + '. Edit anything that parsed wrong.';
  $('#eq-table').innerHTML = '<thead><tr><th></th><th>Instance</th><th>Tag</th><th>Type</th><th>Served by</th><th>Rooms served (comma separated) / description</th><th>Note</th></tr></thead><tbody>' +
    devices.map((d, i) => `<tr class="${d.include ? '' : 'off'}" data-i="${i}">
      <td><input type="checkbox" data-k="include" ${d.include ? 'checked' : ''} aria-label="Include ${esc(d.tag)}"></td>
      <td>${esc(d.instance)}</td>
      <td class="tag"><input data-k="tag" value="${esc(d.tag)}"></td>
      <td><select data-k="type">${typeOptions(d.type)}</select></td>
      <td><input data-k="servedBy" value="${esc(d.servedBy)}" ${isRoomType(d.type) ? '' : 'disabled'}></td>
      <td class="rooms"><input data-k="${hasRooms(d.type) ? 'rooms' : 'desc'}" value="${esc(hasRooms(d.type) ? d.rooms : d.desc)}"></td>
      <td class="muted small">${esc(d.note)}</td></tr>`).join('') + '</tbody>';
}
$('#eq-table').addEventListener('change', (e) => {
  const tr = e.target.closest('tr[data-i]'); if (!tr) return;
  const d = cur().devices[tr.dataset.i]; const k = e.target.dataset.k;
  d[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value.trim();
  saveProject();
  if (k === 'type' || k === 'include') { renderEquipment(); renderObjects(); }
  renderDerived();
});

/* ---------------- object map editors ---------------- */
const allIncluded = () => project.buildings.flatMap((b) => b.devices.filter((d) => d.include));
function mapTypes() {
  const used = [...new Set(allIncluded().filter((d) => isRoomType(d.type)).map((d) => d.type))];
  const show = used.length ? used : ['VAV', 'HP'];
  if (project.buildings.some(lit) && !show.includes('LIGHT')) show.push('LIGHT');
  return show;
}
function renderObjects() {
  $('#obj-grid').innerHTML = mapTypes().map((t) => {
    const m = parseMap(maps[t]);
    const empty = m.filter(([, v]) => !v).length;
    const bad = m.map(([c]) => c).filter((c) => !colKnown(c));
    const sym = symbols[t] || '';
    return `<div class="obj-card"><div class="obj-head">${t} <span class="hint">${esc(TYPES[t]?.label || 'Lighting')}</span></div>
      <label class="hint">Room view symbol
        <input data-sym="${t}" list="rm-symbols" value="${esc(sym)}" placeholder="Pick or type a symbol name"></label>
      <textarea data-type="${t}" spellcheck="false" aria-label="${t} object map">${esc(maps[t] || '')}</textarea>
      ${empty ? `<span class="obj-empty">${empty} object${empty > 1 ? 's' : ''} not filled in</span>` : ''}
      ${bad.length ? `<span class="obj-bad">Not in Delta's column list: ${bad.map(esc).join(', ')}</span>` : ''}
      <input list="rm-cols" placeholder="Look up a column name…" aria-label="Look up a column name"></div>`;
  }).join('');
}
$('#obj-grid').addEventListener('change', (e) => {
  const t = e.target.dataset.type;
  const s = e.target.dataset.sym;
  if (t) { maps[t] = e.target.value; const c = store.get('maps', {}); c[t] = e.target.value; store.set('maps', c); }
  else if (s) { symbols[s] = e.target.value; const c = store.get('symbols', {}); c[s] = e.target.value; store.set('symbols', c); }
  else if (e.target.list) {
    const v = e.target.value.trim();
    const hit = STRUCT.get(v);
    toast(hit ? `${v}: ${hit.en}${hit.ro ? ' (read only)' : ''}` : `${v} isn't in Delta's list`);
    return;
  } else return;
  renderObjects(); renderDerived();
});

/* ---------------- builders ---------------- */
const alias = (s) => s.replace(/[^A-Za-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
const included = (b) => b.devices.filter((d) => d.include);
const lit = (b) => b.light || included(b).some((d) => isLight(d.type));
const areasOf = (b) => (b.areas || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

function roomRows(b) {
  const rows = [];
  included(b).filter((d) => isRoomType(d.type)).forEach((d) => {
    const list = parseRooms(d.rooms);
    (list.length ? list : [{ name: d.tag, number: '' }]).forEach((r) => rows.push({ d, room: r.number || r.name, en: r.number ? `${r.name} ${r.number}` : r.name }));
  });
  return rows;
}

function buildRoomCSV(b) {
  const lvl = b.level || '1';
  const rr = roomRows(b);
  const types = [...new Set(rr.map((r) => r.d.type))];
  if (b.light || included(b).some((d) => isLight(d.type))) types.push('LIGHT');
  const typeMaps = {};
  const objCols = [];
  types.forEach((t) => {
    typeMaps[t] = Object.fromEntries(parseMap(maps[t]));
    Object.keys(typeMaps[t]).forEach((c) => { if (!objCols.includes(c)) objCols.push(c); });
  });
  const head = ['address', 'room', 'level', 'en', 'equipmentType', 'equipmentTag', 'equipmentSymbol', 'sys', 'folder', 'pageInclude', 'HAL', ...objCols];
  const row = (addr, room, en, type, tag, sys, hal) =>
    [addr, room, lvl, en, type, tag, symbols[type] || '', sys, '', 'room', hal, ...objCols.map((c) => typeMaps[type][c] || '')];
  const rows = rr.map(({ d, room, en }) => row(d.instance, room, en, d.type, d.tag, d.servedBy, 'HVAC'));
  const lc = included(b).filter((d) => isLight(d.type));
  if (lc.length) {
    // Lighting controllers from the export: one LIGHT row per room they list.
    lc.forEach((d) => parseRooms(d.rooms).forEach((r) => {
      const room = r.number || r.name;
      rows.push(row(d.instance, room, r.number ? `${r.name} ${r.number}` : r.name, 'LIGHT', d.tag, '', 'LIGHT'));
    }));
  } else if (b.light) {
    // No lighting controllers in the export: fall back to one LIGHT row per room on its first HVAC controller.
    const seen = new Set();
    rr.forEach(({ d, room, en }) => { if (!seen.has(room)) { seen.add(room); rows.push(row(d.instance, room, en, 'LIGHT', `L-${room}`, '', 'LIGHT')); } });
  }
  return toCSV([head, ...rows]);
}

const NAV_HEAD = ['menu', 'pageAlias', 'en', 'buttonSuffix', 'folder', 'pageInclude', 'zoomEnabled', 'overlayEnabled', 'address', 'systemFilter', 'forceInfoPanelObj', 'title', 'subTitle', 'subTitlePrefix', 'subTitleSuffix', 'blacklist'];

// Titles and subtitles are translation aliases; tr collects ALIAS -> text for Translation.csv.
function buildNavCSV(b, i, tr) {
  const proj = projName(b, i);
  const tTitle = `T_${proj}`;
  tr[tTitle] = b.bldg || proj;
  const R = (menu, pa, en, folder = '', inc = '', o = {}) => {
    let sub = '';
    if (inc) { sub = `ST_${proj}_${pa}`; tr[sub] = o.sub || en; }
    return [menu, pa, en, '', folder, inc, '', o.overlay ? 'true' : '', o.address || '', '', '', inc ? tTitle : '', sub, '', '', ''];
  };
  const H = (menu, en) => R(menu, menu, en);
  const rows = [R('HOME', 'Main', 'Home', 'home', 'homePage', { sub: 'Home' })];
  const used = new Set(['Main']);
  const uniq = (a) => { let x = a; let n = 2; while (used.has(x)) x = `${a}_${n++}`; used.add(x); return x; };

  const areas = areasOf(b).map((a) => ({ a, pa: uniq(alias(a) + '_FP') }));
  if (areas.length) {
    rows.push(H('FP', 'Floor Plans'), H('FP', 'AREAS'));
    areas.forEach(({ a, pa }) => rows.push(R('FP', pa, a, 'floorplans', pa, { overlay: true, sub: `${a} Floor Plan` })));
  }
  for (const [sec, secName] of SECTIONS) {
    const devs = included(b).filter((d) => TYPES[d.type].section === sec);
    if (!devs.length) continue;
    rows.push(H(sec, secName));
    const types = [...new Set(devs.map((d) => d.type))];
    if (sec === 'AIR' || sec === 'PLANT') {
      types.forEach((t) => {
        rows.push(H(sec, TYPES[t].heading));
        devs.filter((d) => d.type === t).forEach((d) => {
          const pa = uniq(alias(d.tag));
          const en = d.desc ? `${d.tag} ${d.desc}` : d.tag;
          rows.push(R(sec, pa, en, sec === 'AIR' ? 'air' : 'plant', pa, { address: d.instance }));
        });
      });
      rows.push(H(sec, 'SUMMARY'));
      types.forEach((t) => { const pa = uniq(`${t}_Summary`); rows.push(R(sec, pa, `${TYPES[t].label} Summary`, 'summary', pa)); });
    } else {
      types.forEach((t) => {
        rows.push(H(sec, TYPES[t].heading));
        const pa = uniq(`${t}_Summary`);
        rows.push(R(sec, pa, `${TYPES[t].label} Summary`, 'summary', pa));
      });
      if (sec === 'TU') { rows.push(H(sec, 'ROOMS')); rows.push(R(sec, uniq('Room_Summary'), 'Room Summary', 'roomControl', 'roomControlTable')); }
    }
  }
  if (lit(b)) {
    // menu LIGHT switches the room control mode; same floor plan files, new page aliases.
    rows.push(H('LIGHT', 'Lighting'));
    if (areas.length) {
      rows.push(H('LIGHT', 'FLOOR PLANS'));
      areas.forEach(({ a, pa }) => rows.push(R('LIGHT', uniq(`${pa}_Light`), a, 'floorplans', pa, { overlay: true, sub: `${a} Lighting` })));
    }
    rows.push(H('LIGHT', 'ROOMS'), R('LIGHT', uniq('Room_Summary_Light'), 'Room Summary', 'roomControl', 'roomControlTable', { sub: 'Lighting Room Summary' }));
  }
  if (project.extra) {
    rows.push(H('DASH', 'Dashboards'), R('DASH', uniq('Bldg_Summary'), 'Building Summary', 'dashboards', 'Bldg_Summary'));
    rows.push(H('ALARM', 'Alarms'), R('ALARM', uniq('Active_Alarms'), 'Active Alarms', 'alarms', 'Active_Alarms'));
    rows.push(H('TREND', 'Trends'), R('TREND', uniq('Trend_Viewer'), 'Trend Viewer', 'trends', 'Trend_Viewer'));
    rows.push(H('SCHED', 'Schedules'), R('SCHED', uniq('Bldg_Schedules'), 'Building Schedules', 'schedules', 'Bldg_Schedules'));
    rows.push(H('RPT', 'Reports'));
    [['Rpt_Overrides', 'Overrides'], ['Rpt_AlarmHistory', 'Alarm History'], ['Rpt_Faults', 'Points in Fault/Offline'], ['Rpt_Runtime', 'Runtime Hours']]
      .forEach(([pa, en]) => rows.push(R('RPT', uniq(pa), en, 'reports', pa)));
    rows.push(H('LEGEND', 'Legend'), R('LEGEND', uniq('Legend'), 'Symbols & Colors', 'legend', 'Legend'));
  }
  return toCSV([NAV_HEAD, ...rows]);
}

const campusName = () => project.campus || project.buildings[0]?.bldg || 'Campus';

function buildCampusCSV(tr) {
  tr.MAIN_T = campusName(); // Delta's stock pages use MAIN_T for the project name
  tr.T_CAMPUS = campusName();
  tr.ST_CAMPUS = 'Campus';
  return toCSV([NAV_HEAD, ['HOME', 'Main', 'Home', '', 'home', 'homePage', '', '', '', '', '', 'T_CAMPUS', 'ST_CAMPUS', '', '', '']]);
}

function buildBuildingsCSV() {
  const head = ['en', 'projCSV', 'roomCSV', 'projTranslation', 'siteInformationList', 'city', 'conditionsDev', 'OAT', 'OAH', 'blacklist', 'CAL', 'URL'];
  // Campus must be the first row; enteliVIZ hides it when there's only one building.
  const rows = [[campusName(), 'Campus', '', '', '', project.buildings[0]?.city || '', '', '', '', '', '', '']];
  project.buildings.forEach((b, i) => {
    const proj = projName(b, i);
    rows.push([b.bldg || proj, proj, `${proj}_RoomControl`, '', b.site && b.range ? `${b.site}/${b.range}` : '', b.city,
      b.site && b.oadev ? `/Network/${b.site}/${b.oadev}/` : '', b.oat, b.oah, '', '', '']);
  });
  return toCSV([head, ...rows]);
}

const buildOverlays = () => JSON.stringify([{
  alias: 'RMT_RMTSP', valueObject: 'RM_T', setpointObject: 'RM_T_SP', mode: 'valueCompare', unit: '°F', opacity: 10, mouseOver: 50,
  values: [{ value: -3, color: '#30a3dc' }, { value: -2, color: '#a1bc2d' }, { value: 2, color: '#a1bc2d' }, { value: 3, color: '#ff9900' }],
}], null, 4);

function files() {
  const tr = {};
  const out = [];
  const campus = buildCampusCSV(tr);
  project.buildings.forEach((b, i) => {
    const proj = projName(b, i);
    out.push({ path: `_Proj_Lib/CSV/${proj}.csv`, what: `${bName(b, i)}: navigation`, body: buildNavCSV(b, i, tr) });
    out.push({ path: `_Proj_Lib/CSV/${proj}_RoomControl.csv`, what: `${bName(b, i)}: rooms${lit(b) ? ', terminal units and lighting' : ' and terminal units'}`, body: buildRoomCSV(b) });
  });
  const trCSV = toCSV([['ALIAS', 'en'], ...Object.entries(tr)]);
  return [
    { path: '_Proj_Lib/CSV/Buildings.csv', what: 'Campus and building list (project.df5 buildingCSV)', body: buildBuildingsCSV() },
    { path: '_Proj_Lib/CSV/Campus.csv', what: 'Campus page navigation', body: campus },
    ...out,
    { path: '_Proj_Lib/CSV/Translation.csv', what: 'Page titles for every building (project.df5 projectTranslationCSV)', body: trCSV },
    { path: 'assets/CSV/CSS.json', what: `Themes: Delta stock + Nord. Set selectedTheme to ${project.theme}`, body: JSON.stringify(CSS_THEMES, null, 4) },
    { path: 'assets/CSV/floorplanOverlays.json', what: 'Floor plan zone colors', body: buildOverlays() },
  ];
}

/* ---------------- render derived ---------------- */
function warnings() {
  const w = [];
  const projs = project.buildings.map(projName);
  const dupProj = projs.filter((p, i) => projs.indexOf(p) !== i);
  if (dupProj.length) w.push(`Two buildings use the same nav CSV name: ${[...new Set(dupProj)].join(', ')}.`);
  project.buildings.forEach((b, i) => {
    const pre = multi() ? `${bName(b, i)}: ` : '';
    if (!b.devices.length) w.push(`${pre}load the enteliWEB device list in step 2.`);
    if (!b.bldg) w.push(`${pre}building name is empty.`);
    if (!b.site || !b.range) w.push(`${pre}site or device range is empty, so enteliVIZ can't tell which devices belong to this building.`);
    if (!b.oat || !b.oah) w.push(`${pre}outdoor air temp and humidity objects are empty, so the header won't show outdoor conditions.`);
    const tags = included(b).map((d) => d.tag);
    const dup = tags.filter((t, j) => tags.indexOf(t) !== j);
    if (dup.length) w.push(`${pre}duplicate tags ${[...new Set(dup)].join(', ')}.`);
    const noRooms = included(b).filter((d) => hasRooms(d.type) && !parseRooms(d.rooms).length);
    if (b.light && !included(b).some((d) => isLight(d.type))) w.push(`${pre}lighting is on but no lighting controllers are in the export, so lighting rows use each room's VAV controller address. Add the lighting controllers' tag prefix to the tag list (type LIGHT) if they're in the export.`);
    if (noRooms.length) w.push(`${pre}no rooms parsed for ${noRooms.map((d) => d.tag).join(', ')}.`);
    if (lit(b) && !areasOf(b).length) w.push(`${pre}lighting is on but there are no floor plan areas, so the Lighting section only has the room summary.`);
  });
  const types = [...new Set(allIncluded().filter((d) => isRoomType(d.type)).map((d) => d.type))];
  types.forEach((t) => {
    if (!parseMap(maps[t]).find(([c, v]) => c === 'RM_T' && v)) w.push(`${t}: RM_T (room temp object) isn't set in the object map, so floor plan colors won't work for ${t}s.`);
    if (!symbols[t]) w.push(`${t}: no room view symbol picked, so the equipment preview won't show on the room page.`);
  });
  return w;
}

function renderDerived() {
  const b = cur();
  const rr = roomRows(b);
  $('#rm-wrap').hidden = !rr.length;
  const byRoom = {};
  rr.forEach((r) => (byRoom[r.room] = (byRoom[r.room] || []).concat(r.d.tag)));
  const shared = Object.entries(byRoom).filter(([, t]) => t.length > 1);
  $('#rm-summary').innerHTML = rr.length
    ? `<b>${Object.keys(byRoom).length}</b> rooms, <b>${rr.length}</b> HVAC rows${lit(b) ? ' plus lighting rows' : ''}.` +
      (shared.length ? ` Served by more than one unit: ${shared.map(([r, t]) => `${esc(r)} (${t.map(esc).join(', ')})`).join('; ')}.` : '')
    : 'Rooms appear here once equipment is loaded.';
  $('#rm-table').innerHTML = '<thead><tr><th>room</th><th>en</th><th>equipmentTag</th><th>address</th><th>sys (served by)</th></tr></thead><tbody>' +
    rr.map(({ d, room, en }) => `<tr><td>${esc(room)}</td><td>${esc(en)}</td><td>${esc(d.tag)}</td><td>${esc(d.instance)}</td><td>${esc(d.servedBy)}</td></tr>`).join('') + '</tbody>';

  $('#warnings').innerHTML = warnings().map((w) => `<div class="warn">${esc(w[0].toUpperCase() + w.slice(1))}</div>`).join('');
  $('#file-list').innerHTML = files().map((f, i) => `<div class="file"><div class="file-h"><span><code>${esc(f.path)}</code> <span class="hint">${esc(f.what)}</span></span>
    <button class="btn" data-dl="${i}" type="button">Download</button></div><pre>${esc(f.body.length > 6000 ? f.body.slice(0, 6000) + '\n…' : f.body)}</pre></div>`).join('');
}
function renderAll() { renderTabs(); renderEquipment(); renderObjects(); renderDerived(); }

/* ---------------- downloads ---------------- */
const enc = new TextEncoder();
function save(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$('#file-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-dl]'); if (!btn) return;
  const f = files()[btn.dataset.dl];
  save(f.path.split('/').pop(), new Blob([f.body], { type: 'text/plain' }));
});

// Minimal zip writer (stored, no compression), so the page needs no libraries and works offline in enteliWEB.
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(entries) {
  const parts = []; const central = []; let offset = 0;
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const { name, data } of entries) {
    const n = enc.encode(name); const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, time, 2], [12, date, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, n.length, 2], [28, 0, 2]]
      .forEach(([o, v, s]) => (s === 4 ? lh.setUint32(o, v, true) : lh.setUint16(o, v, true)));
    parts.push(lh, n, data);
    const ch = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, time, 2], [14, date, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, n.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]
      .forEach(([o, v, s]) => (s === 4 ? ch.setUint32(o, v, true) : ch.setUint16(o, v, true)));
    central.push(ch, n);
    offset += 30 + n.length + data.length;
  }
  const size = central.reduce((s, p) => s + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [8, entries.length, 2], [10, entries.length, 2], [12, size, 4], [16, offset, 4]]
    .forEach(([o, v, s]) => (s === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true)));
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
$('#zip-btn').addEventListener('click', () => {
  if (!allIncluded().length) return toast('Load a device list first');
  const fs = files();
  const ws = warnings();
  const readme = `ENTEC enteliVIZ files for ${campusName()}\nGenerated ${new Date().toLocaleString()}\n\n` +
    fs.map((f) => `${f.path}\n  ${f.what}`).join('\n') +
    `\n\nAfter copying into the project:\n- project.df5: buildingCSV = _Proj_Lib/CSV/Buildings.csv, projectTranslationCSV = _Proj_Lib/CSV/Translation.csv\n- project.df5: selectedTheme = ${project.theme}\n- Main.dg5: alarmCounter = true\n- Draw the pages named in each building's nav CSV in the designer\n` +
    (ws.length ? `\nWarnings:\n${ws.map((w) => '- ' + w).join('\n')}\n` : '');
  const entries = [...fs.map((f) => ({ name: f.path, data: enc.encode(f.body) })), { name: 'README.txt', data: enc.encode(readme) }];
  save(`${alias(campusName())}_enteliVIZ_files.zip`, zip(entries));
});

fillBuildingForm();
renderAll();
