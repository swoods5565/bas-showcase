// Chilled-water plant, library style.
import base from './chw.js';
import { pvBox } from '../app.js';
import { pv } from '../sim.js';
import { clamp, fmt } from '../util.js';
import { chiller, tower, pump, pipe, valve, waterTemp, flowMeter, lamp, tag, swapGraphic, Q } from '../qa/kit.js';

const Y = [400, 690]; // chiller tops
const C = Y.map(y => y + 34), E = Y.map(y => y + 112); // condenser / evaporator barrel centerlines

function graphic() {
  return `
  ${tower(120, 110, { key: 'ct1' })}${tower(420, 110, { key: 'ct2' })}
  ${tag(320, 146, 'CT-1', { anchor: 'end' })}${tag(620, 146, 'CT-2', { anchor: 'end' })}
  <!-- piping (drawn under the equipment) -->
  ${pipe([[1760, 640], [1760, 950], [720, 950], [720, E[0]], [760, E[0]]], 'chwr', { key: 'chwr' })}
  ${pipe([[720, E[1]], [760, E[1]]], 'chwr', { key: 'chwr' })}
  ${pipe([[1480, 430], [1480, 950]], 'chwr', { w: 12, key: 'byp' })}
  ${pipe([[160, 310], [160, 360], [600, 360], [600, C[1]], [760, C[1]]], 'cws', { key: 'cws' })}
  ${pipe([[460, 310], [460, 360]], 'cws', { key: 'cws' })}${pipe([[600, C[0]], [760, C[0]]], 'cws', { key: 'cws' })}
  ${pipe([[1140, C[1]], [1200, C[1]], [1200, 30], [140, 30], [140, 150]], 'cwr', { key: 'cwr' })}
  ${pipe([[1140, C[0]], [1200, C[0]]], 'cwr', { key: 'cwr' })}${pipe([[440, 30], [440, 150]], 'cwr', { key: 'cwr' })}
  ${pipe([[1140, E[0]], [1330, E[0]]], 'chws', { key: 'chws' })}${pipe([[1140, E[1]], [1330, E[1]], [1330, 430], [1620, 430]], 'chws', { key: 'chws' })}
  ${valve(1480, 700, { s: .8 })}<text x="1500" y="760" class="t-sm">Min-flow bypass</text>
  <!-- equipment -->
  ${pump(620, C[0] - 2, { color: 'green', key: 'cwp1' })}${pump(620, C[1] - 2, { color: 'green', key: 'cwp2' })}
  ${tag(588, C[0] - 40, 'CWP-1', { anchor: 'end' })}${tag(588, C[1] - 40, 'CWP-2', { anchor: 'end' })}
  ${chiller(760, Y[0], { key: 'ch1', tone: 'beige' })}${chiller(760, Y[1], { key: 'ch2', tone: 'beige' })}
  ${tag(800, Y[0] - 16, 'CH-1', { anchor: 'start' })}${lamp(790, Y[0] - 6 - 16, 'ch1')}${tag(800, Y[1] - 16, 'CH-2', { anchor: 'start' })}
  ${pump(1220, E[0] - 2, { color: 'blue', key: 'chwp1' })}${pump(1220, E[1] - 2, { color: 'blue', key: 'chwp2' })}
  ${tag(1270, E[0] - 60, 'CHWP-1')}${tag(1270, E[1] - 60, 'CHWP-2')}
  ${waterTemp(1400, 421)}${flowMeter(1560, 421)}${waterTemp(1640, 941)}${waterTemp(380, 351)}${waterTemp(900, 21)}
  <!-- load -->
  <g filter="url(#qa-shadow)"><rect x="1620" y="380" width="240" height="260" rx="10" fill="#e3e6ea" stroke="#9aa0a6" stroke-width="2"/></g>
  <text x="1740" y="416" text-anchor="middle" class="qa-tag" style="font-size:19px;fill:#1b212c;stroke:none">BUILDING LOAD</text><text x="1740" y="442" text-anchor="middle" style="font-size:15px;fill:#4f5868">AHU-1 coil + misc.</text>
  ${pvBox('CHW.TONS', 1640, 470, { label: 'PLANT LOAD', w: 200 })}
  ${pvBox('CHW.KW-TON', 1640, 560, { label: 'PLANT kW/TON', w: 200 })}
  <!-- readouts -->
  ${pvBox('CHW.CT-1-SPD', 180, 395, { label: 'CT-1 FAN', w: 110 })}${pvBox('CHW.CT-2-SPD', 360, 395, { label: 'CT-2 FAN', w: 110 })}
  ${pvBox('BLDG.OA-WB', 1340, 60, { label: 'OA WET BULB', w: 150 })}
  ${pvBox('CHW.MU-GPM', 1510, 60, { label: 'TOWER MAKEUP', w: 160 })}
  ${pvBox('CHW.CWST', 700, 170, { label: 'CW SUPPLY', w: 140 })}
  ${pvBox('CHW.CWST-SP', 860, 170, { label: 'CWS SETPOINT', w: 150 })}
  ${pvBox('CHW.CWRT', 1030, 170, { label: 'CW RETURN', w: 140 })}
  ${pvBox('CHW.CW-GPM', 700, 260, { label: 'CW FLOW', w: 140 })}
  ${pvBox('CHW.CH-1-SS', 760, 594, { label: 'CH-1 ENABLE', w: 120 })}${pvBox('CHW.CH-1-PLR', 892, 594, { label: '% LOAD', w: 100 })}${pvBox('CHW.CH-1-KW', 1004, 594, { label: 'POWER', w: 130 })}
  ${pvBox('CHW.CH-2-SS', 760, 880, { label: 'CH-2 ENABLE', w: 120 })}${pvBox('CHW.CH-2-PLR', 892, 880, { label: '% LOAD', w: 100 })}${pvBox('CHW.CH-2-KW', 1004, 880, { label: 'POWER', w: 130 })}
  ${pvBox('CHW.CHWP-1-SPD', 1226, 584, { label: 'CHWP-1', w: 90 })}${pvBox('CHW.CHWP-2-SPD', 1226, 874, { label: 'CHWP-2', w: 90 })}
  ${pvBox('CHW.CHWST', 1350, 310, { label: 'CHW SUPPLY', w: 130 })}
  ${pvBox('CHW.CHWST-SP', 1350, 220, { label: 'CHWS SETPOINT', w: 150 })}
  ${pvBox('CHW.CHW-GPM', 1600, 290, { label: 'CHW FLOW', w: 110 })}
  ${pvBox('CHW.CHW-DP', 1620, 200, { label: 'LOOP ΔP', w: 120 })}
  ${pvBox('CHW.CHWRT', 1560, 985, { label: 'CHW RETURN', w: 140 })}
  ${pvBox('CHW.CHW-DT', 1720, 985, { label: 'CHW ΔT', w: 140 })}
  <g transform="translate(60,1000)"><rect width="760" height="56" rx="12" class="qa-banner"/><text x="20" y="36" class="qa-banner-t" data-qbanner>—</text></g>`;
}

