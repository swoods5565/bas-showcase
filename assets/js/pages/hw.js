import { h, fmt, clamp, $ } from '../util.js';
import { pvBox } from '../app.js';
import { pv, pts } from '../sim.js';
import { lineChart, gauge } from '../charts.js';

const pipe = (d, color, key, w = 16) => `<path class="pipe" d="${d}" stroke="${color}" style="stroke-width:${w}" opacity=".85"/><path class="pipe-core" data-p="${key}" d="${d}"/>`;
const pump = (x, y, key, tag) => `<g transform="translate(${x} ${y})"><circle r="34" fill="var(--equip)" stroke="var(--duct-edge)" stroke-width="3"/><circle r="40" class="status-ring" data-ring="${key}"/><g class="rotor" data-rot="${key}">${[0, 90, 180, 270].map(a => `<path d="M0 0 L22 -6 L22 6Z" transform="rotate(${a})" fill="var(--accent)"/>`).join('')}</g><text y="-50" text-anchor="middle" class="t-tag" style="font-size:16px">${tag}</text></g>`;
const boiler = (x, n) => `<g transform="translate(${x} 360)">
  <rect x="60" y="-250" width="36" height="250" fill="var(--equip)" stroke="var(--duct-edge)" stroke-width="2"/>
  <g data-plume="${n}" opacity=".5">${[0, 1, 2].map(i => `<circle cx="78" cy="-270" r="${10 + i * 6}" fill="var(--muted)" opacity=".25"><animate attributeName="cy" values="-260;-330" dur="${2.4 + i * .6}s" repeatCount="indefinite" begin="${i * .7}s"/><animate attributeName="opacity" values=".35;0" dur="${2.4 + i * .6}s" repeatCount="indefinite" begin="${i * .7}s"/></circle>`).join('')}</g>
  <rect x="0" y="0" width="220" height="330" rx="16" class="equip"/>
  <rect x="-6" y="-6" width="232" height="342" rx="20" class="status-ring" data-ring="b${n}" style="stroke-width:3"/>
  <rect x="40" y="150" width="140" height="110" rx="10" fill="#1d2129" stroke="var(--duct-edge)" stroke-width="2"/>
  <g data-flame="${n}" class="flame">${[0, 1, 2, 3].map(i => `<path d="M${62 + i * 32} 252 q-14 -30 0 -${56 + (i % 2) * 16} q14 30 0 ${56 + (i % 2) * 16}z" fill="url(#flameG)"/>`).join('')}</g>
  <text x="110" y="-24" text-anchor="middle" class="t-tag">B-${n}</text>
  <text x="110" y="48" text-anchor="middle" class="t-sm">1,500 MBH condensing</text>
  <text x="110" y="72" text-anchor="middle" class="t-sm">5:1 turndown</text></g>`;

