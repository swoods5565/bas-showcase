// AHU-1, library style: the same page as ahu.js with the equipment graphic redrawn from
// vector-library-style pieces (box ducts, cutaway coils, belt-drive blowers, gear dampers).
import base from './ahu.js';
import { pvBox } from '../app.js';
import { pv } from '../sim.js';
import { clamp } from '../util.js';
import { box, coil, damper, damperH, filter, blower, hood, afms, ductSensor, pipe, valve, lamp, tag, swapGraphic, Q } from '../qa/kit.js';

const UP = [150, 300], LO = [440, 660];

function graphic() {
  const hL = LO[1] - LO[0] - 16, hU = UP[1] - UP[0] - 16;
  return `
  ${box(60, LO[0], 1800, LO[1] - LO[0], { sections: [400, 560, 680, 940, 1260] })}
  ${box(400, UP[1], 160, LO[0] - UP[1], { rails: true, shadow: false })}
  ${box(60, UP[0], 1800, UP[1] - UP[0], { sections: [400, 560, 1180, 1460] })}
  ${hood(60, LO[0], LO[1] - LO[0])}${hood(60, UP[0], UP[1] - UP[0])}
  <!-- air paths -->
  <path class="flow qa-air" data-qf="ra" d="M1850,225 H480"/>
  <path class="flow qa-air" data-qf="ea" d="M480,225 H20"/>
  <path class="flow qa-air" data-qf="rc" d="M480,235 V540"/>
  <path class="flow qa-air" data-qf="oa" d="M10,550 H480"/>
  <path class="flow qa-air" data-qf="sa" d="M480,560 H1890"/>
  <!-- dampers, filter, coils -->
  ${damper(240, UP[0] + 8, hU, { n: 5, key: 'EAD' })}
  ${damper(260, LO[0] + 8, hL, { n: 7, key: 'OAD', actuator: 'bottom' })}
  ${damperH(412, 372, 136, { n: 5, key: 'RAD' })}
  ${afms(350, LO[0] + 8, hL)}
  ${filter(600, LO[0] + 8, hL, { key: 'filt' })}
  ${coil(700, LO[0] + 8, hL, { kind: 'heat', key: 'ph' })}
  ${coil(830, LO[0] + 8, hL, { kind: 'cool', key: 'cc' })}
  ${ductSensor(792, LO[0] - 4, 'avg', 150)}
  <!-- fans -->
  ${blower(1100, 552, 70, { key: 'sf' })}
  ${blower(1320, 226, 48, { key: 'rf', motor: 'left' })}
  ${tag(990, 480, 'SF-1', { anchor: 'end' })}${lamp(970, 500, 'sf')}
  ${tag(1240, 186, 'RF-1', { anchor: 'end' })}${lamp(1222, 206, 'rf')}
  <!-- duct sensors -->
  ${ductSensor(1420, LO[0] - 4, 'temp', 80)}${ductSensor(1510, LO[0] - 4, 'hum', 80)}${ductSensor(1640, LO[0] - 4, 'press', 70)}${ductSensor(1770, LO[0] - 4, 'smoke', 80)}
  ${ductSensor(1640, UP[0] - 4, 'temp', 70)}${ductSensor(1730, UP[0] - 4, 'hum', 70)}
  <!-- coil piping -->
  ${pipe([[706, 900], [706, LO[1]]], 'hws', { w: 14, key: 'phv' })}${pipe([[732, LO[1]], [732, 900]], 'hwr', { w: 14, key: 'phv' })}
  ${pipe([[836, 900], [836, LO[1]]], 'chws', { w: 14, key: 'ccv' })}${pipe([[862, LO[1]], [862, 900]], 'chwr', { w: 14, key: 'ccv' })}
  ${valve(706, 790, { orient: 'v', s: .9 })}${valve(836, 790, { orient: 'v', s: .9 })}
  <text x="672" y="924" class="t-sm">HWS / HWR</text><text x="806" y="924" class="t-sm">CHWS / CHWR</text>
  <!-- VFD -->
  <g filter="url(#qa-shadow)"><rect x="1010" y="690" width="150" height="96" rx="6" fill="#d9dce0" stroke="#8e9399" stroke-width="2"/><rect x="1028" y="704" width="70" height="30" rx="3" fill="#163a2a"/><text x="1063" y="725" text-anchor="middle" style="font:700 15px var(--mono);fill:#5dff9a" data-qvfd>0 %</text><circle cx="1130" cy="718" r="8" fill="#3fd15b" data-qlamp="sf"/><text x="1085" y="770" text-anchor="middle" style="font-size:15px;font-weight:700;fill:#3a3d42">VFD-SF1</text></g>
  <path d="M1085 690 V654" stroke="#5a5e64" stroke-width="3" stroke-dasharray="5 4"/>
  <!-- labels -->
  <text x="80" y="${UP[1] - 18}" class="qa-lbl">◀ Exhaust</text>
  <text x="1840" y="${UP[0] + 36}" text-anchor="end" class="qa-lbl">◀ Return air from plenum</text>
  <text x="80" y="${LO[1] - 18}" class="qa-lbl">Outdoor air ▶</text>
  <text x="1840" y="${LO[1] - 20}" text-anchor="end" class="qa-lbl">Supply to VAVs ▶</text>
  <text x="640" y="${LO[1] + 30}" text-anchor="middle" class="t-sm">MERV 13</text>
  <!-- point readouts -->
  ${pvBox('AHU-1.EAD', 60, 60, { label: 'EA DAMPER' })}
  ${pvBox('AHU-1.RF-SPD', 1170, 60, { label: 'RF SPEED' })}
  ${pvBox('AHU-1.RF-KW', 1360, 60, { label: 'RF POWER' })}
  ${pvBox('AHU-1.RA-RH', 1540, 60, { label: 'RA HUMIDITY', w: 140 })}
  ${pvBox('AHU-1.RAT', 1710, 60, { label: 'RA TEMP', w: 140 })}
  ${pvBox('AHU-1.OAD', 60, 316, { label: 'OA DAMPER', w: 150 })}
  ${pvBox('AHU-1.OA-CFM', 60, 384, { label: 'OA AIRFLOW (AFMS)', w: 170 })}
  ${pvBox('AHU-1.RAD', 630, 322, { label: 'RA DAMPER', w: 130 })}
  ${pvBox('AHU-1.FILT-DP', 775, 322, { label: 'FILTER ΔP', w: 150 })}
  ${pvBox('BLDG.OAT', 60, 730, { label: 'OA TEMP', w: 140 })}
  ${pvBox('BLDG.OA-RH', 220, 730, { label: 'OA RH', w: 120 })}
  ${pvBox('AHU-1.MAT', 380, 730, { label: 'MIXED AIR', w: 140 })}
  ${pvBox('AHU-1.PHV', 620, 960, { label: 'PREHEAT VLV', w: 140 })}
  ${pvBox('AHU-1.CCV', 790, 960, { label: 'CHW VALVE', w: 140 })}
  ${pvBox('AHU-1.SF-SS', 990, 830, { label: 'SF CMD', w: 110 })}
  ${pvBox('AHU-1.SF-STS', 1110, 830, { label: 'SF STATUS', w: 110 })}
  ${pvBox('AHU-1.SF-SPD', 990, 900, { label: 'SF SPEED', w: 110 })}
  ${pvBox('AHU-1.SF-KW', 1110, 900, { label: 'SF POWER', w: 130 })}
  ${pvBox('AHU-1.SAT', 1350, 700, { label: 'SUPPLY TEMP', w: 150 })}
  ${pvBox('AHU-1.SAT-SP', 1350, 780, { label: 'SAT SETPOINT', w: 150 })}
  ${pvBox('AHU-1.SA-RH', 1520, 700, { label: 'SA RH', w: 110 })}
  ${pvBox('AHU-1.DSP', 1650, 700, { label: 'DUCT STATIC', w: 190 })}
  ${pvBox('AHU-1.DSP-SP', 1650, 780, { label: 'STATIC SETPOINT', w: 190 })}
  ${pvBox('AHU-1.SA-CFM', 1350, 356, { label: 'SUPPLY AIRFLOW', w: 190 })}
  ${pvBox('AHU-1.SMK', 1560, 356, { label: 'DUCT SMOKE', w: 120 })}
  ${pvBox('AHU-1.FRZ', 940, 322, { label: 'FREEZESTAT', w: 130 })}
  ${pvBox('AHU-1.ECON-EN', 1085, 322, { label: 'ECONOMIZER', w: 150 })}
  <g transform="translate(60,1000)"><rect width="1800" height="56" rx="12" class="qa-banner"/><text x="24" y="36" class="qa-banner-t" data-qbanner>—</text></g>`;
}

