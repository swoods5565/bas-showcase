import { h, fmt, ICONS } from '../util.js';
import { ZONES } from '../building.js';
import { pv, sim, pts, fmtPV } from '../sim.js';
import { wx } from '../weather.js';

const THUMB = {
  building: `<img src="assets/img/floor-1.webp" alt="" style="height:100%;width:auto;display:block;margin:auto;padding:8px;transform:perspective(400px) rotateX(38deg);filter:drop-shadow(0 8px 10px rgba(0,0,0,.4))">`,
  ahu: `<svg viewBox="0 0 240 112"><rect x="10" y="38" width="220" height="36" rx="6" fill="var(--duct)" stroke="var(--duct-edge)"/><path d="M20 56 H220" stroke="var(--air-sa)" stroke-width="3" stroke-dasharray="3 14" class="thumb-flow"/><rect x="70" y="42" width="10" height="28" fill="none" stroke="var(--cool)"/>${[0, 1, 2, 3, 4].map(i => `<line x1="${86 + i * 4}" y1="42" x2="${86 + i * 4}" y2="70" stroke="var(--cool)"/>`).join('')}<g transform="translate(160 56)"><circle r="22" fill="var(--equip)" stroke="var(--duct-edge)"/><g class="thumb-rot">${[0, 90, 180, 270].map(a => `<path d="M0 0 L16 -5 L16 5Z" transform="rotate(${a})" fill="var(--accent)"/>`).join('')}</g></g></svg>`,
  vav: `<svg viewBox="0 0 240 112"><rect x="20" y="44" width="80" height="24" rx="12" fill="var(--duct)" stroke="var(--duct-edge)"/><rect x="100" y="36" width="70" height="40" rx="5" fill="var(--equip)" stroke="var(--duct-edge)"/><line x1="135" y1="40" x2="135" y2="72" stroke="var(--accent)" stroke-width="4" transform="rotate(35 135 56)"/><rect x="170" y="40" width="14" height="32" fill="none" stroke="var(--heat)"/><path d="M184 56 H225" stroke="var(--air-sa)" stroke-width="3" stroke-dasharray="3 12" class="thumb-flow"/></svg>`,
  vavs: `<svg viewBox="0 0 240 112">${Array.from({ length: 40 }, (_, i) => `<rect x="${14 + (i % 10) * 22}" y="${14 + Math.floor(i / 10) * 22}" width="18" height="18" rx="4" fill="${['#5E81AC', '#88C0D0', '#A3BE8C', '#EBCB8B', '#D08770'][(i * 7) % 5]}" opacity=".85"/>`).join('')}</svg>`,
  chw: `<svg viewBox="0 0 240 112"><path d="M20 30 H220 M20 82 H220" stroke="var(--chw)" stroke-width="8" stroke-linecap="round" opacity=".6"/><path d="M20 30 H220 M20 82 H220" stroke="#fff" stroke-width="2" stroke-dasharray="6 12" class="thumb-flow" opacity=".7"/>${[60, 150].map(x => `<rect x="${x}" y="42" width="56" height="30" rx="14" fill="var(--equip)" stroke="var(--duct-edge)"/>`).join('')}</svg>`,
  hw: `<svg viewBox="0 0 240 112"><path d="M20 30 H220" stroke="var(--hw)" stroke-width="8" stroke-linecap="round" opacity=".6"/><path d="M20 30 H220" stroke="#fff" stroke-width="2" stroke-dasharray="6 12" class="thumb-flow" opacity=".7"/>${[70, 150].map(x => `<rect x="${x}" y="44" width="44" height="54" rx="6" fill="var(--equip)" stroke="var(--duct-edge)"/><path d="M${x + 22} 90 q-9 -12 0 -24 q9 12 0 24z" fill="var(--heat)"/>`).join('')}</svg>`,
  energy: `<svg viewBox="0 0 240 112">${Array.from({ length: 12 }, (_, i) => { const v = 30 + 50 * Math.abs(Math.sin(i / 2 + .6)); return `<rect x="${16 + i * 18}" y="${100 - v}" width="12" height="${v}" rx="3" fill="${i % 2 ? 'var(--s1)' : 'var(--s2)'}" opacity=".85"/>`; }).join('')}</svg>`,
  weather: `<svg viewBox="0 0 240 112"><path d="M20 96 Q120 -10 220 96" fill="none" stroke="var(--line-2)" stroke-dasharray="3 5"/><circle cx="96" cy="36" r="14" fill="#EBCB8B"/><circle cx="96" cy="36" r="24" fill="#EBCB8B" opacity=".2"/><path d="M130 80 q10 -26 36 -14 q20 -8 26 12 q14 2 10 16 H132 q-14 -2 -2 -14z" fill="var(--n4)" opacity=".7"/></svg>`,
  alarms: `<svg viewBox="0 0 240 112">${[0, 1, 2, 3].map(i => `<rect x="20" y="${12 + i * 24}" width="200" height="18" rx="5" fill="var(--panel-2)"/><circle cx="32" cy="${21 + i * 24}" r="5" fill="${['var(--alarm)', 'var(--warn)', 'var(--alarm)', 'var(--ok)'][i]}"/><rect x="44" y="${18 + i * 24}" width="${120 - i * 18}" height="6" rx="3" fill="var(--line-2)"/>`).join('')}</svg>`,
  standards: `<svg viewBox="0 0 240 112">${['#2E3440', '#3B4252', '#88C0D0', '#5E81AC', '#A3BE8C', '#EBCB8B', '#D08770', '#BF616A', '#B48EAD'].map((c, i) => `<rect x="${16 + i * 23.5}" y="30" width="20" height="52" rx="5" fill="${c}" stroke="var(--line-2)"/>`).join('')}</svg>`,
};
const TILES = [
  ['building', 'Building 3D — dollhouse', 'Stacked, exploded floor plans with live heat-mapping of temperature, CO₂, airflow and occupancy.'],
  ['ahu', 'AHU-1 · VAV air handler', 'Animated airflow, damper blades, coils & fan VFD. Guideline 36 resets, economizer and AFDD.'],
  ['vavs', 'VAV summary', `All ${ZONES.length} terminal units in one sortable table — the page every tech opens first.`],
  ['vav', 'VAV with reheat', 'Single-duct terminal graphic plus live G36 dual-maximum control diagram.', '#/vav/VAV-2-11'],
  ['chw', 'Chilled-water plant', 'Variable-primary plant: chillers, pumps, towers, kW/ton, ΔT and approach.'],
  ['hw', 'Heating hot-water plant', 'Condensing boilers with outdoor-air reset curve and efficiency vs return temp.'],
  ['energy', 'Energy & utilities', 'Demand, end-use split, 12-month weather-normalized regression, EUI vs ENERGY STAR, carbon.'],
  ['weather', 'Outdoor conditions', 'Live weather, AQI, NWS alerts, psychrometrics and economizer hours.'],
  ['alarms', 'Alarms & events', 'BACnet notification classes, acknowledgement workflow and event log.'],
  ['standards', 'Graphics standard', 'Palette, typography, canvas, naming conventions and the standards behind every page.'],
];

