import { h, fmt, clamp, $ } from '../util.js';
import { pvBox } from '../app.js';
import { pv, pts, sim } from '../sim.js';
import { wx } from '../weather.js';
import { lineChart } from '../charts.js';
import { psychChart } from '../psychchart.js';
import { wFromRH, P_STD } from '../psychro.js';

// Helpers producing SVG snippets for the 1920×1080 equipment canvas
const damper = (id, x, y, n, len, vertical = true) => `<g class="damper" data-dmp="${id}">${Array.from({ length: n }, (_, i) => vertical
  ? `<rect class="blade" x="${x - 4}" y="${y + i * (len / n) + 4}" width="8" height="${len / n - 8}" rx="3" fill="var(--text-2)"/>`
  : `<rect class="blade" x="${x + i * (len / n) + 4}" y="${y - 4}" width="${len / n - 8}" height="8" rx="3" fill="var(--text-2)"/>`).join('')}
  <rect x="${vertical ? x - 14 : x}" y="${vertical ? y : y - 14}" width="${vertical ? 28 : len}" height="${vertical ? len : 28}" fill="none" stroke="var(--muted)" stroke-dasharray="4 4" rx="4"/></g>`;
const coil = (x, y, w, hh, color) => `<g><rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="4" fill="color-mix(in srgb, ${color} 18%, var(--equip))" stroke="${color}" stroke-width="2.5"/>${Array.from({ length: Math.floor(hh / 14) }, (_, i) => `<path d="M${x + 6} ${y + 10 + i * 14} q${(w - 12) / 4} -8 ${(w - 12) / 2} 0 t${(w - 12) / 2} 0" fill="none" stroke="${color}" stroke-width="2" opacity=".7"/>`).join('')}</g>`;
const valve = (x, y, color, tag) => `<g transform="translate(${x},${y})"><path d="M-18,-12 L18,12 L18,-12 L-18,12Z" fill="var(--panel-solid)" stroke="${color}" stroke-width="2.5"/><path d="M0,0 V-26 M-12,-26 H12" stroke="${color}" stroke-width="2.5"/><rect x="-14" y="-44" width="28" height="18" rx="3" fill="var(--equip)" stroke="${color}"/><text x="0" y="-31" text-anchor="middle" style="font-size:11px;font-weight:700;fill:var(--text)">M</text><text x="26" y="6" class="t-sm">${tag}</text></g>`;
const fan = (cx, cy, r, tag, key) => `<g><circle cx="${cx}" cy="${cy}" r="${r + 14}" fill="var(--equip)" stroke="var(--duct-edge)" stroke-width="3"/>
  <circle cx="${cx}" cy="${cy}" r="${r + 22}" class="status-ring" data-ring="${key}"/>
  <g class="rotor" data-rotor="${key}">${[0, 60, 120, 180, 240, 300].map(a => `<path d="M${cx},${cy} q${r * .35},${-r * .55} ${r * .95},${-r * .18} q${-r * .2},${r * .32} ${-r * .95},${r * .18}z" transform="rotate(${a} ${cx} ${cy})" fill="var(--accent)" opacity=".85"/>`).join('')}<circle cx="${cx}" cy="${cy}" r="${r * .22}" fill="var(--panel-solid)" stroke="var(--accent)" stroke-width="3"/></g>
  <text x="${cx}" y="${cy - r - 34}" text-anchor="middle" class="t-tag">${tag}</text></g>`;

