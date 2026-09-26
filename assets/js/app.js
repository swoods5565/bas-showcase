// App shell: boot sequence, router (with View Transitions), live point binding,
// BACnet point inspector (priority array + commands), command palette, theme / ISA-101 mode.
import { $, $$, h, fmt, icon, ICONS, store, clamp } from './util.js';
import { sim, pts, pv, write, relinquish, setOOS, fmtPV, objectId, activePriority, isOverridden, PRIORITY_NAMES, DEVICES, TYPES, on, warmup, startSim, setSpeed, unacked, searchPoints, ALARM_CLASS } from './sim.js';
import { wx, startWeather, onWeather, WMO } from './weather.js';
import { ZONES, BUILDING } from './building.js';
import { spark } from './charts.js';

// ---------- Theme ----------------------------------------------------------------
const root = document.documentElement;
const prefersLight = matchMedia('(prefers-color-scheme: light)').matches;
root.dataset.theme = store('theme') || (prefersLight ? 'light' : 'dark');
if (store('hmi') === 'hp') root.dataset.hmi = 'hp';

// ---------- Routes -----------------------------------------------------------------
export const ROUTES = [
  { path: '', title: 'Overview', icon: 'home', mod: 'home', sec: 'Site' },
  { path: 'building', title: 'Building 3D', icon: 'cube', mod: 'building', sec: 'Site' },
  { path: 'ahu', title: 'AHU-1', icon: 'fan', mod: 'ahu', sec: 'Air Side' },
  { path: 'vavs', title: 'VAV Summary', icon: 'grid', mod: 'vavs', sec: 'Air Side' },
  { path: 'vav', title: 'VAV Boxes', icon: 'box', mod: 'vav', sec: 'Air Side', hidden: true },
  { path: 'chw', title: 'Chilled Water Plant', icon: 'snow', mod: 'chw', sec: 'Water Side' },
  { path: 'hw', title: 'Heating Hot Water', icon: 'flame', mod: 'hw', sec: 'Water Side' },
  { path: 'energy', title: 'Energy & Utilities', icon: 'bolt', mod: 'energy', sec: 'Dashboards' },
  { path: 'weather', title: 'Outdoor Conditions', icon: 'sun', mod: 'weather', sec: 'Dashboards' },
  { path: 'alarms', title: 'Alarms & Events', icon: 'bell', mod: 'alarms', sec: 'Dashboards' },
  { path: 'standards', title: 'Graphics Standard', icon: 'book', mod: 'standards', sec: 'Reference' },
];

// ---------- Shell markup -----------------------------------------------------------
const LOGO = `<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#88C0D0"/><stop offset="1" stop-color="#5E81AC"/></linearGradient></defs><rect x="2" y="2" width="28" height="28" rx="8" fill="url(#lg1)"/><path d="M9 23V11l7 6 7-6v12" fill="none" stroke="#2E3440" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="8" r="1.8" fill="#2E3440"/></svg>`;
function shell() {
  document.body.innerHTML = `
  <div class="bg-aurora"></div><div class="bg-grain"></div>
  <div class="boot" id="boot"><div class="boot-in"><div class="boot-logo">${LOGO}<span>Meridian BAS <span style="color:#6b768b;font-weight:500">· Operator Workstation</span></span></div><div class="boot-log" id="bootlog"></div><div class="boot-bar"><i id="bootbar"></i></div><div class="boot-skip">click to skip</div></div></div>
  <div class="app">
    <header class="hdr">
      <button class="hdr-btn menu-btn" id="menuBtn" aria-label="Menu">${ICONS.menu}</button>
      <a class="brand" href="#/">${LOGO}<span class="t">Meridian Tower<small>Building Automation</small></span></a>
      <div class="hdr-spacer"></div>
      <div class="hdr-chip hide-sm" title="Simulated controller clock — speed up with the time-lapse buttons"><span class="demo-badge">DEMO</span><b id="clk">--:--</b><span class="lbl" id="clkd"></span></div>
      <div class="speed hide-md" role="group" aria-label="Simulation speed">${[1, 10, 60].map(x => `<button data-speed="${x}">${x}×</button>`).join('')}</div>
      <a class="hdr-chip hide-sm" href="#/weather" title="Outdoor air (live)"><span class="lbl">OA</span><b id="oat">--</b><span class="lbl" id="oarh"></span></a>
      <button class="hdr-btn" id="searchBtn" title="Search points & pages (Ctrl/⌘ K)">${ICONS.search}<span class="kbd hide-sm">⌘K</span></button>
      <button class="hdr-btn" id="hmiBtn" title="ISA-101 high-performance HMI mode">${ICONS.eye}<span class="hide-md" style="font-size:12px">HP-HMI</span></button>
      <button class="hdr-btn" id="themeBtn" title="Toggle Nord dark / light">${ICONS.moon}</button>
      <a class="hdr-btn bell" id="bell" href="#/alarms" title="Unacknowledged alarms">${ICONS.bell}<span class="count" id="bellc" hidden>0</span></a>
    </header>
    <nav class="nav" id="nav" aria-label="Primary"></nav>
    <main class="main" id="main"><div class="view" id="view"></div></main>
  </div>
  <aside class="drawer" id="drawer" aria-label="Point inspector"></aside>
  <dialog class="palette" id="palette"><input id="palQ" placeholder="Search pages, equipment, points…  e.g. “vav 3 co2”" autocomplete="off"><ul id="palL"></ul><div class="foot"><span><span class="kbd">↑↓</span> navigate</span><span><span class="kbd">↵</span> open</span><span><span class="kbd">esc</span> close</span></div></dialog>
  <div class="toasts" id="toasts"></div>`;
}

