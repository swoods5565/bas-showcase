// VAV terminal, library style.
import base from './vav.js';
import { pvBox } from '../app.js';
import { pv, sim } from '../sim.js';
import { ZONES, zoneById } from '../building.js';
import { clamp, fmt } from '../util.js';
import { box, tubeH, coil, act, pipe, valve, tstat, tag, swapGraphic, Q } from '../qa/kit.js';

function graphic(z) {
  const win = z.face ? `<rect x="1770" y="640" width="36" height="260" rx="4" fill="url(#qa-glass)" stroke="#8e9399" stroke-width="3"/>${[0, 1, 2].map(i => `<path d="M1776 ${680 + i * 80} l24 -22" stroke="#ffffff" stroke-width="3" opacity=".7"/>`).join('')}<text x="1788" y="930" text-anchor="middle" class="t-sm">${{ N: 'North', S: 'South', E: 'East', W: 'West' }[z.face]} glazing</text><g data-qsun opacity="0"><circle cx="1866" cy="600" r="24" fill="#ffc83a"/><circle cx="1866" cy="600" r="42" fill="#ffc83a" opacity=".25"/></g>` : '<text x="1790" y="770" text-anchor="middle" class="t-sm" transform="rotate(90 1790 770)">Interior zone, no exterior exposure</text>';
  return `
  <!-- room -->
  <rect x="1060" y="540" width="780" height="420" rx="10" class="qa-room" stroke="#9aa0a6" stroke-width="2"/>
  <rect x="1060" y="540" width="780" height="420" rx="10" fill="#3fd15b" opacity=".09" data-qzone/>
  ${box(1120, 556, 560, 30, { d: 24, sections: [1290] })}
  ${[1180, 1420, 1640].map(x => `<g><ellipse cx="${x}" cy="600" rx="48" ry="10" fill="#8e9399"/><ellipse cx="${x}" cy="596" rx="34" ry="7" fill="#d3d6db"/><ellipse cx="${x}" cy="608" rx="60" ry="9" fill="#6d7177" opacity=".7"/>${[-22, 0, 22].map(dx => `<path class="flow qa-air qa-da" data-qf="dif" d="M${x + dx} 616 L${x + dx * 2.2} 690"/>`).join('')}</g>`).join('')}
  <text x="1380" y="500" class="qa-tag" text-anchor="start" style="font-size:19px">${z.name.toUpperCase()}</text>
  <text x="1380" y="526" class="t-sm">${fmt(z.area, 0)} ft² · Level ${z.floor} · ${z.people} design occupants</text>
  ${tstat(1110, 700, { key: 'z' })}<text x="1205" y="846" text-anchor="middle" class="t-sm" data-qmode>—</text>
  <g transform="translate(1340 850)" filter="url(#qa-shadow)"><rect width="120" height="64" rx="8" fill="#eef1f4" stroke="#aab0b8" stroke-width="2"/><text x="60" y="28" text-anchor="middle" style="font-size:14px;font-weight:700;fill:#3a3d42">CO₂</text><circle cx="20" cy="46" r="7" fill="#3fd15b" data-qco2/><rect x="36" y="40" width="70" height="10" rx="3" fill="#cfd3d8"/></g>
  <g transform="translate(1530 600)"><ellipse cx="0" cy="0" rx="34" ry="12" fill="#eef1f4" stroke="#aab0b8" stroke-width="2"/><ellipse cx="0" cy="6" rx="20" ry="12" fill="#ffffff" stroke="#aab0b8"/><circle cx="0" cy="8" r="5" fill="#7d8187" data-qocc/></g>
  <text x="1530" y="650" text-anchor="middle" class="t-sm" style="font-size:14px">Occupancy</text>
  ${win}
  <!-- primary air -->
  ${tubeH(60, 390, 400, 52)}
  <path class="flow qa-air" data-qf="pa" d="M40,390 H560"/>
  <g transform="translate(420 390)"><ellipse rx="14" ry="50" fill="none" stroke="#e9ecef" stroke-width="6"/><path d="M0 -50 V50 M-10 0 H10" stroke="#5d6168" stroke-width="5"/><rect x="-6" y="-78" width="12" height="28" fill="url(#qa-steel-v)"/><rect x="-30" y="-100" width="60" height="26" rx="5" fill="#d7dadf" stroke="#9aa0a6"/></g>
  <text x="80" y="310" class="qa-tag" text-anchor="start" style="font-size:18px">PRIMARY AIR FROM AHU-1</text>
  <text x="420" y="480" text-anchor="middle" class="t-sm">Flow sensor (ΔP)</text>
  ${tubeH(460, 390, 100, 46)}
  <g transform="translate(512 390)"><ellipse class="qa-rdamp" data-qrd rx="7" ry="44" fill="#4a4e55" stroke="#2a2c30" stroke-width="2"/><path d="M0 -50 V50" stroke="#1d1e20" stroke-width="4"/></g>
  <!-- box + controller -->
  ${box(560, 316, 340, 158, { d: 56 })}
  ${act(570, 254)}
  <g filter="url(#qa-shadow)"><rect x="650" y="226" width="170" height="62" rx="6" fill="#e3e6ea" stroke="#8e9399" stroke-width="2"/><rect x="660" y="236" width="40" height="42" rx="3" fill="#2f3237"/>${[0, 1, 2].map(i => `<circle cx="672" cy="${244 + i * 13}" r="4" fill="${['#3fd15b', '#ffb020', '#3fd15b'][i]}"/>`).join('')}<text x="760" y="252" text-anchor="middle" style="font-size:14px;font-weight:800;fill:#2a2c30">CONTROLLER</text><text x="760" y="272" text-anchor="middle" style="font-size:12.5px;fill:#4f5868">Dev ${z.device} · MAC ${z.mstp.mac}</text></g>
  <path d="M735 288 V316" stroke="#5a5e64" stroke-width="3" stroke-dasharray="4 3"/>
  ${tag(590, 400, z.id, { anchor: 'start' })}<text x="590" y="430" class="qa-lbl" style="font-size:15px">${z.size}" inlet · ${fmt(z.cfmMax, 0)} cfm max</text>
  <!-- reheat + discharge -->
  ${box(960, 330, 330, 120, { d: 56, open: 'l' })}
  ${box(1200, 450, 90, 110, { d: 40, shadow: false })}
  ${coil(910, 330, 120, { kind: 'heat', key: 'rh', w: 22, d: 56 })}
  <path class="flow qa-air qa-da" data-qf="da" d="M960,390 H1245 V556"/>
  ${pipe([[914, 760], [914, 450]], 'hws', { w: 12, key: 'hw' })}${pipe([[938, 450], [938, 760]], 'hwr', { w: 12, key: 'hw' })}
  ${valve(914, 640, { s: .8 })}
  <text x="952" y="740" class="t-sm">HWS / HWR</text>
  <!-- readouts -->
  ${pvBox('AHU-1.SAT', 60, 170, { label: 'AHU SUPPLY TEMP', w: 170 })}
  ${pvBox(z.id + '.CFM', 250, 170, { label: 'AIRFLOW', w: 160 })}
  ${pvBox(z.id + '.CFM-SP', 430, 170, { label: 'FLOW SETPOINT', w: 170 })}
  ${pvBox(z.id + '.DMPR', 850, 170, { label: 'DAMPER', w: 130 })}
  ${pvBox(z.id + '.DAT', 1040, 170, { label: 'DISCHARGE TEMP', w: 170 })}
  ${pvBox(z.id + '.HWV', 740, 660, { label: 'REHEAT VALVE', w: 130 })}
  ${pvBox(z.id + '.MODE', 1230, 170, { label: 'ZONE STATE', w: 170 })}
  ${pvBox(z.id + '.ZN-T', 1420, 170, { label: 'SPACE TEMP', w: 150 })}
  ${pvBox(z.id + '.ZN-HSP', 1590, 170, { label: 'HTG SP', w: 120 })}
  ${pvBox(z.id + '.ZN-CSP', 1730, 170, { label: 'CLG SP', w: 120 })}
  ${pvBox(z.id + '.CO2', 1340, 770, { label: 'CO₂', w: 140 })}
  ${pvBox(z.id + '.OCC', 1590, 690, { label: 'OCC SENSOR', w: 170 })}
  ${pvBox(z.id + '.CLG-LOOP', 60, 590, { label: 'COOLING LOOP', w: 150 })}
  ${pvBox(z.id + '.HTG-LOOP', 230, 590, { label: 'HEATING LOOP', w: 150 })}
  ${pvBox(z.id + '.CFM-MAX', 60, 710, { label: 'CLG MAX', w: 150 })}
  ${pvBox(z.id + '.CFM-MIN', 230, 710, { label: 'MINIMUM', w: 150 })}
  ${pvBox(z.id + '.CFM-HMAX', 400, 710, { label: 'HTG MAX', w: 150 })}
  <text x="60" y="552" class="qa-tag" text-anchor="start" style="font-size:17px">CONTROL LOOPS</text><text x="60" y="672" class="qa-tag" text-anchor="start" style="font-size:17px">AIRFLOW LIMITS (G36)</text>
  <g transform="translate(60,1000)"><rect width="1800" height="56" rx="12" class="qa-banner"/><text x="24" y="36" class="qa-banner-t" data-qbanner>—</text></g>`;
}

