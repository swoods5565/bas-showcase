import { h, fmt, clamp, $ } from '../util.js';
import { pvBox } from '../app.js';
import { pv, pts } from '../sim.js';
import { lineChart } from '../charts.js';

// Shared layout for both graphic styles (standard here, library in qa-rtu.js)
export const RTU = { cab: [140, 280, 1560, 300], air: [150, 300, 1150, 270], roof: 600, room: [100, 700, 1720, 280], ret: [340, 120], sup: [1150, 120], cond: 1300 };

export function readouts() {
  return `
  ${pvBox('BLDG.OAT', 60, 60, { label: 'OA TEMP', w: 140 })}
  ${pvBox('BLDG.OA-RH', 220, 60, { label: 'OA RH', w: 110 })}
  ${pvBox('RTU-1.OAD', 350, 60, { label: 'OA DAMPER', w: 130 })}
  ${pvBox('RTU-1.ECON-EN', 500, 60, { label: 'ECONOMIZER', w: 150 })}
  ${pvBox('RTU-1.MAT', 670, 60, { label: 'MIXED AIR', w: 130 })}
  ${pvBox('RTU-1.FILT-DP', 820, 60, { label: 'FILTER ΔP', w: 150 })}
  ${pvBox('RTU-1.SF-SS', 1000, 60, { label: 'SF CMD', w: 110 })}
  ${pvBox('RTU-1.SF-STS', 1130, 60, { label: 'SF STATUS', w: 110 })}
  ${pvBox('RTU-1.SF-SPD', 1260, 60, { label: 'SF SPEED', w: 110 })}
  ${pvBox('RTU-1.MODE', 1400, 60, { label: 'UNIT MODE', w: 170 })}
  ${pvBox('RTU-1.HTG-1', 760, 150, { label: 'HEAT STG 1', w: 110 })}
  ${pvBox('RTU-1.HTG-2', 885, 150, { label: 'HEAT STG 2', w: 110 })}
  ${pvBox('RTU-1.CMP-1', 1330, 150, { label: 'COMP 1', w: 110 })}
  ${pvBox('RTU-1.CMP-2', 1455, 150, { label: 'COMP 2', w: 110 })}
  ${pvBox('RTU-1.CF-1', 1580, 150, { label: 'COND FAN 1', w: 110 })}
  ${pvBox('RTU-1.CF-2', 1705, 150, { label: 'COND FAN 2', w: 110 })}
  ${pvBox('RTU-1.RAT', 300, 800, { label: 'RETURN TEMP', w: 150 })}
  ${pvBox('RTU-1.SAT', 960, 800, { label: 'SUPPLY TEMP', w: 150 })}
  ${pvBox('RTU-1.SA-CFM', 960, 880, { label: 'SUPPLY AIRFLOW', w: 170 })}
  ${pvBox('RTU-1.ZN-T', 1300, 930, { label: 'SPACE TEMP', w: 150 })}
  ${pvBox('RTU-1.ZN-HSP', 1470, 930, { label: 'HTG SP', w: 120 })}
  ${pvBox('RTU-1.ZN-CSP', 1610, 930, { label: 'CLG SP', w: 120 })}`;
}

const damper = (id, x, y, n, len) => `<g>${Array.from({ length: n }, (_, i) => `<rect class="blade" data-dmp="${id}" x="${x - 4}" y="${y + i * (len / n) + 4}" width="8" height="${len / n - 8}" rx="3" fill="var(--text-2)"/>`).join('')}<rect x="${x - 14}" y="${y}" width="28" height="${len}" fill="none" stroke="var(--muted)" stroke-dasharray="4 4" rx="4"/></g>`;
const damperH = (id, x, y, n, len) => `<g>${Array.from({ length: n }, (_, i) => `<rect class="blade" data-dmp="${id}" x="${x + i * (len / n) + 4}" y="${y - 4}" width="${len / n - 8}" height="8" rx="3" fill="var(--text-2)"/>`).join('')}<rect x="${x}" y="${y - 14}" width="${len}" height="28" fill="none" stroke="var(--muted)" stroke-dasharray="4 4" rx="4"/></g>`;
const coil = (x, y, w, hh, color, key) => `<g><rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="4" fill="color-mix(in srgb, ${color} 18%, var(--equip))" stroke="${color}" stroke-width="2.5" data-coil="${key}"/>${Array.from({ length: Math.floor(hh / 14) }, (_, i) => `<path d="M${x + 6} ${y + 10 + i * 14} q${(w - 12) / 4} -8 ${(w - 12) / 2} 0 t${(w - 12) / 2} 0" fill="none" stroke="${color}" stroke-width="2" opacity=".7"/>`).join('')}</g>`;
const fan = (cx, cy, r, key) => `<g><circle cx="${cx}" cy="${cy}" r="${r + 14}" fill="var(--equip)" stroke="var(--duct-edge)" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="${r + 22}" class="status-ring" data-ring="${key}"/>
  <g class="rotor" data-rotor="${key}">${[0, 60, 120, 180, 240, 300].map(a => `<path d="M${cx},${cy} q${r * .35},${-r * .55} ${r * .95},${-r * .18} q${-r * .2},${r * .32} ${-r * .95},${r * .18}z" transform="rotate(${a} ${cx} ${cy})" fill="var(--accent)" opacity=".85"/>`).join('')}<circle cx="${cx}" cy="${cy}" r="${r * .22}" fill="var(--panel-solid)" stroke="var(--accent)" stroke-width="3"/></g></g>`;