// ---------- Navigation -------------------------------------------------------------
function buildNav() {
  const nav = $('#nav'); let sec = ''; const out = [];
  for (const r of ROUTES.filter(r => !r.hidden)) {
    if (r.sec !== sec) { sec = r.sec; out.push(`<div class="nav-sec">${sec}</div>`); }
    out.push(`<a href="#/${r.path}" data-route="${r.path}">${ICONS[r.icon]}<span>${r.title}</span></a>`);
    if (r.path === 'vavs') {
      out.push(`<details id="vavNav"><summary>${ICONS.box}<span>VAV Boxes</span>${ICONS.caret}</summary><div class="sub">` +
        [1, 2, 3, 4].map(f => `<details ${f === 2 ? 'open' : ''}><summary>Level ${f}${ICONS.caret}</summary><div class="sub">` +
          ZONES.filter(z => z.floor === f).map(z => `<a href="#/vav/${z.id}" data-route="vav/${z.id}" title="${z.name}"><i class="dot" data-dot="${z.id}"></i>${z.id.replace('VAV-', '')}<span class="v" data-navt="${z.id}"></span></a>`).join('') + '</div></details>').join('') + '</div></details>');
    }
  }
  out.push(`<div class="nav-foot"><b style="color:var(--text-2)">Data sources</b>
    <div class="src"><i id="srcWx"></i><span id="srcWxT">Open-Meteo weather</span></div>
    <div class="src"><i id="srcAq"></i><span>Open-Meteo air quality</span></div>
    <div class="src"><i id="srcNws"></i><span>NOAA / NWS alerts</span></div>
    <div class="src"><i id="srcEra"></i><span>ERA5 degree-days</span></div>
    <div class="src"><i class="live"></i><span>BACnet simulation</span></div></div>`);
  nav.innerHTML = out.join('');
}
function updateNav() {
  for (const z of ZONES) {
    const d = $(`[data-dot="${z.id}"]`); if (!d) continue;
    const al = ['ZN-T', 'CFM', 'CO2'].some(k => sim.alarms.get(z.id + '.' + k)?.state === 'Active');
    const ov = ['ZN-CSP', 'ZN-HSP', 'CFM-SP', 'DMPR', 'HWV'].some(k => isOverridden(pts.get(z.id + '.' + k)));
    d.className = 'dot' + (al ? ' alarm' : ov ? ' ovr' : '');
    $(`[data-navt="${z.id}"]`).textContent = fmt(pv(z.id + '.ZN-T'), 1) + '°';
  }
}
function markActive(path) {
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.route === path || (path.startsWith('vav/') && a.dataset.route === path)));
  if (path.startsWith('vav/')) { const d = $('#vavNav'); if (d) d.open = true; const a = $(`#nav a[data-route="${path}"]`); a?.closest('details')?.setAttribute('open', ''); }
}