export default {
  title: base.title,
  mount(view, id) {
    const z = zoneById[id] || ZONES[12];
    const ctl = base.mount(view, id);
    const svg = swapGraphic(view, `${z.id} VAV terminal unit, library style`, graphic(z));
    const upd = () => {
      ctl.update?.();
      const on = pv('AHU-1.SF-STS') === 1, cfm = pv(z.id + '.CFM'), hwv = pv(z.id + '.HWV'), t = pv(z.id + '.ZN-T');
      const csp = pv(z.id + '.ZN-CSP'), hsp = pv(z.id + '.ZN-HSP'), md = pv(z.id + '.MODE');
      const rd = svg.querySelector('[data-qrd]'), fault = sim.faults[z.id];
      rd.style.transform = `rotate(${-(fault ? 13 : pv(z.id + '.DMPR')) / 100 * 85}deg)`;
      rd.setAttribute('fill', fault ? '#e03215' : '#4a4e55');
      const dur = clamp(2200 / Math.max(cfm, 60) * (z.cfmMax / 1500), .35, 5) + 's';
      svg.querySelectorAll('[data-qf]').forEach(f => { f.classList.toggle('stopped', !on || cfm < 20); f.style.setProperty('--dur', dur); });
      svg.querySelectorAll('.qa-da').forEach(f => f.style.stroke = hwv > 2 ? '#ff6a3d' : '');
      Q.glow(svg, 'rh', hwv); Q.flow(svg, 'hw', hwv > 1);
      svg.querySelector('[data-qzone]').setAttribute('fill', t > csp + .5 ? '#ff6a3d' : t < hsp - .5 ? '#3d8bff' : '#3fd15b');
      Q.text(svg, '[data-qtemp="z"]', fmt(t, 1) + '°');
      Q.text(svg, '[data-qmode]', ['', 'Cooling', 'Satisfied', 'Heating', 'Unoccupied'][md]);
      const co2 = pv(z.id + '.CO2'); svg.querySelector('[data-qco2]').setAttribute('fill', co2 > 1000 ? '#e03215' : co2 > 800 ? '#ff9900' : '#3fd15b');
      svg.querySelector('[data-qocc]').setAttribute('fill', pv(z.id + '.OCC') ? '#3fd15b' : '#7d8187');
      const sun = svg.querySelector('[data-qsun]'); const os = view.querySelector('.gfx-wrap [data-sun]'); if (sun && os) sun.setAttribute('opacity', os.getAttribute('opacity'));
      Q.text(svg, '[data-qbanner]', view.querySelector('.gfx-wrap [data-banner]')?.textContent || '');
    };
    upd();
    return { ...ctl, update: upd };
  },
};