function graphic() {
  const [ax, ay, aw, ah] = RTU.air;
  return `<svg class="gfx" viewBox="0 0 1920 1080" role="img" aria-label="RTU-1 packaged rooftop unit graphic">
  <defs><linearGradient id="rtuDuct" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--duct)"/><stop offset=".5" stop-color="color-mix(in srgb, var(--duct) 80%, #fff 6%)"/><stop offset="1" stop-color="var(--duct)"/></linearGradient></defs>
  <!-- roof, curb, ducts, room -->
  <rect x="0" y="${RTU.roof}" width="1920" height="26" fill="var(--equip)" opacity=".7"/>
  <rect x="${RTU.ret[0]}" y="580" width="${RTU.ret[1]}" height="120" fill="url(#rtuDuct)" stroke="var(--duct-edge)" stroke-width="2"/>
  <rect x="${RTU.sup[0]}" y="580" width="${RTU.sup[1]}" height="120" fill="url(#rtuDuct)" stroke="var(--duct-edge)" stroke-width="2"/>
  <rect x="${RTU.room[0]}" y="${RTU.room[1]}" width="${RTU.room[2]}" height="${RTU.room[3]}" rx="14" fill="color-mix(in srgb, var(--ok) 6%, transparent)" stroke="var(--line-2)" stroke-width="2"/>
  <rect x="1150" y="700" width="560" height="40" fill="url(#rtuDuct)" stroke="var(--duct-edge)" stroke-width="2"/>
  ${[1320, 1480, 1640].map(x => `<rect x="${x - 40}" y="740" width="80" height="12" rx="3" fill="var(--equip-hi)" stroke="var(--duct-edge)"/>${[-20, 0, 20].map(dx => `<path class="flow" data-flow="dif" d="M${x + dx} 756 L${x + dx * 2.2} 800" stroke="var(--rtu-da, var(--air-sa))" style="stroke-width:3"/>`).join('')}`).join('')}
  <rect x="${RTU.ret[0]}" y="700" width="${RTU.ret[1]}" height="14" fill="var(--equip-hi)" stroke="var(--duct-edge)"/>
  <text x="520" y="790" class="t-lbl">Receiving &amp; Loading Dock</text><text x="520" y="818" class="t-sm">2,400 ft² · single zone · not on the VAV system</text>
  <!-- cabinet -->
  <rect x="${RTU.cab[0]}" y="${RTU.cab[1]}" width="${RTU.cab[2]}" height="${RTU.cab[3]}" rx="12" class="equip"/>
  <rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" rx="8" fill="url(#rtuDuct)" stroke="var(--duct-edge)" stroke-width="2"/>
  <path class="flow" data-flow="oa" d="M100,360 H600" stroke="var(--air-oa)"/>
  <path class="flow" data-flow="ra" d="M400,690 V440 H600" stroke="var(--air-ra)"/>
  <path class="flow" data-flow="sa" d="M600,440 H1210 V700" stroke="var(--air-sa)"/>
  ${damper('OAD', 230, ay + 10, 6, 150)}<text x="230" y="${ay + 186}" text-anchor="middle" class="t-sm">OA damper</text>
  ${damperH('RAD', 345, 560, 4, 110)}<text x="400" y="545" text-anchor="middle" class="t-sm">RA damper</text>
  <rect x="520" y="${ay + 8}" width="40" height="${ah - 16}" fill="none" stroke="var(--muted)" stroke-width="2" rx="3"/><text x="540" y="${ay + ah + 26}" text-anchor="middle" class="t-sm">Filter</text>
  ${coil(630, ay + 10, 56, ah - 20, 'var(--cool)', 'dx')}<text x="658" y="${ay - 8}" text-anchor="middle" class="t-sm">DX coil</text>
  ${coil(760, ay + 10, 56, ah - 20, 'var(--heat)', 'gas')}<text x="788" y="${ay - 8}" text-anchor="middle" class="t-sm">Gas heat</text>
  ${fan(1020, 435, 70, 'sf')}<text x="1020" y="${ay - 8}" text-anchor="middle" class="t-tag">SF</text>
  <!-- condenser section -->
  <rect x="1310" y="300" width="380" height="270" rx="8" fill="var(--panel-solid)" stroke="var(--duct-edge)" stroke-width="2"/>
  ${fan(1410, 380, 36, 'cf1')}${fan(1590, 380, 36, 'cf2')}
  ${[1410, 1590].map((x, i) => `<rect x="${x - 34}" y="470" width="68" height="80" rx="18" class="equip" data-cmp="${i + 1}"/><text x="${x}" y="516" text-anchor="middle" class="t-sm">C${i + 1}</text>`).join('')}
  <text x="1500" y="296" text-anchor="middle" class="t-sm" dy="-8">Condensing section</text>
  <text x="500" y="640" class="t-tag" dy="12">RTU-1 · 8-ton packaged rooftop unit</text>
  ${readouts()}
  <g transform="translate(60,1000)"><rect width="1800" height="56" rx="12" fill="var(--panel-solid)" stroke="var(--line-2)"/><text x="24" y="36" style="font-size:21px;font-weight:600;fill:var(--text-2)" id="rtuBanner">—</text></g>
</svg>`;
}