// ---------- Router -----------------------------------------------------------------
let current = null;
async function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [base, ...rest] = raw.split('/');
  const r = ROUTES.find(x => x.path === base) || ROUTES[0];
  const mod = await import(`./pages/${r.mod}.js`);
  const render = () => {
    current?.destroy?.();
    const view = $('#view'); view.innerHTML = '';
    current = mod.default.mount(view, rest.join('/')) || {};
    bindScan(); applyBindings();
    document.title = (mod.default.title?.(rest.join('/')) || r.title) + ' · Meridian BAS';
    $('#main').scrollTo({ top: 0 });
  };
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches && current) document.startViewTransition(render);
  else render();
  markActive(raw || '');
  $('#nav').classList.remove('open');
}

// ---------- Live point binding -------------------------------------------------------
let bound = [];
export function bindScan() { bound = $$('[data-pt]', $('#view')); }
export function statusClass(p) {
  const a = sim.alarms.get(p.id);
  return a && a.state === 'Active' ? 'st-alarm' : p.oos ? 'st-oos' : isOverridden(p) ? 'st-ovr' : p.fault ? 'st-fault' : '';
}
function applyBindings() {
  for (const el of bound) {
    const p = pts.get(el.dataset.pt); if (!p) continue;
    const v = fmtPV(p), cls = statusClass(p);
    if (el.tagName === 'g') { const t = el.querySelector('text.v'); if (t && t.textContent !== v) t.textContent = v; }
    else if (el.dataset.bind === 'val') { if (el.textContent !== v) el.textContent = v; }
    else { const html = `${v}${p.units && !p.states ? `<small class="muted" style="font-weight:500;font-size:.78em">${p.units}</small>` : ''}`; if (el._h !== html) { el.innerHTML = html; el._h = html; } }
    if (el._c !== cls) { el.classList.remove('st-alarm', 'st-ovr', 'st-oos', 'st-fault'); if (cls) el.classList.add(cls); el._c = cls; }
  }
}
/** SVG point readout group for equipment graphics */
export function pvBox(id, x, y, { w = 150, label, anchor = 'start', units = true } = {}) {
  const p = pts.get(id); const lab = label ?? p?.key ?? id;
  const u = units && p?.units && !p.states ? p.units : '';
  return `<g class="pvg" data-pt="${id}" transform="translate(${x},${y})" tabindex="0" role="button" aria-label="${p?.desc || id}"><text class="n" x="2" y="-8">${lab}</text><rect x="0" y="0" width="${w}" height="40" rx="8"/><text class="v" x="12" y="28">--</text><text class="u" x="${w - 10}" y="27" text-anchor="end">${u}</text></g>`;
}