export default {
  title: base.title,
  mount(view, id) {
    const ctl = base.mount(view, id);
    const svg = swapGraphic(view, 'AHU-1 air handling unit, library style', graphic());
    const upd = () => {
      ctl.update?.();
      const on = pv('AHU-1.SF-STS') === 1, spd = pv('AHU-1.SF-SPD');
      Q.spin(svg, 'sf', spd); Q.spin(svg, 'rf', pv('AHU-1.RF-SPD'));
      Q.lamp(svg, 'sf', on); Q.lamp(svg, 'rf', on && pv('AHU-1.RF-SPD') > 1);
      ['EAD', 'OAD', 'RAD'].forEach(k => Q.blades(svg, k, pv('AHU-1.' + k)));
      Q.glow(svg, 'ph', pv('AHU-1.PHV')); Q.glow(svg, 'cc', pv('AHU-1.CCV'));
      svg.querySelector('[data-qdirt="filt"]').setAttribute('opacity', clamp((pv('AHU-1.FILT-DP') - .25) / 1.1, 0, .75).toFixed(2));
      const oa = pv('AHU-1.OAD') / 100, dur = on ? clamp(55 / Math.max(spd, 5), .4, 5) : 1;
      const flows = { ra: on, ea: on && pv('AHU-1.EAD') > 2, rc: on && pv('AHU-1.RAD') > 2, oa: on && oa > .02, sa: on };
      Object.entries(flows).forEach(([k, v]) => { const f = svg.querySelector(`[data-qf="${k}"]`); f.classList.toggle('stopped', !v); f.style.setProperty('--dur', dur + 's'); });
      Q.flow(svg, 'phv', pv('AHU-1.PHV') > 1); Q.flow(svg, 'ccv', pv('AHU-1.CCV') > 1);
      Q.text(svg, '[data-qvfd]', `${Math.round(spd)} %`);
      Q.text(svg, '[data-qbanner]', view.querySelector('#ahuBanner')?.textContent || '');
    };
    upd();
    return { ...ctl, update: upd };
  },
};
