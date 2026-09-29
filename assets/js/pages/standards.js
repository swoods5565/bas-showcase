import { h } from '../util.js';

const NORD = [
  ['Polar Night', [['nord0', '#2E3440'], ['nord1', '#3B4252'], ['nord2', '#434C5E'], ['nord3', '#4C566A']]],
  ['Snow Storm', [['nord4', '#D8DEE9'], ['nord5', '#E5E9F0'], ['nord6', '#ECEFF4']]],
  ['Frost', [['nord7', '#8FBCBB'], ['nord8', '#88C0D0'], ['nord9', '#81A1C1'], ['nord10', '#5E81AC']]],
  ['Aurora', [['nord11', '#BF616A'], ['nord12', '#D08770'], ['nord13', '#EBCB8B'], ['nord14', '#A3BE8C'], ['nord15', '#B48EAD']]],
];
const SEM = [['Cooling / chilled water', '--cool'], ['Heating / hot water', '--heat'], ['Normal / running', '--ok'], ['Warning / maintenance', '--warn'], ['Alarm', '--alarm'], ['Operator override', '--ovr'], ['Off / disabled', '--off'], ['Outdoor air', '--air-oa'], ['Supply air', '--air-sa'], ['Condenser water', '--cw']];
const ABBR = [['OAT', 'Outdoor air temperature'], ['MAT / RAT / SAT', 'Mixed / return / supply air temperature'], ['DSP', 'Duct static pressure'], ['OAD / RAD / EAD', 'Outdoor / return / exhaust damper'], ['PHV / CCV / HWV', 'Preheat / cooling-coil / reheat valve'], ['SF / RF', 'Supply / return fan'], ['SS / STS / SPD', 'Start-stop / status / speed'], ['ZN-T', 'Zone (space) temperature'], ['ZN-CSP / ZN-HSP', 'Active cooling / heating setpoint'], ['CFM / CFM-SP', 'Airflow / airflow setpoint'], ['CHWST / CHWRT', 'Chilled-water supply / return temperature'], ['HWST / HWRT', 'Hot-water supply / return temperature'], ['CWST / CWRT', 'Condenser-water supply / return temperature'], ['DP', 'Differential pressure'], ['KW / KWH', 'Demand / energy']];
const OBJ = [['AI', 'analog-input', 'Sensors: temperatures, pressures, flows'], ['AO', 'analog-output', 'Commandable: valves, dampers, VFD speeds'], ['AV', 'analog-value', 'Setpoints, calculated values, loop outputs'], ['BI', 'binary-input', 'Status, safeties, occupancy sensors'], ['BO', 'binary-output', 'Commandable: start/stop, enable'], ['BV', 'binary-value', 'Enables, mode flags'], ['MSV', 'multi-state-value', 'Occupancy mode, zone state']];
const REFS = [
  ['ANSI/ASHRAE Standard 135 — BACnet', 'Object model, priority array, event/alarm services.', 'https://www.ashrae.org/technical-resources/bookstore/bacnet'],
  ['ASHRAE Guideline 36 — High-Performance Sequences of Operation', 'T&R resets, dual-max VAV logic, AFDD.', 'https://www.ashrae.org/technical-resources/bookstore/guideline-36-high-performance-sequences-of-operation-for-hvac-systems'],
  ['ANSI/ASHRAE/IES Standard 90.1', 'Economizer high-limit shutoff by climate zone.', 'https://www.ashrae.org/technical-resources/bookstore/standard-90-1'],
  ['ANSI/ASHRAE Standard 62.1', 'Ventilation rate procedure: Vbz = Rp·Pz + Ra·Az.', 'https://www.ashrae.org/technical-resources/bookstore/standards-62-1-62-2'],
  ['ANSI/ASHRAE Standard 55', 'Thermal environmental conditions for human occupancy.', 'https://www.ashrae.org/technical-resources/bookstore/standard-55-thermal-environmental-conditions-for-human-occupancy'],
  ['ASHRAE Guideline 14', 'Measurement of energy savings; regression & CV(RMSE).', 'https://www.ashrae.org/technical-resources/bookstore'],
  ['ANSI/ISA-101.01 — HMIs for Process Automation', 'High-performance HMI: gray normal states, color for abnormal.', 'https://www.isa.org/standards-and-publications/isa-standards/isa-101-standards'],
  ['ENERGY STAR Portfolio Manager — Technical Reference', 'U.S. national median EUI; source-site ratios.', 'https://www.energystar.gov/buildings/tools-and-resources/portfolio-manager-technical-reference-us-national-energy-use'],
  ['EPA eGRID / GHG Equivalencies', 'Electric grid and natural-gas emission factors.', 'https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references'],
];

