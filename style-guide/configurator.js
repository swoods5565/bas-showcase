import { CSS_THEMES } from './delta-themes.js';
import { TAG_LIST, TYPES, SECTIONS } from './tags.js';

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

function renderPrefixes() {
  const secName = (t) => SECTIONS.find((x) => x[0] === TYPES[t].section)[1];
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
  devices.forEach((d) => { const t = PREFIXES[d.tag.split('-')[0]]; if (t && d.type === 'OTHER') d.type = t; });
  renderAll();
});

/* ---------------- object map defaults ---------------- */
// Heat pump map is the one used on Brown County. Others are left for the tech to fill once.
const DEFAULT_MAPS = {
  VAV: 'RM_T=\nRM_T_SP=\nSA_AF=\nSA_AF_SP=\nDMP_POS=\nHW_VLV=\nSA_TMP=',
  FPVAV: 'RM_T=\nRM_T_SP=\nSA_AF=\nSA_AF_SP=\nDMP_POS=\nFAN_STS=\nHW_VLV=\nSA_TMP=',
  HP: 'RM_MODE=MV101\nRM_T=AI201001\nRM_T_SP=AV10290\nSA_TMP=AI1\nFAN_CMD=BO1\nCOMP_CMD=BO3\nCOMP_REV_VLV_CMD=BO2\nCOMP_ENT_TMP=AI2\nCOMP_LVG_TMP=AI3\nCOMP_CONDENSATE=BI5\nCOMP_FAULT=BI4',
  FCU: 'RM_T=\nRM_T_SP=\nFAN_CMD=\nHW_VLV=\nCHW_VLV=\nSA_TMP=',
  UV: 'RM_T=\nRM_T_SP=\nFAN_CMD=\nHW_VLV=\nDMP_POS=',
  CUH: 'RM_T=\nRM_T_SP=\nFAN_CMD=\nHW_VLV=',
  EF: 'FAN_CMD=\nFAN_STS=',
  OTHER: 'RM_T=\nRM_T_SP=',
};
const maps = { ...DEFAULT_MAPS, ...store.get('maps', {}) };
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
  return text.split(',').map((r) => fixCase(r)).filter(Boolean).map((r) => {
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
  const prefix = tag.split('-')[0];
  const type = PREFIXES[prefix] || 'OTHER';
  const roomType = isRoomType(type);
  return {
    include: true,
    instance: String(instance).trim(),
    rawName: name,
    tag: tag || clean,
    type,
    desc: roomType ? '' : fixCase(rest),
    rooms: roomType ? fixCase(rest) : '',
    servedBy: '',
    level: '',
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

/* ---------------- state ---------------- */
let devices = [];
const form = ['bldg', 'proj', 'site', 'level', 'oadev', 'oat', 'oah', 'pkg', 'theme', 'areas', 'extra'];
const val = (k) => { const el = $('#f-' + k); return el.type === 'checkbox' ? el.checked : el.value.trim(); };
const saved = store.get('form', {});
form.forEach((k) => {
  const el = $('#f-' + k);
  if (saved[k] != null) { if (el.type === 'checkbox') el.checked = saved[k]; else el.value = saved[k]; }
  el.addEventListener('input', () => {
    if (k === 'bldg' && !$('#f-proj').dataset.touched) $('#f-proj').value = val('bldg').replace(/[^A-Za-z0-9]/g, '');
    if (k === 'proj') $('#f-proj').dataset.touched = '1';
    saveForm(); renderAll();
  });
});
function saveForm() { const o = {}; form.forEach((k) => (o[k] = val(k))); store.set('form', o); }

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
  devices = body.filter((r) => r[iName] && r[iDev]).map((r) => parseDevice(r[iName], r[iDev]));
  devices.sort((a, b) => Number(a.instance) - Number(b.instance));
  linkServedBy(devices);
  if (iSite >= 0 && body[0]?.[iSite] && !val('site')) $('#f-site').value = body[0][iSite];
  if (!val('bldg')) {
    const air = devices.find((d) => TYPES[d.type].section === 'AIR' && d.desc);
    if (air) { $('#f-bldg').value = air.desc; if (!$('#f-proj').dataset.touched) $('#f-proj').value = air.desc.replace(/[^A-Za-z0-9]/g, ''); }
  }
  if (!val('oadev')) { const air = devices.find((d) => TYPES[d.type].section === 'AIR'); if (air) $('#f-oadev').value = air.instance; }
  saveForm();
  toast(`Loaded ${devices.length} devices from ${label}`);
  renderAll();
}

const drop = $('#drop');
['dragenter', 'dragover'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, () => drop.classList.remove('over')));
drop.addEventListener('drop', (ev) => { ev.preventDefault(); const f = ev.dataTransfer.files[0]; if (f) f.text().then((t) => loadCSV(t, f.name)); });
$('#file').addEventListener('change', (ev) => { const f = ev.target.files[0]; if (f) f.text().then((t) => loadCSV(t, f.name)); });
$('#paste-btn').addEventListener('click', () => { $('#paste').hidden = false; $('#paste-use').hidden = false; $('#paste').focus(); });
$('#paste-use').addEventListener('click', () => loadCSV($('#paste').value, 'pasted text'));
$('#sample-btn').addEventListener('click', () => fetch('sample-objectlist.csv').then((r) => r.text()).then((t) => {
  ['bldg', 'proj', 'site', 'oadev'].forEach((k) => ($('#f-' + k).value = ''));
  delete $('#f-proj').dataset.touched;
  if (!val('areas')) $('#f-areas').value = 'Overall Building\nClassroom Wing\nGym';
  loadCSV(t, 'the sample');
}).catch(() => toast('Sample needs the page served over http')));

/* ---------------- equipment table ---------------- */
const typeOptions = (sel) => Object.keys(TYPES).map((t) => `<option ${t === sel ? 'selected' : ''}>${t}</option>`).join('');
function renderEquipment() {
  $('#eq-wrap').hidden = !devices.length;
  if (!devices.length) { $('#eq-summary').textContent = 'No devices loaded yet.'; return; }
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
      <td class="rooms"><input data-k="${isRoomType(d.type) ? 'rooms' : 'desc'}" value="${esc(isRoomType(d.type) ? d.rooms : d.desc)}"></td>
      <td class="muted small">${esc(d.note)}</td></tr>`).join('') + '</tbody>';
}
$('#eq-table').addEventListener('change', (e) => {
  const tr = e.target.closest('tr[data-i]'); if (!tr) return;
  const d = devices[tr.dataset.i]; const k = e.target.dataset.k;
  d[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value.trim();
  if (k === 'type' || k === 'include') renderEquipment();
  renderDerived();
});

/* ---------------- object map editors ---------------- */
function renderObjects() {
  const used = [...new Set(devices.filter((d) => d.include && TYPES[d.type].section !== 'AIR' && TYPES[d.type].section !== 'PLANT').map((d) => d.type))];
  const show = used.length ? used : ['VAV', 'HP'];
  $('#obj-grid').innerHTML = show.map((t) => {
    const empty = parseMap(maps[t]).filter(([, v]) => !v).length;
    return `<label>${t} <span class="hint">${TYPES[t].label}</span>${empty ? `<span class="obj-empty">${empty} object${empty > 1 ? 's' : ''} not filled in</span>` : ''}
      <textarea data-type="${t}" spellcheck="false">${esc(maps[t] || '')}</textarea></label>`;
  }).join('');
}
$('#obj-grid').addEventListener('change', (e) => {
  const t = e.target.dataset.type; if (!t) return;
  maps[t] = e.target.value;
  const custom = store.get('maps', {}); custom[t] = e.target.value; store.set('maps', custom);
  renderObjects(); renderDerived();
});

/* ---------------- builders ---------------- */
const alias = (s) => s.replace(/[^A-Za-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
const included = () => devices.filter((d) => d.include);

function roomRows() {
  const rows = [];
  included().filter((d) => isRoomType(d.type)).forEach((d) => {
    const list = parseRooms(d.rooms);
    (list.length ? list : [{ name: d.tag, number: '' }]).forEach((r) => rows.push({ d, room: r.number || r.name, en: r.number ? `${r.name} ${r.number}` : r.name }));
  });
  return rows;
}

function buildRoomCSV() {
  const objCols = [];
  const typeMaps = {};
  [...new Set(included().map((d) => d.type))].forEach((t) => {
    typeMaps[t] = parseMap(maps[t]);
    typeMaps[t].forEach(([c]) => { if (!objCols.includes(c)) objCols.push(c); });
  });
  const head = ['address', 'room', 'level', 'en', 'equipmentType', 'equipmentTag', 'equipmentSymbol', 'servedBy', 'sys', 'folder', 'pageInclude', 'HAL', ...objCols];
  const lvl = val('level') || '1';
  const rows = roomRows().map(({ d, room, en }) => {
    const m = Object.fromEntries(typeMaps[d.type] || []);
    return [d.instance, room, d.level || lvl, en, d.type, d.tag, d.type, d.servedBy, d.servedBy, 'summary', 'room', 'HVAC', ...objCols.map((c) => m[c] || '')];
  });
  return toCSV([head, ...rows]);
}

function buildProjectCSV() {
  const bldg = val('bldg') || 'Building';
  const head = ['menu', 'pageAlias', 'en', 'buttonSuffix', 'folder', 'pageInclude', 'zoomEnabled', 'overlayEnabled', 'address', 'systemFilter', 'forceInfoPanelObj', 'title', 'subTitle', 'subTitlePrefix', 'subTitleSuffix', 'blacklist'];
  const R = (menu, pa, en, folder = '', inc = '', o = {}) => [menu, pa, en, '', folder, inc, '', o.overlay ? 'true' : '', o.address || '', '', '', inc ? bldg : '', inc ? (o.sub || en) : '', '', '', ''];
  const H = (menu, en) => R(menu, menu, en);
  const rows = [R('HOME', 'Main', 'Home', 'home', 'homePage', { sub: 'Home' })];
  const used = new Set();
  const uniq = (a) => { let x = a; let n = 2; while (used.has(x)) x = `${a}_${n++}`; used.add(x); return x; };
  used.add('Main');

  const areas = val('areas').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (areas.length) {
    rows.push(H('FP', 'Floor Plans'), H('FP', 'AREAS'));
    areas.forEach((a) => { const pa = uniq(alias(a) + '_FP'); rows.push(R('FP', pa, a, 'floorplans', pa, { overlay: true, sub: `${a} Floor Plan` })); });
  }
  for (const [sec, secName] of SECTIONS) {
    const devs = included().filter((d) => TYPES[d.type].section === sec);
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
    }
  }
  if (val('extra')) {
    rows.push(H('DASH', 'Dashboards'), R('DASH', 'Bldg_Summary', 'Building Summary', 'dashboards', 'Bldg_Summary'));
    rows.push(H('ALARM', 'Alarms'), R('ALARM', 'Active_Alarms', 'Active Alarms', 'alarms', 'Active_Alarms'));
    rows.push(H('TREND', 'Trends'), R('TREND', 'Trend_Viewer', 'Trend Viewer', 'trends', 'Trend_Viewer'));
    rows.push(H('SCHED', 'Schedules'), R('SCHED', 'Bldg_Schedules', 'Building Schedules', 'schedules', 'Bldg_Schedules'));
    rows.push(H('RPT', 'Reports'));
    [['Rpt_Overrides', 'Overrides'], ['Rpt_AlarmHistory', 'Alarm History'], ['Rpt_Faults', 'Points in Fault/Offline'], ['Rpt_Runtime', 'Runtime Hours']]
      .forEach(([pa, en]) => rows.push(R('RPT', pa, en, 'reports', pa)));
    rows.push(H('LEGEND', 'Legend'), R('LEGEND', 'Legend', 'Symbols & Colors', 'legend', 'Legend'));
  }
  return toCSV([head, ...rows]);
}

function buildBuildingsCSV() {
  const proj = val('proj') || 'Building';
  const site = val('site');
  const inst = included().map((d) => Number(d.instance)).filter((n) => !Number.isNaN(n));
  const lo = inst.length ? Math.floor(Math.min(...inst) / 100) * 100 : '';
  const hi = inst.length ? Math.floor(Math.max(...inst) / 100) * 100 + 99 : '';
  const head = ['en', 'projCSV', 'roomCSV', 'projTranslation', 'siteInformationList', 'city', 'conditionsDev', 'OAT', 'OAH', 'blacklist', 'CAL', 'URL'];
  const row = [val('bldg') || proj, proj, `${proj}_RoomControl`, '', site && lo !== '' ? `${site}/${lo}/${hi}` : '', '',
    site && val('oadev') ? `/Network/${site}/${val('oadev')}/` : '', val('oat'), val('oah'), '', '', ''];
  return toCSV([head, row]);
}

const buildOverlays = () => JSON.stringify([{
  alias: 'RMT_RMTSP', valueObject: 'RM_T', setpointObject: 'RM_T_SP', mode: 'valueCompare', unit: '°F', opacity: 10, mouseOver: 50,
  values: [{ value: -3, color: '#30a3dc' }, { value: -2, color: '#a1bc2d' }, { value: 2, color: '#a1bc2d' }, { value: 3, color: '#ff9900' }],
}], null, 4);

function files() {
  const proj = val('proj') || 'Building';
  return [
    { path: `_Proj_Lib/CSV/${proj}.csv`, what: 'Navigation (project CSV)', body: buildProjectCSV() },
    { path: `_Proj_Lib/CSV/${proj}_RoomControl.csv`, what: 'Rooms and terminal units', body: buildRoomCSV() },
    { path: '_Proj_Lib/CSV/Buildings.csv', what: 'Building row (merge if the project has other buildings)', body: buildBuildingsCSV() },
    { path: 'assets/CSV/CSS.json', what: `Themes: Delta stock + Nord. Set selectedTheme to ${val('theme')}`, body: JSON.stringify(CSS_THEMES, null, 4) },
    { path: 'assets/CSV/floorplanOverlays.json', what: 'Floor plan zone colors', body: buildOverlays() },
  ];
}

/* ---------------- render derived ---------------- */
function warnings() {
  const w = [];
  if (!devices.length) w.push('Load the enteliWEB device list in step 2.');
  if (!val('bldg')) w.push('Building name is empty.');
  if (!val('oat') || !val('oah')) w.push('Outdoor air temp and humidity objects are empty, so the header won\'t show outdoor conditions.');
  const tags = included().map((d) => d.tag);
  const dup = tags.filter((t, i) => tags.indexOf(t) !== i);
  if (dup.length) w.push(`Duplicate tags: ${[...new Set(dup)].join(', ')}.`);
  const types = [...new Set(included().filter((d) => isRoomType(d.type)).map((d) => d.type))];
  types.forEach((t) => {
    const m = parseMap(maps[t]);
    if (!m.find(([c, v]) => c === 'RM_T' && v)) w.push(`${t}: RM_T (room temp object) isn't set in the object map, so floor plan colors won't work for ${t}s.`);
  });
  const noRooms = included().filter((d) => isRoomType(d.type) && !parseRooms(d.rooms).length);
  if (noRooms.length) w.push(`No rooms parsed for ${noRooms.map((d) => d.tag).join(', ')}.`);
  const unfed = included().filter((d) => isRoomType(d.type) && TYPES[d.type].section === 'TU' && d.type === 'VAV' && !d.servedBy);
  if (unfed.length) w.push(`No "served by" unit for ${unfed.length} VAV${unfed.length > 1 ? 's' : ''}.`);
  return w;
}

function renderDerived() {
  const rr = roomRows();
  $('#rm-wrap').hidden = !rr.length;
  const byRoom = {};
  rr.forEach((r) => (byRoom[r.room] = (byRoom[r.room] || []).concat(r.d.tag)));
  const shared = Object.entries(byRoom).filter(([, t]) => t.length > 1);
  $('#rm-summary').innerHTML = rr.length
    ? `<b>${Object.keys(byRoom).length}</b> rooms, <b>${rr.length}</b> rows.` + (shared.length ? ` Served by more than one unit: ${shared.map(([r, t]) => `${esc(r)} (${t.map(esc).join(', ')})`).join('; ')}.` : '')
    : 'Rooms appear here once equipment is loaded.';
  $('#rm-table').innerHTML = '<thead><tr><th>room</th><th>en</th><th>equipmentTag</th><th>address</th><th>servedBy</th></tr></thead><tbody>' +
    rr.map(({ d, room, en }) => `<tr><td>${esc(room)}</td><td>${esc(en)}</td><td>${esc(d.tag)}</td><td>${esc(d.instance)}</td><td>${esc(d.servedBy)}</td></tr>`).join('') + '</tbody>';

  $('#warnings').innerHTML = warnings().map((w) => `<div class="warn">${esc(w)}</div>`).join('');
  $('#file-list').innerHTML = files().map((f, i) => `<div class="file"><div class="file-h"><span><code>${esc(f.path)}</code> <span class="hint">${esc(f.what)}</span></span>
    <button class="btn" data-dl="${i}" type="button">Download</button></div><pre>${esc(f.body.length > 6000 ? f.body.slice(0, 6000) + '\n…' : f.body)}</pre></div>`).join('');
}
function renderAll() { renderEquipment(); renderObjects(); renderDerived(); }

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
  const b = e.target.closest('[data-dl]'); if (!b) return;
  const f = files()[b.dataset.dl];
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
  if (!devices.length) return toast('Load the device list first');
  const proj = val('proj') || 'Building';
  const readme = `ENTEC enteliVIZ files for ${val('bldg') || proj}\nGenerated ${new Date().toLocaleString()}\n\n` +
    files().map((f) => `${f.path}\n  ${f.what}`).join('\n') +
    `\n\nAfter copying into the project:\n- project.df5: set selectedTheme to ${val('theme')}\n- Main.dg5: set alarmCounter to true\n- Draw the pages named in ${proj}.csv in the designer\n` +
    (warnings().length ? `\nWarnings:\n${warnings().map((w) => '- ' + w).join('\n')}\n` : '');
  const entries = [...files().map((f) => ({ name: f.path, data: enc.encode(f.body) })), { name: 'README.txt', data: enc.encode(readme) }];
  save(`${proj}_enteliVIZ_files.zip`, zip(entries));
});

renderAll();