// ---------- Inspector ----------------------------------------------------------------
let inspId = null;
export function inspect(id) {
  const p = pts.get(id); if (!p) return; inspId = id;
  const dev = DEVICES[p.dev] || {};
  const dr = $('#drawer');
  const cmdUI = p.commandable ? (p.states
    ? `<select class="field" id="cmdV">${p.states.map((s, i) => s == null ? '' : `<option value="${i}" ${Math.round(pv(p)) === i ? 'selected' : ''}>${s}</option>`).join('')}</select>`
    : `<input class="field" id="cmdV" type="number" step="any" value="${(+pv(p)).toFixed(p.dec)}">`) : '';
  dr.innerHTML = `
    <div class="drawer-h"><div><div class="crumbs">${dev.name || p.dev} · Device ${dev.inst ?? '—'}</div><h3 style="font-size:17px">${p.id}</h3><div class="muted" style="font-size:12.5px">${p.desc}</div></div>
      <button class="hdr-btn x" id="inspX" aria-label="Close">${ICONS.x}</button></div>
    <div class="drawer-b">
      <div class="insp-pv" id="iPV"></div>
      <div class="muted" style="font-size:12px" id="iPri"></div>
      <div class="flags" id="iFlags"></div>
      <div class="spark" id="iSpark" style="height:60px"></div>
      <div class="sec-t">BACnet properties</div>
      <dl class="props">
        <dt>Object_Identifier</dt><dd>(${objectId(p)})</dd>
        <dt>Object_Name</dt><dd>${BUILDING.short}.${p.id}</dd>
        <dt>Object_Type</dt><dd>${TYPES[p.type]}</dd>
        <dt>Description</dt><dd style="font-family:var(--font)">${p.desc}</dd>
        ${p.units ? `<dt>Units</dt><dd>${p.units}</dd>` : ''}
        ${p.states ? `<dt>State_Text</dt><dd>${p.states.filter(Boolean).join(' · ')}</dd>` : ''}
        ${p.type[0] === 'A' ? `<dt>COV_Increment</dt><dd>${p.cov}</dd>` : ''}
        <dt>Reliability</dt><dd id="iRel"></dd>
        <dt>Event_State</dt><dd id="iEv"></dd>
        ${p.alarm ? `<dt>Notification_Class</dt><dd>${ALARM_CLASS[p.alarm.cls].nc} (${ALARM_CLASS[p.alarm.cls].name})</dd><dt>Time_Delay</dt><dd>${p.alarm.delay} s</dd>` : ''}
        <dt>Network</dt><dd style="font-family:var(--font)">${dev.net || ''}</dd>
        <dt>Device model</dt><dd style="font-family:var(--font)">${dev.model || ''}</dd>
      </dl>
      ${p.commandable ? `<div class="sec-t">Command (operator priority 8)</div>
        <div class="cmd">${cmdUI}<button class="btn primary" id="cmdW">Write @ 8</button><button class="btn" id="cmdR">Relinquish 8</button></div>
        <div class="sec-t">Priority_Array</div><div class="pa" id="iPA"></div>
        <div class="note" style="margin-top:8px">Relinquish_Default: <b class="mono">${p.states ? p.states[p.rd] ?? p.rd : p.rd}</b>. Program logic writes at priority 16; an operator command at 8 wins until relinquished.</div>`
      : !['AI', 'BI'].includes(p.type) ? `<div class="note" style="margin-top:14px">Calculated value — read-only, not commandable.</div>` : `<div class="sec-t">Out_Of_Service</div>
        <div class="cmd"><input class="field" id="oosV" type="number" step="any" value="${(+pv(p)).toFixed(p.dec)}" ${p.states ? 'min="0" max="1" step="1"' : ''}>
        <button class="btn" id="oosOn">Set OOS &amp; value</button><button class="btn" id="oosOff">Return to service</button></div>
        <div class="note">Input objects are not commandable. Placing one Out_Of_Service decouples Present_Value from the physical sensor so it can be overridden for testing.</div>`}
    </div>`;
  dr.classList.add('open');
  $('#inspX').onclick = closeInspector;
  if (p.commandable) {
    $('#cmdW').onclick = () => { const v = +$('#cmdV').value; write(p.id, v, 8); toast(`${p.id} ← ${fmtPV(p, v)} @ priority 8`, 'ovr'); };
    $('#cmdR').onclick = () => { relinquish(p.id, 8); toast(`${p.id} priority 8 relinquished`); };
  } else if (['AI', 'BI'].includes(p.type)) {
    $('#oosOn').onclick = () => { setOOS(p.id, true, +$('#oosV').value); toast(`${p.id} out of service`, 'ovr'); };
    $('#oosOff').onclick = () => { setOOS(p.id, false); toast(`${p.id} returned to service`); };
  }
  refreshInspector();
}
function refreshInspector() {
  if (!inspId) return; const p = pts.get(inspId); if (!p) return;
  const iPV = $('#iPV'); if (!iPV) return;
  iPV.innerHTML = `${fmtPV(p)}${p.units && !p.states ? `<small>${p.units}</small>` : ''}`;
  iPV.className = 'insp-pv ' + statusClass(p);
  const ap = activePriority(p);
  $('#iPri').textContent = p.commandable ? `Active priority ${ap ?? 'relinquish default'}${ap ? ' — ' + (PRIORITY_NAMES[ap] || 'priority ' + ap) : ''}` : p.oos ? 'Out of service (value overridden)' : 'Live input';
  const al = sim.alarms.get(p.id);
  $('#iFlags').innerHTML = [['In alarm', al?.state === 'Active', 'a'], ['Fault', p.fault, 'f'], ['Overridden', isOverridden(p), 'o'], ['Out of svc', p.oos, 's']].map(([n, on, c]) => `<div class="${on ? 'on ' + c : ''}">${n}</div>`).join('');
  $('#iRel').textContent = p.fault ? 'unreliable-other' : 'no-fault-detected';
  $('#iEv').textContent = al?.state === 'Active' ? 'offnormal' : 'normal';
  spark($('#iSpark'), p.hist.map(x => x[1]).slice(-240), al?.state === 'Active' ? 'var(--alarm)' : 'var(--accent)', { h: 60 });
  const pa = $('#iPA');
  if (pa) pa.innerHTML = p.pa.map((v, i) => { const on = ap === i + 1; const c = on ? ' row-on' : ''; return `<div class="p${c}">${i + 1}</div><div class="d${c}">${PRIORITY_NAMES[i + 1] || ''}</div><div class="v${c}">${v == null ? 'NULL' : fmtPV(p, v)}</div>`; }).join('');
}
export function closeInspector() { $('#drawer').classList.remove('open'); inspId = null; }