function graphic() {
  const UP = [150, 260], LO = [460, 640];
  return `<svg class="gfx" viewBox="0 0 1920 1080" role="img" aria-label="AHU-1 air handling unit graphic">
  <defs>
    <linearGradient id="ductG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--duct)"/><stop offset=".5" stop-color="color-mix(in srgb, var(--duct) 80%, #fff 6%)"/><stop offset="1" stop-color="var(--duct)"/></linearGradient>
    <pattern id="pleat" width="16" height="24" patternUnits="userSpaceOnUse"><path d="M0 0 L8 24 L16 0" fill="none" stroke="var(--muted)" stroke-width="2"/></pattern>
  </defs>
  <!-- ducts -->
  <rect x="60" y="${UP[0]}" width="1800" height="${UP[1] - UP[0]}" rx="10" fill="url(#ductG)" stroke="var(--duct-edge)" stroke-width="2"/>
  <rect x="60" y="${LO[0]}" width="1800" height="${LO[1] - LO[0]}" rx="10" fill="url(#ductG)" stroke="var(--duct-edge)" stroke-width="2"/>
  <rect x="400" y="${UP[1] - 4}" width="150" height="${LO[0] - UP[1] + 8}" fill="url(#ductG)" stroke="var(--duct-edge)" stroke-width="2"/>
  <rect x="402" y="${UP[1] - 2}" width="146" height="${LO[0] - UP[1] + 6}" fill="var(--duct)"/>
  <!-- flows -->
  <path class="flow" data-flow="ra" d="M1850,205 H475" stroke="var(--air-ra)"/>
  <path class="flow" data-flow="ea" d="M475,205 H40" stroke="var(--air-ea)"/>
  <path class="flow" data-flow="rc" d="M475,215 V540" stroke="var(--air-ra)"/>
  <path class="flow" data-flow="oa" d="M40,550 H475" stroke="var(--air-oa)"/>
  <path class="flow" data-flow="sa" d="M475,550 H1880" stroke="var(--air-sa)"/>
  <!-- labels in ducts -->
  <text x="80" y="${UP[0] + 34}" class="t-lbl">◀ Exhaust</text>
  <text x="1840" y="${UP[0] + 34}" text-anchor="end" class="t-lbl">◀ Return air from plenum</text>
  <text x="80" y="${LO[1] + 30}" class="t-lbl">Outdoor air ▶</text>
  <text x="1840" y="${LO[0] + 34}" text-anchor="end" class="t-lbl">Supply to VAVs ▶</text>
  <!-- dampers -->
  ${damper('EAD', 250, UP[0] + 10, 5, 90)} <text x="250" y="${UP[1] + 28}" text-anchor="middle" class="t-sm">EA damper</text>
  ${damper('OAD', 250, LO[0] + 10, 7, 160)} <text x="250" y="${LO[0] - 12}" text-anchor="middle" class="t-sm">OA damper</text>
  ${damper('RAD', 410, 360, 5, 130, false)} <text x="390" y="366" text-anchor="end" class="t-sm">RA damper</text>
  <!-- filter -->
  <rect x="600" y="${LO[0] + 6}" width="54" height="${LO[1] - LO[0] - 12}" fill="url(#pleat)" stroke="var(--muted)" stroke-width="2" rx="3"/>
  <text x="627" y="${LO[1] + 28}" text-anchor="middle" class="t-sm">Filter · MERV 13</text>
  <!-- preheat + freezestat + cooling coil -->
  ${coil(700, LO[0] + 10, 56, LO[1] - LO[0] - 20, 'var(--heat)')}
  <path d="M780 ${LO[0] + 14} v24 h8 v24 h-8 v24 h8 v24 h-8 v24 h8 v24 h-8 v24" fill="none" stroke="var(--warn)" stroke-width="2" stroke-dasharray="4 3"/>
  ${coil(810, LO[0] + 10, 76, LO[1] - LO[0] - 20, 'var(--cool)')}
  <text x="728" y="${LO[0] - 12}" text-anchor="middle" class="t-sm">Preheat</text>
  <text x="848" y="${LO[0] - 12}" text-anchor="middle" class="t-sm">CHW coil</text>
  <!-- coil piping -->
  <path d="M718 ${LO[1] - 10} V800 M742 ${LO[1] - 10} V860" stroke="var(--hw)" stroke-width="7" stroke-linecap="round" opacity=".8"/>
  <path d="M835 ${LO[1] - 10} V800 M865 ${LO[1] - 10} V860" stroke="var(--chw)" stroke-width="7" stroke-linecap="round" opacity=".8"/>
  <path class="pipe-core" data-pipe="phv" d="M718 800 V${LO[1] - 10}" style="stroke-width:3"/>
  <path class="pipe-core" data-pipe="ccv" d="M835 800 V${LO[1] - 10}" style="stroke-width:3"/>
  ${valve(718, 760, 'var(--hw)', '')}
  ${valve(835, 760, 'var(--chw)', '')}
  <text x="660" y="900" class="t-sm">HWS/HWR</text><text x="820" y="900" class="t-sm">CHWS/CHWR</text>
  <!-- fans -->
  ${fan(1080, 550, 64, 'SF-1 · Supply fan array', 'sf')}
  ${fan(1320, 205, 36, '', 'rf')}
  <text x="1320" y="${UP[0] - 14}" text-anchor="middle" class="t-tag">RF-1</text>
  <!-- VFD boxes -->
  <rect x="990" y="720" width="180" height="70" rx="8" class="equip"/><text x="1080" y="745" text-anchor="middle" class="t-sm">VFD-SF1</text>
  <path d="M1080 720 V652" stroke="var(--muted)" stroke-dasharray="4 4"/>
  <!-- sensors (instrument bubbles) -->
  ${[[1420, 'TT'], [1510, 'MT'], [1640, 'PT'], [1760, 'SD']].map(([x, t]) => `<g><line x1="${x}" y1="${LO[0]}" x2="${x}" y2="${LO[0] + 40}" stroke="var(--muted)" stroke-width="2"/><circle cx="${x}" cy="${LO[0] - 2}" r="16" fill="var(--panel-solid)" stroke="var(--muted)" stroke-width="2"/><text x="${x}" y="${LO[0] + 3}" text-anchor="middle" style="font-size:12px;font-weight:700;fill:var(--text-2)">${t}</text></g>`).join('')}
  <line x1="610" y1="${LO[0] + 30}" x2="610" y2="${LO[0] - 60}" stroke="var(--muted)" stroke-dasharray="3 3"/>
  <!-- point readouts -->
  ${pvBox('AHU-1.EAD', 60, 60, { label: 'EA DAMPER' })}
  ${pvBox('AHU-1.RF-SPD', 1170, 60, { label: 'RF SPEED' })}
  ${pvBox('AHU-1.RF-KW', 1400, 60, { label: 'RF POWER' })}
  ${pvBox('AHU-1.RA-RH', 1560, 60, { label: 'RA HUMIDITY', w: 140 })}
  ${pvBox('AHU-1.RAT', 1720, 60, { label: 'RA TEMP', w: 140 })}
  ${pvBox('AHU-1.OAD', 60, 300, { label: 'OA DAMPER', w: 150 })}
  ${pvBox('AHU-1.OA-CFM', 60, 375, { label: 'OA AIRFLOW (AFMS)', w: 190 })}
  ${pvBox('AHU-1.RAD', 580, 290, { label: 'RA DAMPER', w: 140 })}
  ${pvBox('AHU-1.FILT-DP', 580, 380, { label: 'FILTER ΔP', w: 160 })}
  ${pvBox('BLDG.OAT', 60, 690, { label: 'OA TEMP', w: 140 })}
  ${pvBox('BLDG.OA-RH', 220, 690, { label: 'OA RH', w: 120 })}
  ${pvBox('AHU-1.MAT', 380, 690, { label: 'MIXED AIR', w: 140 })}
  ${pvBox('AHU-1.PHV', 620, 940, { label: 'PREHEAT VLV', w: 140 })}
  ${pvBox('AHU-1.CCV', 790, 940, { label: 'CHW VALVE', w: 140 })}
  ${pvBox('AHU-1.SF-SS', 990, 810, { label: 'SF CMD', w: 110 })}
  ${pvBox('AHU-1.SF-STS', 1110, 810, { label: 'SF STATUS', w: 110 })}
  ${pvBox('AHU-1.SF-SPD', 990, 890, { label: 'SF SPEED', w: 110 })}
  ${pvBox('AHU-1.SF-KW', 1110, 890, { label: 'SF POWER', w: 130 })}
  ${pvBox('AHU-1.SAT', 1350, 690, { label: 'SUPPLY TEMP', w: 150 })}
  ${pvBox('AHU-1.SAT-SP', 1350, 770, { label: 'SAT SETPOINT', w: 150 })}
  ${pvBox('AHU-1.SA-RH', 1520, 690, { label: 'SA RH', w: 110 })}
  ${pvBox('AHU-1.DSP', 1650, 690, { label: 'DUCT STATIC', w: 190 })}
  ${pvBox('AHU-1.DSP-SP', 1650, 770, { label: 'STATIC SETPOINT', w: 190 })}
  ${pvBox('AHU-1.SA-CFM', 1350, 370, { label: 'SUPPLY AIRFLOW', w: 190 })}
  ${pvBox('AHU-1.SMK', 1700, 370, { label: 'DUCT SMOKE', w: 140 })}
  ${pvBox('AHU-1.FRZ', 880, 290, { label: 'FREEZESTAT', w: 140 })}
  ${pvBox('AHU-1.ECON-EN', 1050, 290, { label: 'ECONOMIZER', w: 160 })}
  <!-- mode banner -->
  <g transform="translate(60,980)"><rect width="1800" height="60" rx="12" fill="var(--panel-solid)" stroke="var(--line-2)"/><text x="24" y="38" style="font-size:22px;font-weight:600;fill:var(--text-2)" id="ahuBanner">—</text></g>
</svg>`;
}