export default {
  title: () => 'Overview',
  mount(view) {
    const hero = h('section.hero');
    const left = h('div', {},
      h('div.eyebrow', { html: '<span style="width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 10px var(--ok)"></span> Live BACnet simulation · ASHRAE G36 sequences' }),
      h('h1', { html: 'Building automation,<br><span class="grad">rendered beautifully.</span>' }),
      h('p.lead', {}, 'A reference set of BAS graphic pages and utility dashboards for Meridian Center — a demo two-story office building. Every value is a live, commandable point, and the outdoor air comes from real weather for the site.'),
      h('div.row', { style: { marginBottom: '26px' } },
        h('a.btn.primary', { href: '#/building', html: `Explore the building ${ICONS.arrow}` }),
        h('a.btn', { href: '#/ahu', html: 'Open AHU-1' }),
        h('button.btn', { onclick: () => document.getElementById('searchBtn').click(), html: `${ICONS.search} Search 700+ points` })),
      h('div.hero-stats', { id: 'hs' }));
    hero.style.gridTemplateColumns = 'minmax(0,1fr)'; hero.style.minHeight = 'auto';
    hero.append(left); view.append(hero);
    left.querySelector('.hero-stats').style.maxWidth = '760px';

    // Exterior render with live, pinned callouts + mouse parallax + day/night from the real sun
    const PINS = [
      { x: 10, y: 38, id: 'VAV-1-01.ZN-T', l: 'West wing', go: '#/vav/VAV-1-01' },
      { x: 30, y: 26, id: 'AHU-1.SAT', l: 'AHU-1 supply air', go: '#/ahu', opt: 1 },
      { x: 51.5, y: 36, id: 'VAV-2-10.ZN-T', l: 'Level 2 commons', go: '#/vav/VAV-2-10', opt: 1 },
      { x: 58.5, y: 70, id: 'VAV-1-21.ZN-T', l: 'Main lobby', go: '#/vav/VAV-1-21' },
      { x: 72, y: 18, id: 'MTR.KW', l: 'Building demand', go: '#/energy', opt: 1 },
      { x: 90, y: 42, id: 'VAV-1-04.ZN-T', l: 'East wing', go: '#/vav/VAV-1-04' },
    ];
    const xh = h('div.xhero.reveal'), stageX = h('div.xhero-stage');
    stageX.append(h('img.bld', { src: 'assets/img/exterior.webp', alt: 'Meridian Center exterior rendering', draggable: 'false' }));
    const night = h('div.night', { style: { webkitMaskImage: 'url(assets/img/exterior.webp)', maskImage: 'url(assets/img/exterior.webp)', maskSize: '100% 100%', webkitMaskSize: '100% 100%' } });
    stageX.append(night, h('div.reflect'));
    const pinEls = PINS.map(p => { const e = h('a.pin' + (p.opt ? '.pin-opt' : ''), { href: p.go, style: { left: p.x + '%', top: p.y + '%' } }, h('div.chip', { html: `${p.l}<b>--</b>` }), h('div.stem'), h('div.dot')); stageX.append(e); return e; });
    xh.append(stageX); view.append(xh);
    xh.addEventListener('pointermove', (e) => { const r = xh.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; stageX.style.transform = `rotateY(${x * 10}deg) rotateX(${8 - y * 8}deg)`; });
    xh.addEventListener('pointerleave', () => stageX.style.transform = 'rotateX(8deg)');
    stageX.style.transform = 'rotateX(8deg)';

    // Ticker
    const TK = ['BLDG.OAT', 'AHU-1.SAT', 'AHU-1.DSP', 'AHU-1.OA-CFM', 'AHU-1.SF-SPD', 'CHW.CHWST', 'CHW.TONS', 'CHW.KW-TON', 'HW.HWST', 'MTR.KW', 'MTR.KWH', 'MTR.GAS-RATE', 'VAV-2-11.CO2', 'VAV-1-13.ZN-T'];
    const track = h('div.ticker-track'); view.append(h('div.ticker', {}, track));

    view.append(h('div.page-head.reveal', { style: { marginTop: '8px' } }, h('div', {}, h('h1', { style: { fontSize: '22px' } }, 'Graphic pages & dashboards'), h('p', {}, 'Each page follows one standard: 1920 × 1080 graphic canvas, Nord palette in dark and light, and an ISA-101 high-performance mode (toggle HP-HMI in the header).'))));
    const tiles = h('div.tiles'); view.append(tiles);
    TILES.forEach(([k, t, d, href]) => {
      const a = h('a.card.tile.reveal', { href: href || '#/' + k });
      a.innerHTML = `<div class="thumb">${THUMB[k]}</div><h3>${t}</h3><p>${d}</p><div class="go">Open ${ICONS.arrow}</div>`;
      // 3D tilt
      a.addEventListener('pointermove', e => { const r = a.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; a.style.transform = `perspective(900px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateY(-3px)`; });
      a.addEventListener('pointerleave', () => a.style.transform = '');
      tiles.append(a);
    });
    const style = h('style', {}, `.thumb-rot{transform-box:fill-box;transform-origin:center;animation:spin 3s linear infinite}.tile:hover .thumb-rot{animation-duration:.6s}.thumb-flow{animation:flow 1.6s linear infinite}`);
    view.append(style);

    view.append(h('div.page-head.reveal', { style: { marginTop: '28px' } }, h('div', {}, h('h1', { style: { fontSize: '22px' } }, 'Built on industry standards'), h('p', {}, 'Not just pretty pictures — the semantics, sequences and benchmarks behind each graphic are the ones specified on real projects.'))));
    const std = h('div.grid.g-4'); view.append(std);
    [['BACnet (ASHRAE 135)', 'Object types, 16-level priority array, status flags, notification classes, COV. Click any value to inspect it.'],
     ['ASHRAE Guideline 36', 'Trim & respond resets for SAT and duct static, dual-maximum VAV logic, zone CO₂ DCV, AFDD rules.'],
     ['ASHRAE 90.1 / 62.1 / 55', 'Economizer high-limit by climate zone, ventilation Vbz = Rp·Pz + Ra·Az, thermal-comfort envelope.'],
     ['ENERGY STAR · EPA eGRID', 'EUI benchmarked against the national median office; emissions from EPA factors; G14-style regression.']]
      .forEach(([t, d]) => std.append(h('div.card.reveal', { html: `<h3 style="font-size:15px;margin-bottom:6px">${t}</h3><p class="muted" style="margin:0;font-size:13px">${d}</p>` })));
    view.append(h('p.note', { style: { marginTop: '22px', textAlign: 'center' }, html: 'Meridian Center is fictional. Weather: <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0) · Alerts: <a href="https://www.weather.gov/documentation/services-web-api" target="_blank" rel="noopener">NOAA/NWS</a> · Benchmarks: <a href="https://www.energystar.gov/buildings/tools-and-resources/portfolio-manager-technical-reference-us-national-energy-use" target="_blank" rel="noopener">ENERGY STAR</a>, <a href="https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references" target="_blank" rel="noopener">EPA</a>.' }));

    const upd = () => {
      PINS.forEach((p, i) => { const pt = pts.get(p.id); pinEls[i].querySelector('b').textContent = fmtPV(pt) + ' ' + (pt.units || ''); pinEls[i].classList.toggle('st-alarm', sim.alarms.get(p.id)?.state === 'Active'); });
      const alt = sim.sun?.alt ?? 30; night.style.opacity = alt > 8 ? 0 : alt < -6 ? .62 : (8 - alt) / 14 * .62;
      const comfy = ZONES.filter(z => { const t = pv(z.id + '.ZN-T'); return t >= pv(z.id + '.ZN-HSP') - 1 && t <= pv(z.id + '.ZN-CSP') + 1; }).length / ZONES.length * 100;
      document.getElementById('hs').innerHTML = [['Demand', fmt(pv('MTR.KW'), 0), 'kW'], ['Outdoor', fmt(pv('BLDG.OAT'), 1), '°F'], ['Comfort', fmt(comfy, 0), '%'], ['Plant', pv('CHW.TONS') > 1 ? fmt(pv('CHW.KW-TON'), 2) : fmt(pv('HW.MBH'), 0), pv('CHW.TONS') > 1 ? 'kW/ton' : 'MBH']]
        .map(([l, v, u]) => `<div class="s"><div class="l">${l}</div><div class="v">${v}<small class="muted" style="font-size:12px;margin-left:3px">${u}</small></div></div>`).join('');
      const items = TK.map(id => { const p = pts.get(id); return `<span data-pt="${id}" style="cursor:pointer">${id}<b>${fmtPV(p)} ${p.units || ''}</b></span>`; }).join('');
      track.innerHTML = items + items;
    };
    upd();
    return { update: upd };
  },
};