// ---------- Command palette -----------------------------------------------------------
let palItems = [], palSel = 0;
function openPalette() { const d = $('#palette'); if (d.open) return; d.showModal(); $('#palQ').value = ''; renderPalette(''); $('#palQ').focus(); }
function renderPalette(q) {
  const ql = q.toLowerCase().trim(); const items = [];
  ROUTES.filter(r => !r.hidden).forEach(r => { if (!ql || r.title.toLowerCase().includes(ql)) items.push({ k: 'Page', t: r.title, d: '#/' + r.path, go: () => location.hash = '#/' + r.path }); });
  ZONES.forEach(z => { const hay = (z.id + ' ' + z.name + ' level ' + z.floor).toLowerCase(); if (ql && ql.split(/\s+/).every(t => hay.includes(t))) items.push({ k: 'VAV', t: `${z.id} — ${z.name}`, d: fmt(pv(z.id + '.ZN-T'), 1) + ' °F', go: () => location.hash = '#/vav/' + z.id }); });
  if (ql.length >= 2) searchPoints(ql, 40).forEach(p => items.push({ k: 'Point', t: p.id, d: fmtPV(p) + ' ' + (p.units || ''), sub: p.desc, go: () => inspect(p.id) }));
  palItems = items.slice(0, 60); palSel = 0;
  $('#palL').innerHTML = palItems.map((it, i) => `<li data-i="${i}" class="${i === 0 ? 'sel' : ''}"><span class="k">${it.k}</span><span>${it.t}${it.sub ? `<span class="faint" style="margin-left:8px;font-size:12px">${it.sub}</span>` : ''}</span><span class="d">${it.d}</span></li>`).join('') || '<li class="muted">No matches</li>';
}
function palGo(i) { const it = palItems[i]; if (!it) return; $('#palette').close(); it.go(); }

// ---------- Toasts --------------------------------------------------------------------
export function toast(msg, cls = '') { const t = h('div.toast' + (cls ? '.' + cls : ''), { html: msg }); $('#toasts').append(t); setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = 0; setTimeout(() => t.remove(), 400); }, 4200); }

// ---------- Header updates ------------------------------------------------------------
function updateHeader() {
  $('#clk').textContent = sim.t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: sim.speed === 1 ? '2-digit' : undefined });
  $('#clkd').textContent = sim.t.toLocaleDateString('en-US', { weekday: 'short' });
  $('#oat').textContent = fmt(pv('BLDG.OAT'), 1) + '°F';
  $('#oarh').textContent = fmt(pv('BLDG.OA-RH'), 0) + '% RH';
  const n = unacked(); const c = $('#bellc'); c.hidden = !n; c.textContent = n; $('#bell').classList.toggle('ringing', n > 0);
  $$('.speed button').forEach(b => b.classList.toggle('on', +b.dataset.speed === sim.speed));
}
function updateSources() {
  const set = (id, live) => { const e = $('#' + id); if (e) e.className = live ? 'live' : ''; };
  set('srcWx', wx.live); set('srcAq', wx.aq?.live); set('srcNws', wx.nws); set('srcEra', wx.dd?.live);
  const t = $('#srcWxT'); if (t) t.textContent = wx.live ? `Open-Meteo · ${wx.loc.name.split(',')[0]}` : 'Weather (simulated offline)';
}