export default {
  title: () => 'AHU-1',
  mount(view) {
    view.append(h('div.page-head', {},
      h('div', {}, h('div.crumbs', { html: '<a href="#/">Meridian Tower</a> › Air Side › AHU-1' }), h('h1', {}, 'AHU-1 · Variable-air-volume air handler'),
        h('p', {}, 'Return-fan VAV unit with airside economizer, MERV 13 filtration, hot-water preheat and chilled-water cooling. Blade angles, fan speed, flow animation and coil piping are all driven by live points — click any value to inspect or command it.')),
      h('div.head-actions', {}, h('span.badge', { id: 'ahuMode' }), h('a.btn', { href: '#/vavs' }, 'Served VAVs →'))));
    const g = h('div.card.flush.gfx-wrap', { html: graphic() }); view.append(g);
    const svg = g.querySelector('svg');

    const row = h('div.grid.g-3', { style: { marginTop: '16px' } }); view.append(row);
    const seq = h('div.card'); seq.innerHTML = `<div class="card-h"><h3>Sequence status</h3><span class="sub">ASHRAE Guideline 36 §5.16</span></div><div id="seq"></div>`;
    const fdd = h('div.card'); fdd.innerHTML = `<div class="card-h"><h3>Fault detection (AFDD)</h3><span class="sub">G36-style rules</span></div><div class="fdd" id="fdd"></div>`;
    const psy = h('div.card'); psy.innerHTML = `<div class="card-h"><h3>Air-side psychrometrics</h3><span class="sub">OA → MA → SA, RA</span></div><div id="psy"></div>`;
    row.append(seq, fdd, psy);
    const row2 = h('div.grid.g-2', { style: { marginTop: '16px' } }); view.append(row2);
    const c1 = h('div.card'); c1.innerHTML = `<div class="card-h"><h3>Supply air temperature</h3><span class="sub">Last 60 simulated minutes</span></div><div id="t1"></div>`;
    const c2 = h('div.card'); c2.innerHTML = `<div class="card-h"><h3>Duct static pressure</h3><span class="sub">Trim & respond reset</span></div><div id="t2"></div>`;
    row2.append(c1, c2);

$('#seq', seq).innerHTML = `<div class="pt-list">
      <div class="row-pt"><span class="n"><b>Economizer</b> · 90.1 fixed dry-bulb, CZ <span id="czT"></span> (est.)</span><span class="badge" id="econB"></span></div>
        <div class="row-pt"><span class="n">High-limit shutoff</span><span class="pv-chip" data-pt="AHU-1.ECON-HL"></span></div>
        <div class="row-pt"><span class="n"><b>SAT reset</b> · T&R, 55–65 °F, OAT 60→70 °F</span><span class="pv-chip" data-pt="AHU-1.SAT-SP"></span></div>
        <div class="row-pt"><span class="n">Cooling requests (ignore 2)</span><span class="pv-chip" data-pt="AHU-1.CLG-REQ"></span></div>
        <div class="row-pt"><span class="n"><b>Static reset</b> · T&R 0.5–1.5 in. w.c.</span><span class="pv-chip" data-pt="AHU-1.DSP-SP"></span></div>
        <div class="row-pt"><span class="n">Pressure requests (dampers &gt; 95 %)</span><span class="pv-chip" data-pt="AHU-1.SP-REQ"></span></div>
        <div class="row-pt"><span class="n"><b>Min OA</b> · 62.1 Vot = ΣVbz / Ev (0.8)</span><span class="pv-chip" data-pt="AHU-1.OA-MIN"></span></div>
        <div class="row-pt"><span class="n">Measured OA (AFMS)</span><span class="pv-chip" data-pt="AHU-1.OA-CFM"></span></div></div>`;
    const H = (id) => pts.get(id).hist.slice(-360);
    const ch1 = lineChart($('#t1', c1), { height: 230, series: [], y: { unit: '°F' } });
    const ch2 = lineChart($('#t2', c2), { height: 230, series: [], y: { unit: 'in. w.c.', fmt: v => fmt(v, 2) } });
    const pc = psychChart($('#psy', psy), { height: 360, P: wx.P || P_STD, tMin: 20, tMax: 100, wMax: .024 });

    let n = 0;
    const upd = () => {
      const on = pv('AHU-1.SF-STS') === 1, spd = pv('AHU-1.SF-SPD'), rf = pv('AHU-1.RF-SPD');
      // Fans
      svg.querySelectorAll('[data-rotor]').forEach(r => { const s = r.dataset.rotor === 'sf' ? spd : rf; r.style.setProperty('--dur', (s > 1 ? clamp(40 / s, .35, 4) : 1) + 's'); r.classList.toggle('stopped', s < 1); });
      svg.querySelectorAll('[data-ring]').forEach(r => { r.setAttribute('class', 'status-ring ' + (on ? 'run' : 'stop')); });
      // Dampers: blade angle from position (0 % = closed/perpendicular, 100 % = open)
      [['EAD', true], ['OAD', true], ['RAD', false]].forEach(([k]) => { const pos = pv('AHU-1.' + k); svg.querySelectorAll(`[data-dmp="${k}"] .blade`).forEach(b => b.style.transform = `rotate(${pos / 100 * 78}deg)`); });
      // Air flows
      const oa = pv('AHU-1.OAD') / 100, dur = on ? clamp(55 / Math.max(spd, 5), .4, 5) : 1;
      const flows = { ra: on, ea: on && pv('AHU-1.EAD') > 2, rc: on && pv('AHU-1.RAD') > 2, oa: on && oa > .02, sa: on };
      Object.entries(flows).forEach(([k, v]) => { const f = svg.querySelector(`[data-flow="${k}"]`); f.classList.toggle('stopped', !v); f.style.setProperty('--dur', dur + 's'); f.style.opacity = v ? (k === 'oa' || k === 'ea' ? .35 + .65 * oa : k === 'rc' ? .35 + .65 * (1 - oa) : .9) : ''; });
      svg.querySelector('[data-pipe="phv"]').classList.toggle('stopped', pv('AHU-1.PHV') < 1);
      svg.querySelector('[data-pipe="ccv"]').classList.toggle('stopped', pv('AHU-1.CCV') < 1);
      // Banner
      const econ = pv('AHU-1.ECON-EN') === 1, mode = ['', 'Occupied', 'Unoccupied', 'Morning warm-up', 'Morning cool-down'][pv('BLDG.OCC-MODE')];
      const stage = !on ? 'Unit off' : pv('AHU-1.PHV') > 1 ? 'Heating (preheat)' : econ && pv('AHU-1.CCV') < 1 ? 'Economizer only (free cooling)' : econ ? 'Economizer + mechanical cooling' : pv('AHU-1.CCV') > 1 ? 'Mechanical cooling · minimum OA' : 'Ventilation · minimum OA';
      svg.querySelector('#ahuBanner').textContent = `${mode}  ·  ${stage}  ·  OA fraction ${fmt(oa * 100, 0)} %  ·  ${fmt(pv('AHU-1.SA-CFM'), 0)} cfm to ${40} VAV boxes`;
      const b = $('#ahuMode'); b.className = 'badge ' + (on ? 'ok' : 'off'); b.innerHTML = `<i></i>${on ? 'Running' : 'Off'} · ${mode}`;

      // Sequence card
      const oat = pv('BLDG.OAT'), hl = pv('AHU-1.ECON-HL');
      const eb = $('#econB'); eb.className = 'badge ' + (econ ? 'ok' : 'off'); eb.textContent = econ ? 'Enabled' : 'Locked out'; $('#czT').textContent = wx.climate?.zone || '5A';
      // AFDD rules (simplified, patterned after G36 fault conditions)
      const sat = pv('AHU-1.SAT'), sp = pv('AHU-1.SAT-SP'), mat = pv('AHU-1.MAT'), rat = pv('AHU-1.RAT');
      const rules = [
        ['Duct static below setpoint with fan at full speed', on && pv('AHU-1.DSP') < pv('AHU-1.DSP-SP') - .1 && spd > 98],
        ['MAT below both RAT and OAT (sensor error)', on && mat < Math.min(rat, oat) - 2],
        ['MAT above both RAT and OAT (sensor error)', on && mat > Math.max(rat, oat) + 2],
        ['SAT too high with cooling valve 100 %', on && sat > sp + 2 && pv('AHU-1.CCV') > 99],
        ['OA fraction below minimum while economizing', on && econ && pv('AHU-1.OA-CFM') < pv('AHU-1.OA-MIN') * .9],
        ['Simultaneous heating and cooling', on && pv('AHU-1.PHV') > 5 && pv('AHU-1.CCV') > 5],
        ['Filter loading > 1.0 in. w.c.', pv('AHU-1.FILT-DP') > 1],
      ];
      $('#fdd').innerHTML = rules.map(([t, f]) => `<div class="r"><span>${t}</span><span class="badge ${f ? 'alarm' : 'ok'}"><i></i>${f ? 'Fault' : 'OK'}</span></div>`).join('');

      if (n++ % 3 === 0) {
        ch1.update({ series: [
          { name: 'SAT', color: 'var(--s1)', data: H('AHU-1.SAT') },
          { name: 'SAT setpoint', color: 'var(--s2)', data: H('AHU-1.SAT-SP'), dash: '6 4' },
          { name: 'Mixed air', color: 'var(--s3)', data: H('AHU-1.MAT') }] });
        ch2.update({ series: [
          { name: 'Duct static', color: 'var(--s1)', data: H('AHU-1.DSP') },
          { name: 'Setpoint', color: 'var(--s2)', data: H('AHU-1.DSP-SP'), dash: '6 4' }] });
        const P = wx.P || P_STD, S = sim.plant;
        pc.set([
          { id: 'oa', label: 'OA', t: pv('BLDG.OAT'), w: wFromRH(pv('BLDG.OAT'), pv('BLDG.OA-RH'), P), color: 'var(--s2)' },
          { id: 'ra', label: 'RA', t: pv('AHU-1.RAT'), w: S.wra, color: 'var(--s3)' },
          { id: 'ma', label: 'MA', t: pv('AHU-1.MAT'), w: S.wma, color: 'var(--s4)' },
          { id: 'sa', label: 'SA', t: pv('AHU-1.SAT'), w: S.wsa, color: 'var(--s1)' },
        ], [['oa', 'ma'], ['ra', 'ma'], ['ma', 'sa']]);
      }
    };
    upd();
    return { update: upd };
  },
};