function graphic() {
  return `<svg class="gfx" viewBox="0 0 1920 1080" role="img" aria-label="Heating hot water plant graphic">
  <defs><linearGradient id="flameG" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#5E81AC"/><stop offset=".35" stop-color="#EBCB8B"/><stop offset="1" stop-color="#D08770" stop-opacity=".2"/></linearGradient></defs>
  ${pipe('M410 360 V300 H1020 M730 360 V300', 'var(--hw)', 'hws')}
  ${pipe('M1020 300 V540 M1020 300 H1500 M1020 540 H1080 V300', 'var(--hw)', 'hws2')}
  ${pipe('M1700 560 V830 H410 V690 M730 830 V690', 'var(--hw-r)', 'hwr')}
  ${pipe('M160 780 H300 M300 780 V650 H360 M300 780 H640 V650 H680', 'var(--gas)', 'gas', 8)}
  <g transform="translate(160 780)"><rect x="-50" y="-26" width="70" height="52" rx="8" class="equip"/><text x="-15" y="6" text-anchor="middle" style="font-size:14px;font-weight:700;fill:var(--gas)">GAS</text></g>
  <text x="60" y="850" class="t-sm">Natural gas service</text>
  ${boiler(300, 1)}${boiler(620, 2)}
  ${pump(1020, 300, 'hwp1', 'HWP-1')}${pump(1020, 540, 'hwp2', 'HWP-2')}
  <g transform="translate(1500 240)"><rect width="340" height="320" rx="14" class="equip"/><text x="170" y="40" text-anchor="middle" class="t-tag">Heating loads</text><text x="170" y="66" text-anchor="middle" class="t-sm">40 VAV reheat coils · AHU-1 preheat</text></g>
  ${pvBox('HW.MBH', 1530, 360, { label: 'PLANT LOAD', w: 280 })}
  ${pvBox('HW.HW-GPM', 1530, 450, { label: 'HW FLOW', w: 280 })}
  ${pvBox('BLDG.OAT', 1530, 90, { label: 'OUTDOOR AIR', w: 150 })}
  ${pvBox('HW.HWST-SP', 1300, 90, { label: 'HWS SETPOINT (OA RESET)', w: 200 })}
  ${pvBox('HW.HWST', 1150, 180, { label: 'HW SUPPLY', w: 140 })}
  ${pvBox('HW.HWRT', 1150, 870, { label: 'HW RETURN', w: 140 })}
  ${pvBox('HW.GAS-CFH', 60, 900, { label: 'GAS FLOW', w: 150 })}
  ${pvBox('HW.B-1-SS', 300, 880, { label: 'B-1 ENABLE', w: 100 })}${pvBox('HW.B-1-FIRE', 410, 880, { label: 'FIRING', w: 110 })}
  ${pvBox('HW.B-2-SS', 620, 880, { label: 'B-2 ENABLE', w: 100 })}${pvBox('HW.B-2-FIRE', 730, 880, { label: 'FIRING', w: 110 })}
  ${pvBox('HW.B-1-EFF', 300, 970, { label: 'B-1 EFFICIENCY', w: 160 })}${pvBox('HW.B-2-EFF', 620, 970, { label: 'B-2 EFFICIENCY', w: 160 })}
  ${pvBox('HW.HWP-1-SPD', 1100, 360, { label: 'HWP-1', w: 100 })}${pvBox('HW.HWP-2-SPD', 1100, 600, { label: 'HWP-2', w: 100 })}
  <g transform="translate(1150,990)"><rect width="700" height="56" rx="12" fill="var(--panel-solid)" stroke="var(--line-2)"/><text x="20" y="36" style="font-size:21px;font-weight:600;fill:var(--text-2)" data-banner>—</text></g>
</svg>`;
}