// ---------- Boot -----------------------------------------------------------------------
async function boot() {
  shell(); buildNav();
  const log = $('#bootlog'), bar = $('#bootbar'), bootEl = $('#boot');
  let skip = false; bootEl.addEventListener('click', () => skip = true);
  const seen = sessionStorageGet('booted');
  const lines = [
    ['Binding BACnet/IP port <span class="hl">47808 (0xBAC0)</span> on 10.20.1.10', 8],
    ['Broadcasting <span class="hl">Who-Is</span> … received I-Am from 45 devices', 20],
    ['Reading object lists (ReadPropertyMultiple) …', 34],
    [`Loaded <span class="hl">${pts.size.toLocaleString()}</span> objects · 40 VAV · 1 AHU · 2 plants · 1 meter gateway`, 48],
    ['Subscribing COV · Notification classes 1–5', 60],
    ['Fetching live outdoor conditions (Open-Meteo, NOAA/NWS) …', 72],
  ];
  const wxReady = Promise.race([new Promise(r => { const off = onWeather(() => { off(); r(); }); }), new Promise(r => setTimeout(r, 4000))]);
  startWeather();
  const wait = (ms) => new Promise(r => setTimeout(r, skip || seen ? 0 : ms));
  for (const [l, p] of lines) { log.insertAdjacentHTML('beforeend', `<div>› ${l}</div>`); bar.style.width = p + '%'; await wait(230); }
  await wxReady;
  log.insertAdjacentHTML('beforeend', `<div>› Weather: <span class="ok">${wx.live ? 'live · ' + wx.loc.name : 'offline — synthetic climate'}</span></div>`);
  warmup();
  log.insertAdjacentHTML('beforeend', `<div>› Trend logs primed · <span class="ok">Operator workstation online ✓</span></div>`); bar.style.width = '100%';
  await wait(420);
  bootEl.classList.add('done'); sessionStorageSet('booted', 1);
  setTimeout(() => bootEl.remove(), 700);

  // wiring
  window.addEventListener('hashchange', route);
  route();
  startSim();
  on('tick', () => { applyBindings(); current?.update?.(); updateHeader(); updateNav(); refreshInspector(); });
  on('alarm', (a) => { if (a.state === 'Active' && !a.acked) toast(`<b>${ALARM_CLASS[a.cls].name}</b> · ${a.point}<br><span class="muted">${a.msg}</span>`, 'alarm'); });
  onWeather(() => { updateSources(); current?.weather?.(); });
  updateSources(); updateHeader(); updateNav();

  document.addEventListener('click', (e) => { const t = e.target.closest('[data-pt]'); if (t && !e.defaultPrevented) inspect(t.dataset.pt); });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    else if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); openPalette(); }
    else if (e.key === 'Escape') closeInspector();
    else if (e.key === 'Enter' && document.activeElement?.dataset?.pt) inspect(document.activeElement.dataset.pt);
  });
  $('#palQ').addEventListener('input', (e) => renderPalette(e.target.value));
  $('#palQ').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); palSel = clamp(palSel + (e.key === 'ArrowDown' ? 1 : -1), 0, palItems.length - 1); $$('#palL li').forEach((li, i) => li.classList.toggle('sel', i === palSel)); $$('#palL li')[palSel]?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter') palGo(palSel);
  });
  $('#palL').addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) palGo(+li.dataset.i); });
  $('#palette').addEventListener('click', (e) => { if (e.target.id === 'palette') $('#palette').close(); });
  $('#searchBtn').onclick = openPalette;
  $('#themeBtn').onclick = () => { root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; store('theme', root.dataset.theme); current?.theme?.(); };
  $('#hmiBtn').onclick = () => { const on = root.dataset.hmi !== 'hp'; if (on) root.dataset.hmi = 'hp'; else delete root.dataset.hmi; store('hmi', on ? 'hp' : ''); $('#hmiBtn').classList.toggle('on', on); current?.theme?.(); toast(on ? 'ISA-101 high-performance mode: gray is normal, color means abnormal.' : 'Standard Nord color mode'); };
  $('#hmiBtn').classList.toggle('on', root.dataset.hmi === 'hp');
  $$('.speed button').forEach(b => b.onclick = () => { setSpeed(+b.dataset.speed); updateHeader(); toast(`Time-lapse ${b.dataset.speed}× — the controller clock now runs ${b.dataset.speed === '1' ? 'in real time' : b.dataset.speed + '× faster'}`); });
  $('#menuBtn').onclick = () => $('#nav').classList.toggle('open');
  // cursor spotlight for cards
  document.addEventListener('pointermove', (e) => { const c = e.target.closest?.('.card'); if (!c) return; const r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px'); }, { passive: true });
}
function sessionStorageGet(k) { try { return sessionStorage.getItem('mbas:' + k); } catch { return null; } }
function sessionStorageSet(k, v) { try { sessionStorage.setItem('mbas:' + k, v); } catch { } }

boot();