export default {
  title: base.title,
  mount(view, id) {
    const ctl = base.mount(view, id);
    const svg = swapGraphic(view, 'Chilled water plant, library style', graphic());
    const upd = () => {
      ctl.update?.();
      const en = pv('CHW.PLANT-EN') === 1;
      const spin = { cwp1: pv('CHW.CWP-1-SS') * 100, cwp2: pv('CHW.CWP-2-SS') * 100, chwp1: pv('CHW.CHWP-1-SPD'), chwp2: pv('CHW.CHWP-2-SPD'), ct1: pv('CHW.CT-1-SPD'), ct2: pv('CHW.CT-2-SPD') };
      Object.entries(spin).forEach(([k, v]) => Q.spin(svg, k, v, 50));
      [1, 2].forEach(n => {
        const run = pv(`CHW.CH-${n}-STS`) === 1, plr = pv(`CHW.CH-${n}-PLR`);
        Q.glow(svg, 'ch' + n, run ? Math.max(plr, 30) : 0); Q.lamp(svg, 'ch' + n, run);
        Q.text(svg, `[data-qscreen="ch${n}"]`, run ? `${fmt(plr, 0)}%` : 'OFF');
        svg.querySelector(`[data-qled="ch${n}"]`).setAttribute('fill', run ? '#3fd15b' : '#30353b');
        svg.querySelector(`[data-qrain="ct${n}"]`).setAttribute('opacity', spin['ct' + n] > 1 || spin['cwp' + n] > 1 ? 1 : 0);
      });
      const dur = clamp(700 / Math.max(pv('CHW.CHW-GPM'), 50), .35, 3);
      ['cws', 'cwr', 'chws', 'chwr'].forEach(k => Q.flow(svg, k, en, dur));
      Q.flow(svg, 'byp', en && pv('CHW.CHW-GPM') < 240, dur);
      Q.text(svg, '[data-qbanner]', view.querySelector('.gfx-wrap [data-banner]')?.textContent || '');
    };
    upd();
    return { ...ctl, update: upd };
  },
};