export default {
  title: () => 'Graphics Standard',
  mount(view) {
    view.append(h('div.page-head', {}, h('div', {}, h('div.crumbs', { html: '<a href="#/">Meridian Center</a> › Reference' }), h('h1', {}, 'Graphics standard'),
      h('p', {}, 'The conventions every page in this showcase follows — so a graphics team can reproduce them and an operator never has to guess what a color or symbol means.'))));
    const g = h('div.grid.g-2'); view.append(g);
    const card = (t, sub, html, cls = '') => { const c = h('div.card.reveal' + cls, { html: `<div class="card-h"><h3>${t}</h3><span class="sub">${sub}</span></div>${html}` }); g.append(c); return c; };

    card('Theme · Nord', 'dark & light variants', NORD.map(([grp, cs]) => `<div class="sec-t" style="margin-top:6px">${grp}</div><div class="grid" style="grid-template-columns:repeat(5,minmax(0,1fr));gap:8px">${cs.map(([n, c]) => `<div class="swatch"><div class="c" style="background:${c}"></div><div class="m"><b>${n}</b><span>${c}</span></div></div>`).join('')}</div>`).join(''), '.span-all');
    card('Semantic colors', 'live values for the current theme / HMI mode', `<div class="grid" style="grid-template-columns:repeat(2,1fr);gap:8px">${SEM.map(([l, v]) => `<div class="row" style="gap:10px"><span style="width:28px;height:28px;border-radius:8px;background:var(${v});border:1px solid var(--line-2)"></span><span>${l}<div class="faint mono" style="font-size:11px">${v}</div></span></div>`).join('')}</div>
      <div class="note" style="margin-top:12px">Toggle <b>HP-HMI</b> in the header to see the ISA-101 variant: process colors collapse to grays and only abnormal states keep color.</div>`);
    card('Value states', 'how a point readout communicates status', `<div class="pt-list">
      <div class="row-pt"><span class="n">Normal</span><span class="pv-chip">72.4<small class="muted">°F</small></span></div>
      <div class="row-pt"><span class="n">In alarm — red, blinking border</span><span class="pv-chip st-alarm">81.9<small class="muted">°F</small></span></div>
      <div class="row-pt"><span class="n">Operator override (priority &lt; 16) — purple dashed</span><span class="pv-chip st-ovr">68.0<small class="muted">°F</small></span></div>
      <div class="row-pt"><span class="n">Out of service — amber italic</span><span class="pv-chip st-oos">55.0<small class="muted">°F</small></span></div>
      <div class="row-pt"><span class="n">Fault / unreliable — orange</span><span class="pv-chip st-fault">45<small class="muted">%</small></span></div></div>
      <div class="note" style="margin-top:10px">Equipment status rings: green = proven running, gray = off, red = failed. Animation speed is proportional to the driving value (fan VFD %, pump speed, airflow).</div>`);
    card('Typography', 'Inter (UI) · JetBrains Mono (values)', `<div class="stack">
      <div><div class="faint" style="font-size:11px">PAGE TITLE · 26 px / 650</div><div style="font-size:26px;font-weight:650">AHU-1 · Air handler</div></div>
      <div><div class="faint" style="font-size:11px">SECTION · 22 px / 650</div><div style="font-size:22px;font-weight:650">Chilled-water plant</div></div>
      <div><div class="faint" style="font-size:11px">CARD TITLE · 13 px / 600 caps</div><div style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.02em">Sequence status</div></div>
      <div><div class="faint" style="font-size:11px">LIVE VALUE · mono 24–30 px / 600, tabular figures</div><div class="mono" style="font-size:28px;font-weight:600">55.2 °F · 1,240 cfm</div></div>
      <div><div class="faint" style="font-size:11px">BODY · 14 px / 400</div><div>Supply air temperature resets between 55 °F and 65 °F.</div></div></div>`);
    card('Canvas & layout', '1920 × 1080 equipment graphic', `<div class="canvas-frame"><div class="h">Header · site, clock, outdoor air, alarms</div><div>Nav · site → system → unit list</div><div>Equipment graphic (SVG viewBox 1920×1080, scales to any display)</div><div class="f">Status banner · mode · stage · summary</div></div>
      <div class="note" style="margin-top:10px">Standard page set: Site/campus (optional) → Building home → AHU → VAV (full template page) → Plants → Energy dashboard → Equipment dashboards. The left nav expands to list units; the same links appear in every package tier.</div>`);
    card('Point naming', 'Site.Equipment.Point', `<div class="mono" style="font-size:15px;margin-bottom:10px">MC<span class="faint">.</span>AHU-1<span class="faint">.</span>SAT &nbsp;·&nbsp; MC<span class="faint">.</span>VAV-2-11<span class="faint">.</span>ZN-T</div>
      <div class="tbl-wrap" style="max-height:300px"><table class="tbl"><thead><tr><th>Abbrev.</th><th>Meaning</th></tr></thead><tbody>${ABBR.map(([a, b]) => `<tr><td class="mono"><b>${a}</b></td><td style="white-space:normal">${b}</td></tr>`).join('')}</tbody></table></div>
      <div class="note" style="margin-top:8px">VAV tags: VAV-<i>floor</i>-<i>zone</i>. Device instances: AHU 1100, plants 1200/1300, meters 1400, VAVs 2000 + floor·100 + zone on MS/TP network 1000 + floor.</div>`);
    card('BACnet objects & priority array', 'ASHRAE 135', `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Type</th><th>Object</th><th>Typical use</th></tr></thead><tbody>${OBJ.map(([a, b, c]) => `<tr><td class="mono"><b>${a}</b></td><td class="mono">${b}</td><td style="white-space:normal">${c}</td></tr>`).join('')}</tbody></table></div>
      <div class="pt-list" style="margin-top:12px"><div class="row-pt"><span class="n">1 · Manual life safety</span><span class="n">2 · Automatic life safety</span></div><div class="row-pt"><span class="n">5 · Critical equipment control</span><span class="n">6 · Minimum on/off</span></div><div class="row-pt"><span class="n"><b>8 · Manual operator</b> (commands from this UI)</span><span class="n"><b>16 · Program / default</b> (sequences)</span></div></div>`);
    card('ISA-101 high-performance principles', 'applied in HP-HMI mode', `<ul class="seq">
      <li>Gray, low-contrast backgrounds and equipment; color is reserved for abnormal conditions.</li>
      <li>Alarm color is never used for anything else; alarms add shape/blink so meaning is not color-alone.</li>
      <li>Show values with context — setpoint, range and trend beside the number, not raw numbers alone.</li>
      <li>Consistent hierarchy: overview (Level 1) → system (Level 2) → unit detail (Level 3) → diagnostics (Level 4).</li>
      <li>Minimal decoration and animation in HP mode; motion only conveys state (flow, rotation).</li></ul>`);
    const refs = card('Standards & data sources referenced', 'links', `<div class="pt-list">${REFS.map(([t, d, u]) => `<a class="row-pt" href="${u}" target="_blank" rel="noopener" style="color:inherit"><span class="n"><b>${t}</b><div class="faint" style="font-size:12px;white-space:normal">${d}</div></span><span class="faint">↗</span></a>`).join('')}</div>`, '.span-all');
    return {};
  },
};
