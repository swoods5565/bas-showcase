// Heating hot-water plant, library style.
import base from './hw.js';
import { pvBox } from '../app.js';
import { pv } from '../sim.js';
import { ZONES } from '../building.js';
import { clamp, fmt } from '../util.js';
import { boiler, pump, pipe, waterTemp, flowMeter, lamp, tag, swapGraphic, Q } from '../qa/kit.js';

const B = [300, 620]; // boiler x positions

function graphic() {
  return `
  <!-- piping -->
  ${pipe([[B[0] + 190, 345], [B[0] + 190, 300], [1500, 300]], 'hws', { key: 'hws' })}${pipe([[B[1] + 190, 345], [B[1] + 190, 300]], 'hws', { key: 'hws' })}
  ${pipe([[900, 300], [900, 540], [1140, 540], [1140, 300]], 'hws', { key: 'hws' })}
  ${pipe([[1700, 560], [1700, 830], [B[0] + 60, 830], [B[0] + 60, 690]], 'hwr', { key: 'hwr' })}${pipe([[B[1] + 60, 830], [B[1] + 60, 690]], 'hwr', { key: 'hwr' })}
  ${pipe([[160, 780], [260, 780], [260, 640], [B[0], 640]], 'gas', { w: 10, key: 'gas' })}${pipe([[260, 780], [580, 780], [580, 640], [B[1], 640]], 'gas', { w: 10, key: 'gas' })}
  <g filter="url(#qa-shadow)"><rect x="100" y="752" width="76" height="56" rx="8" fill="#d7dadf" stroke="#8e9399" stroke-width="2"/><circle cx="124" cy="780" r="14" fill="#ffffff" stroke="#6b6f75" stroke-width="2"/><path d="M124 780 l7 -6" stroke="#e03215" stroke-width="2"/><text x="156" y="786" text-anchor="middle" style="font-size:13px;font-weight:800;fill:#8a6a00">GAS</text></g>
  <text x="60" y="850" class="t-sm">Natural gas service</text>
  <!-- equipment -->
  ${boiler(B[0], 360, { key: 'b1' })}${boiler(B[1], 360, { key: 'b2' })}
  ${tag(B[0] + 110, 140, 'B-1')}${lamp(B[0] + 160, 133, 'b1')}${tag(B[1] + 110, 140, 'B-2')}${lamp(B[1] + 160, 133, 'b2')}
  <text x="${B[0] + 110}" y="${360 + 104}" text-anchor="middle" class="qa-lbl" style="font-size:14px">1,500 MBH CONDENSING</text><text x="${B[1] + 110}" y="${360 + 104}" text-anchor="middle" class="qa-lbl" style="font-size:14px">1,500 MBH CONDENSING</text>
  ${pump(972, 298, { color: 'red', key: 'hwp1' })}${pump(972, 538, { color: 'red', key: 'hwp2' })}
  ${tag(1000, 238, 'HWP-1')}${tag(1000, 478, 'HWP-2')}
  ${waterTemp(1300, 291)}${flowMeter(1420, 291)}${waterTemp(1300, 821)}
  <!-- load -->
  <g filter="url(#qa-shadow)"><rect x="1500" y="240" width="340" height="320" rx="10" fill="#e3e6ea" stroke="#9aa0a6" stroke-width="2"/></g>
  <text x="1670" y="280" text-anchor="middle" class="qa-tag" style="font-size:19px;fill:#1b212c;stroke:none">HEATING LOADS</text><text x="1670" y="306" text-anchor="middle" style="font-size:15px;fill:#4f5868">${ZONES.length} VAV reheat coils · AHU-1 preheat</text>
  ${pvBox('HW.MBH', 1530, 360, { label: 'PLANT LOAD', w: 280 })}
  ${pvBox('HW.HW-GPM', 1530, 450, { label: 'HW FLOW', w: 280 })}
  ${pvBox('BLDG.OAT', 1530, 90, { label: 'OUTDOOR AIR', w: 150 })}
  ${pvBox('HW.HWST-SP', 1300, 90, { label: 'HWS SETPOINT (OA RESET)', w: 200 })}
  ${pvBox('HW.HWST', 1150, 180, { label: 'HW SUPPLY', w: 140 })}
  ${pvBox('HW.HWRT', 1150, 870, { label: 'HW RETURN', w: 140 })}
  ${pvBox('HW.GAS-CFH', 60, 900, { label: 'GAS FLOW', w: 150 })}
  ${pvBox('HW.B-1-SS', 300, 880, { label: 'B-1 ENABLE', w: 100 })}${pvBox('HW.B-1-FIRE', 410, 880, { label: 'FIRING', w: 110 })}
  ${pvBox('HW.B-2-SS', 620, 880, { label: 'B-2 ENABLE', w: 100 })}${pvBox('HW.B-2-FIRE', 730, 880, { label: 'FIRING', w: 110 })}
  ${pvBox('HW.B-1-EFF', 300, 960, { label: 'B-1 EFFICIENCY', w: 160 })}${pvBox('HW.B-2-EFF', 620, 960, { label: 'B-2 EFFICIENCY', w: 160 })}
  ${pvBox('HW.HWP-1-SPD', 1170, 330, { label: 'HWP-1', w: 100 })}${pvBox('HW.HWP-2-SPD', 1170, 580, { label: 'HWP-2', w: 100 })}
  <g transform="translate(1000,990)"><rect width="860" height="56" rx="12" class="qa-banner"/><text x="20" y="36" class="qa-banner-t" data-qbanner>—</text></g>`;
}

export default {
  title: base.title,
  mount(view, id) {
    const ctl = base.mount(view, id);
    const svg = swapGraphic(view, 'Heating hot water plant, library style', graphic());
    const upd = () => {
      ctl.update?.();
      const en = pv('HW.PLANT-EN') === 1;
      Q.spin(svg, 'hwp1', pv('HW.HWP-1-SPD'), 50); Q.spin(svg, 'hwp2', pv('HW.HWP-2-SPD'), 50);
      [1, 2].forEach(n => {
        const f = pv(`HW.B-${n}-FIRE`);
        Q.glow(svg, 'b' + n, f); Q.lamp(svg, 'b' + n, f > 1);
        Q.text(svg, `[data-qscreen="b${n}"]`, f > 1 ? `${fmt(f, 0)}%` : 'OFF');
        svg.querySelector(`[data-qplume="b${n}"]`).setAttribute('opacity', f > 1 ? 1 : 0);
      });
      const dur = clamp(300 / Math.max(pv('HW.HW-GPM'), 20), .4, 3);
      Q.flow(svg, 'hws', en, dur); Q.flow(svg, 'hwr', en, dur); Q.flow(svg, 'gas', pv('HW.B-1-FIRE') > 1, 1.4);
      Q.text(svg, '[data-qbanner]', view.querySelector('.gfx-wrap [data-banner]')?.textContent || '');
    };
    upd();
    return { ...ctl, update: upd };
  },
};