export default {
  title: () => 'Heating Hot Water',
  mount(view) {
    view.append(h('div.page-head', {},
      h('div', {}, h('div.crumbs', { html: '<a href="#/">Meridian Tower</a> › Water Side › Heating hot water' }), h('h1', {}, 'Heating hot-water plant'),
        h('p', {}, 'Two 1,500 MBH condensing boilers, variable-primary pumping. Supply temperature resets from 160 °F at 10 °F OA to 120 °F at 60 °F OA — low return water keeps the boilers condensing (efficiency climbs as return temperature drops below the ~130 °F flue-gas dew point).')),
      h('div.head-actions', {}, h('span.badge', { id: 'hwB' }))));
    const g = h('div.card.flush.gfx-wrap', { html: graphic() }); view.append(g);
    const svg = g.querySelector('svg');
    const row = h('div.grid.g-3', { style: { marginTop: '16px' } }); view.append(row);
    const c1 = h('div.card', { html: '<div class="card-h"><h3>Outdoor-air reset schedule</h3><span class="sub">HWS setpoint vs OAT</span></div><div></div>' });
    const c2 = h('div.card', { html: '<div class="card-h"><h3>Condensing efficiency curve</h3><span class="sub">thermal efficiency vs return water</span></div><div></div>' });
    const c3 = h('div.card'); row.append(c1, c2, c3);
    const reset = []; for (let t = -10; t <= 70; t += 2) reset.push([t, clamp(160 - (t - 10) * .8, 120, 160)]);
    const effc = []; for (let r = 80; r <= 180; r += 2) effc.push([r, clamp(98.5 - .26 * (r - 80), 85.5, 96)]);
    const ch1 = lineChart(c1.lastChild, { height: 220, x: { time: false, fmt: v => fmt(v, 0) + '°' }, y: { unit: '°F', min: 110, max: 170 }, series: [{ name: 'HWS setpoint', color: 'var(--s2)', data: reset }] });
    const ch2 = lineChart(c2.lastChild, { height: 220, x: { time: false, fmt: v => fmt(v, 0) + '°' }, y: { unit: '%', min: 84, max: 100, fmt: v => fmt(v, 0) }, series: [{ name: 'Efficiency', color: 'var(--s1)', data: effc }], bands: [{ x0: 80, x1: 130, label: 'Condensing', color: 'color-mix(in srgb, var(--ok) 25%, transparent)' }] });
    const row2 = h('div.grid.g-2', { style: { marginTop: '16px' } }); view.append(row2);
    const c4 = h('div.card', { html: '<div class="card-h"><h3>HW temperatures</h3><span class="sub">supply · return · setpoint</span></div><div></div>' });
    const c5 = h('div.card', { html: '<div class="card-h"><h3>Heating load</h3><span class="sub">MBH delivered</span></div><div></div>' });
    row2.append(c4, c5);
    const t4 = lineChart(c4.lastChild, { height: 220, series: [], y: { unit: '°F' } });
    const t5 = lineChart(c5.lastChild, { height: 220, series: [], y: { unit: 'MBH' }, zero: true });
    const H = k => pts.get('HW.' + k).hist.slice(-360);
    let n = 0;
    const upd = () => {
      const en = pv('HW.PLANT-EN') === 1;
      const map = { hwp1: pv('HW.HWP-1-SPD'), hwp2: pv('HW.HWP-2-SPD'), b1: pv('HW.B-1-FIRE'), b2: pv('HW.B-2-FIRE') };
      svg.querySelectorAll('[data-rot]').forEach(r => { const v = map[r.dataset.rot]; r.classList.toggle('stopped', !(v > 1)); r.style.setProperty('--dur', clamp(50 / Math.max(v, 1), .3, 3) + 's'); });
      svg.querySelectorAll('[data-ring]').forEach(r => r.setAttribute('class', 'status-ring ' + (map[r.dataset.ring] > 1 ? 'run' : 'stop')));
      [1, 2].forEach(k => { const f = map['b' + k]; const fl = svg.querySelector(`[data-flame="${k}"]`); fl.classList.toggle('off', f < 1); fl.style.opacity = .4 + f / 160; svg.querySelector(`[data-plume="${k}"]`).style.display = f > 1 ? '' : 'none'; });
      svg.querySelectorAll('[data-p]').forEach(p => { const on = p.dataset.p === 'gas' ? map.b1 > 1 : en; p.classList.toggle('stopped', !on); p.style.setProperty('--dur', clamp(300 / Math.max(pv('HW.HW-GPM'), 20), .4, 3) + 's'); });
      const eff = pv('HW.B-1-EFF');
      svg.querySelector('[data-banner]').textContent = en ? `${pv('HW.B-2-SS') ? 'Lead + lag' : 'Lead boiler'} · ${fmt(pv('HW.MBH'), 0)} MBH · ΔT ${fmt(pv('HW.HWST') - pv('HW.HWRT'), 1)} °F · ${pv('HW.HWRT') < 130 ? 'condensing' : 'non-condensing'}` : `Plant off — OA lockout above 65 °F (no reheat requests)`;
      const b = $('#hwB'); b.className = 'badge ' + (en ? 'heat' : 'off'); b.innerHTML = `<i></i>${en ? 'Plant enabled' : 'Plant disabled'}`;
      if (n++ % 3 === 0) {
        ch1.update({ markers: [{ x: clamp(pv('BLDG.OAT'), -10, 70), y: pv('HW.HWST-SP'), color: 'var(--text)', label: `Now ${fmt(pv('HW.HWST-SP'), 0)} °F` }] });
        ch2.update({ markers: en ? [{ x: clamp(pv('HW.HWRT'), 80, 180), y: eff, color: 'var(--text)', label: `${fmt(eff, 1)} % @ ${fmt(pv('HW.HWRT'), 0)} °F RWT` }] : [] });
        c3.innerHTML = `<div class="card-h"><h3>Gas & firing</h3><span class="sub">live</span></div>` + gauge({ value: pv('HW.B-1-FIRE'), min: 0, max: 100, unit: '% firing', label: 'Lead boiler firing', color: 'var(--heat)' }) +
          `<div class="pt-list" style="margin-top:8px"><div class="row-pt"><span class="n">Gas input</span><span class="mono">${fmt(pv('HW.GAS-CFH'), 0)} CFH ≈ ${fmt(pv('HW.GAS-CFH') * 1.03 / 100, 2)} therm/h</span></div><div class="row-pt"><span class="n">Emissions (EPA 0.0053 t CO₂/therm)</span><span class="mono">${fmt(pv('HW.GAS-CFH') * 1.03 / 100 * 5.3, 1)} kg CO₂/h</span></div></div>`;
        t4.update({ series: [{ name: 'HWS', color: 'var(--s2)', data: H('HWST') }, { name: 'HWR', color: 'var(--s1)', data: H('HWRT') }, { name: 'Setpoint', color: 'var(--s3)', data: H('HWST-SP'), dash: '6 4' }] });
        t5.update({ series: [{ name: 'Load', color: 'var(--s2)', data: H('MBH'), area: true }] });
      }
    };
    upd();
    return { update: upd };
  },
};