export function banner() {
  const md = pv('RTU-1.MODE'), on = pv('RTU-1.SF-STS') === 1;
  const occ = ['', 'Occupied', 'Unoccupied', 'Morning warm-up', 'Morning cool-down'][pv('BLDG.OCC-MODE')];
  const stg = md === 4 ? `Cooling · ${pv('RTU-1.CMP-2') ? '2' : '1'} of 2 compressors` : md === 5 ? `Heating · ${pv('RTU-1.HTG-2') ? '2' : '1'} of 2 gas stages` : md === 3 ? 'Economizer free cooling' : md === 2 ? 'Fan only · ventilation' : 'Unit off · cycling on demand';
  return `${occ}  ·  ${stg}  ·  space ${fmt(pv('RTU-1.ZN-T'), 1)} °F  ·  ${on ? fmt(pv('RTU-1.SA-CFM'), 0) + ' cfm' : 'fan off'}`;
}

export default {
  title: () => 'RTU-1',
  mount(view) {
    view.append(h('div.page-head', {},
      h('div', {}, h('div.crumbs', { html: '<a href="#/">Meridian Center</a> › Air Side › RTU-1' }), h('h1', {}, 'RTU-1 · Packaged rooftop unit'),
        h('p', {}, 'Single-zone packaged unit serving the Receiving & Loading Dock wing: two-stage DX cooling, two-stage gas heat, airside economizer and a two-speed supply fan. Stages use hysteresis with a three-minute minimum run time.')),
      h('div.head-actions', {}, h('span.badge', { id: 'rtuB' }))));
    const g = h('div.card.flush.gfx-wrap', { html: graphic() }); view.append(g);
    const svg = g.querySelector('svg');
    const row = h('div.grid.g-3', { style: { marginTop: '16px' } }); view.append(row);
    const stg = h('div.card'); stg.innerHTML = '<div class="card-h"><h3>Staging</h3><span class="sub">live stage calls</span></div><div class="fdd" id="stg"></div>';
    const c1 = h('div.card', { html: '<div class="card-h"><h3>Space temperature</h3><span class="sub">with heating / cooling setpoints</span></div><div></div>' });
    const c2 = h('div.card', { html: '<div class="card-h"><h3>Supply &amp; mixed air</h3><span class="sub">stage steps show in SAT</span></div><div></div>' });
    row.append(stg, c1, c2);
    const H = k => pts.get('RTU-1.' + k).hist.slice(-360);
    const t1 = lineChart(c1.lastChild, { height: 220, series: [], y: { unit: '°F' } });
    const t2 = lineChart(c2.lastChild, { height: 220, series: [], y: { unit: '°F' } });
    let n = 0;
    const upd = () => {
      const on = pv('RTU-1.SF-STS') === 1, spd = pv('RTU-1.SF-SPD');
      const rot = { sf: spd, cf1: pv('RTU-1.CF-1') * 100, cf2: pv('RTU-1.CF-2') * 100 };
      svg.querySelectorAll('[data-rotor]').forEach(r => { const v = rot[r.dataset.rotor]; r.classList.toggle('stopped', !(v > 1)); r.style.setProperty('--dur', clamp(45 / Math.max(v, 1), .3, 3) + 's'); });
      svg.querySelectorAll('[data-ring]').forEach(r => r.setAttribute('class', 'status-ring ' + (rot[r.dataset.ring] > 1 ? 'run' : 'stop')));
      svg.querySelectorAll('[data-dmp="OAD"]').forEach(b => b.style.transform = `rotate(${pv('RTU-1.OAD') / 100 * 78}deg)`);
      svg.querySelectorAll('[data-dmp="RAD"]').forEach(b => b.style.transform = `rotate(${(100 - pv('RTU-1.OAD')) / 100 * 78}deg)`);
      [1, 2].forEach(k => svg.querySelector(`[data-cmp="${k}"]`).style.stroke = pv('RTU-1.CMP-' + k) ? 'var(--cool)' : '');
      svg.querySelector('[data-coil="dx"]').classList.toggle('glow-cool', pv('RTU-1.CMP-1') === 1);
      svg.querySelector('[data-coil="gas"]').classList.toggle('glow-heat', pv('RTU-1.HTG-1') === 1);
      const dur = clamp(60 / Math.max(spd, 5), .4, 4) + 's';
      svg.querySelectorAll('.flow').forEach(f => { const k = f.dataset.flow; const v = on && (k !== 'oa' || pv('RTU-1.OAD') > 2); f.classList.toggle('stopped', !v); f.style.setProperty('--dur', dur); });
      svg.style.setProperty('--rtu-da', pv('RTU-1.HTG-1') ? 'var(--heat)' : 'var(--air-sa)');
      $('#rtuBanner', svg).textContent = banner();
      const b = $('#rtuB'); b.className = 'badge ' + (pv('RTU-1.HTG-1') ? 'heat' : pv('RTU-1.CMP-1') ? 'cool' : on ? 'ok' : 'off'); b.innerHTML = `<i></i>${pts.get('RTU-1.MODE').states[pv('RTU-1.MODE')]}`;
      const rows = [['Supply fan', on, spd > 80 ? 'High speed' : on ? 'Low speed' : 'Off'], ['Economizer', pv('RTU-1.ECON-EN') === 1, `OA damper ${fmt(pv('RTU-1.OAD'), 0)} %`], ['Compressor 1', pv('RTU-1.CMP-1') === 1], ['Compressor 2', pv('RTU-1.CMP-2') === 1], ['Gas heat stage 1', pv('RTU-1.HTG-1') === 1], ['Gas heat stage 2', pv('RTU-1.HTG-2') === 1]];
      $('#stg', stg).innerHTML = rows.map(([t, v, x]) => `<div class="r"><span>${t}${x ? ` <span class="faint">· ${x}</span>` : ''}</span><span class="badge ${v ? 'ok' : 'off'}"><i></i>${v ? 'On' : 'Off'}</span></div>`).join('');
      if (n++ % 3 === 0) {
        t1.update({ series: [{ name: 'Space', color: 'var(--s1)', data: H('ZN-T') }, { name: 'Cooling SP', color: 'var(--s2)', data: H('ZN-CSP'), dash: '6 4' }, { name: 'Heating SP', color: 'var(--s3)', data: H('ZN-HSP'), dash: '6 4' }] });
        t2.update({ series: [{ name: 'Supply', color: 'var(--s1)', data: H('SAT') }, { name: 'Mixed', color: 'var(--s4)', data: H('MAT') }] });
      }
    };
    upd();
    return { update: upd };
  },
};
