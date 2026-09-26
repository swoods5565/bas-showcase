import { h, fmt, clamp, $ } from '../util.js';
import { pvBox } from '../app.js';
import { pv, pts } from '../sim.js';
import { lineChart, gauge } from '../charts.js';

const pipe = (d, color, key, w = 16) => `<path class="pipe" d="${d}" stroke="${color}" style="stroke-width:${w}" opacity=".85"/><path class="pipe-core" data-p="${key}" d="${d}"/>`;
const pump = (x, y, key, tag) => `<g transform="translate(${x} ${y})"><circle r="34" fill="var(--equip)" stroke="var(--duct-edge)" stroke-width="3"/><circle r="40" class="status-ring" data-ring="${key}"/><g class="rotor" data-rot="${key}">${[0, 90, 180, 270].map(a => `<path d="M0 0 L22 -6 L22 6Z" transform="rotate(${a})" fill="var(--accent)"/>`).join('')}</g><text y="-50" text-anchor="middle" class="t-tag" style="font-size:16px">${tag}</text></g>`;
const chiller = (x, y, n) => `<g transform="translate(${x} ${y})">
  <rect x="0" y="0" width="400" height="64" rx="32" fill="color-mix(in srgb, var(--cw) 22%, var(--equip))" stroke="var(--cw)" stroke-width="2.5"/>
  <rect x="0" y="86" width="400" height="64" rx="32" fill="color-mix(in srgb, var(--chw) 22%, var(--equip))" stroke="var(--chw)" stroke-width="2.5"/>
  <rect x="150" y="56" width="100" height="38" rx="6" class="equip"/><circle cx="200" cy="75" r="12" fill="none" stroke="var(--accent)" stroke-width="3" class="rotor" data-rot="ch${n}" style="stroke-dasharray:10 8"/>
  <text x="22" y="40" class="t-tag" style="font-size:19px">CH-${n}</text><text x="92" y="40" class="t-sm">Condenser</text><text x="22" y="126" class="t-sm">Evaporator · 125-ton centrifugal</text>
  <rect x="-6" y="-6" width="412" height="162" rx="38" fill="none" class="status-ring" data-ring="ch${n}" style="stroke-width:3"/></g>`;
const tower = (x, n) => `<g transform="translate(${x} 90)">
  <path d="M0 40 L20 210 H200 L220 40 Z" fill="color-mix(in srgb, var(--cw) 16%, var(--equip))" stroke="var(--duct-edge)" stroke-width="2.5"/>
  ${Array.from({ length: 7 }, (_, i) => `<line x1="${24 + i * 6}" y1="${70 + i * 18}" x2="${196 - i * 6}" y2="${70 + i * 18}" stroke="var(--cw)" opacity=".35"/>`).join('')}
  <g data-rain="${n}">${Array.from({ length: 12 }, (_, i) => `<line x1="${34 + i * 13}" y1="70" x2="${34 + i * 13}" y2="84" stroke="var(--cw)" stroke-width="2" stroke-linecap="round"><animate attributeName="y1" values="70;190" dur="${.9 + (i % 4) * .15}s" repeatCount="indefinite"/><animate attributeName="y2" values="80;200" dur="${.9 + (i % 4) * .15}s" repeatCount="indefinite"/></line>`).join('')}</g>
  <rect x="-6" y="20" width="232" height="24" rx="6" class="equip"/>
  <ellipse cx="110" cy="20" rx="70" ry="16" fill="var(--panel-solid)" stroke="var(--duct-edge)" stroke-width="2"/>
  <g transform="translate(110 20) scale(1 .23)"><g class="rotor" data-rot="ct${n}">${[0, 60, 120, 180, 240, 300].map(a => `<path d="M0 0 L62 -10 L62 10Z" transform="rotate(${a})" fill="var(--accent)" opacity=".85"/>`).join('')}</g></g>
  <text x="110" y="-10" text-anchor="middle" class="t-tag">CT-${n}</text>
  <rect x="10" y="210" width="200" height="22" rx="4" fill="color-mix(in srgb, var(--cw) 30%, var(--equip))" stroke="var(--duct-edge)"/></g>`;

function graphic() {
  return `<svg class="gfx" viewBox="0 0 1920 1080" role="img" aria-label="Chilled water plant graphic">
  <!-- condenser water -->
  ${pipe('M230 322 V380 H560 M510 322 V380', 'var(--cw)', 'cws')}
  ${pipe('M560 380 V750 M560 510 H700 M560 750 H700', 'var(--cw)', 'cws2')}
  ${pipe('M1100 462 H1170 V40 H230 V110 M510 40 V110 M1100 702 H1170 V462', 'color-mix(in srgb, var(--cw) 60%, var(--heat))', 'cwr')}
  <!-- chilled water -->
  ${pipe('M1100 548 H1330 M1100 788 H1330 M1330 800 V430 H1620', 'var(--chw)', 'chws')}
  ${pipe('M1760 640 V930 H650 V788 H700 M650 788 V548 H700', 'var(--chw-r)', 'chwr')}
  ${pipe('M1480 430 V930', 'var(--chw-r)', 'byp', 10)}
  <g transform="translate(1480 690)"><path d="M-14,-18 L14,18 L-14,18 L14,-18Z" fill="var(--panel-solid)" stroke="var(--chw)" stroke-width="2.5"/></g>
  <text x="1500" y="700" class="t-sm">Min-flow bypass</text>
  ${tower(120, 1)}${tower(400, 2)}
  ${pump(620, 510, 'cwp1', 'CWP-1')}${pump(620, 750, 'cwp2', 'CWP-2')}
  ${chiller(700, 400, 1)}${chiller(700, 640, 2)}
  ${pump(1240, 548, 'chwp1', 'CHWP-1')}${pump(1240, 788, 'chwp2', 'CHWP-2')}
  <!-- load -->
  <g transform="translate(1620 380)"><rect width="240" height="260" rx="14" class="equip"/><text x="120" y="36" text-anchor="middle" class="t-tag">Building load</text><text x="120" y="60" text-anchor="middle" class="t-sm">AHU-1 coil + misc.</text></g>
  ${pvBox('CHW.TONS', 1640, 470, { label: 'PLANT LOAD', w: 200 })}
  ${pvBox('CHW.KW-TON', 1640, 560, { label: 'PLANT kW/TON', w: 200 })}
  <text x="760" y="1000" class="t-sm" data-legend>—</text>
  <!-- readouts -->
  ${pvBox('CHW.CT-1-SPD', 120, 370, { label: 'CT-1 FAN', w: 110 })}${pvBox('CHW.CT-2-SPD', 400, 440, { label: 'CT-2 FAN', w: 110 })}
  ${pvBox('BLDG.OA-WB', 1340, 60, { label: 'OA WET BULB', w: 150 })}
  ${pvBox('CHW.MU-GPM', 1510, 60, { label: 'TOWER MAKEUP', w: 160 })}
  ${pvBox('CHW.CWST', 700, 170, { label: 'CW SUPPLY', w: 140 })}
  ${pvBox('CHW.CWST-SP', 860, 170, { label: 'CWS SETPOINT', w: 150 })}
  ${pvBox('CHW.CWRT', 1030, 170, { label: 'CW RETURN', w: 120 })}
  ${pvBox('CHW.CW-GPM', 700, 260, { label: 'CW FLOW', w: 140 })}
  ${pvBox('CHW.CH-1-SS', 740, 580, { label: 'CH-1 ENABLE', w: 100 })}${pvBox('CHW.CH-1-PLR', 850, 580, { label: '% LOAD', w: 100 })}${pvBox('CHW.CH-1-KW', 960, 580, { label: 'POWER', w: 130 })}
  ${pvBox('CHW.CH-2-SS', 740, 820, { label: 'CH-2 ENABLE', w: 100 })}${pvBox('CHW.CH-2-PLR', 850, 820, { label: '% LOAD', w: 100 })}${pvBox('CHW.CH-2-KW', 960, 820, { label: 'POWER', w: 130 })}
  ${pvBox('CHW.CHWP-1-SPD', 1190, 610, { label: 'CHWP-1', w: 100 })}${pvBox('CHW.CHWP-2-SPD', 1190, 850, { label: 'CHWP-2', w: 100 })}
  ${pvBox('CHW.CHWST', 1350, 310, { label: 'CHW SUPPLY', w: 130 })}
  ${pvBox('CHW.CHWST-SP', 1350, 220, { label: 'CHWS SETPOINT', w: 150 })}
  ${pvBox('CHW.CHW-GPM', 1500, 310, { label: 'CHW FLOW', w: 110 })}
  ${pvBox('CHW.CHW-DP', 1620, 220, { label: 'LOOP ΔP', w: 120 })}
  ${pvBox('CHW.CHWRT', 1560, 975, { label: 'CHW RETURN', w: 140 })}
  ${pvBox('CHW.CHW-DT', 1720, 975, { label: 'CHW ΔT', w: 140 })}
  <g transform="translate(60,1000)"><rect width="640" height="56" rx="12" fill="var(--panel-solid)" stroke="var(--line-2)"/><text x="20" y="36" style="font-size:21px;font-weight:600;fill:var(--text-2)" data-banner>—</text></g>
</svg>`;
}

export default {
  title: () => 'Chilled Water Plant',
  mount(view) {
    view.append(h('div.page-head', {},
      h('div', {}, h('div.crumbs', { html: '<a href="#/">Meridian Tower</a> › Water Side › Chilled water' }), h('h1', {}, 'Chilled-water plant'),
        h('p', {}, 'Variable-primary plant: two 125-ton water-cooled centrifugal chillers, VFD primary pumps, two induced-draft towers. Lead/lag staging on load, CHWS reset on plant load, condenser-water setpoint = wet bulb + 7 °F approach (65 °F floor).')),
      h('div.head-actions', {}, h('span.badge', { id: 'plantB' }))));
    const g = h('div.card.flush.gfx-wrap', { html: graphic() }); view.append(g);
    const svg = g.querySelector('svg');
    const row = h('div.grid.g-4', { style: { marginTop: '16px' } }); view.append(row);
    const ga = h('div.card'), gb = h('div.card'), gc = h('div.card'), gd = h('div.card'); row.append(ga, gb, gc, gd);
    const row2 = h('div.grid.g-2', { style: { marginTop: '16px' } }); view.append(row2);
    const c1 = h('div.card', { html: '<div class="card-h"><h3>Chilled-water temperatures</h3><span class="sub">supply · return · setpoint</span></div><div></div>' });
    const c2 = h('div.card', { html: '<div class="card-h"><h3>Plant load</h3><span class="sub">tons of refrigeration</span></div><div></div>' });
    row2.append(c1, c2);
    const t1 = lineChart(c1.lastChild, { height: 220, series: [], y: { unit: '°F' } });
    const t2 = lineChart(c2.lastChild, { height: 220, series: [], y: { unit: 'tons' }, zero: true });
    const H = k => pts.get('CHW.' + k).hist.slice(-360);
    view.append(h('p.note', { style: { marginTop: '12px' }, html: 'Plant efficiency bands follow the widely-cited ASHRAE Journal ranges for all-variable-speed plants (chillers + pumps + towers): &lt; 0.75 excellent, 0.75–0.90 good, 0.90–1.0 fair, &gt; 1.0 needs improvement.' }));
    let n = 0;
    const upd = () => {
      const en = pv('CHW.PLANT-EN') === 1, tons = pv('CHW.TONS');
      const map = { cwp1: pv('CHW.CWP-1-SS') * 100, cwp2: pv('CHW.CWP-2-SS') * 100, chwp1: pv('CHW.CHWP-1-SPD'), chwp2: pv('CHW.CHWP-2-SPD'), ct1: pv('CHW.CT-1-SPD'), ct2: pv('CHW.CT-2-SPD'), ch1: pv('CHW.CH-1-STS') * 100, ch2: pv('CHW.CH-2-STS') * 100 };
      svg.querySelectorAll('[data-rot]').forEach(r => { const v = map[r.dataset.rot]; r.classList.toggle('stopped', !(v > 1)); r.style.setProperty('--dur', clamp(50 / Math.max(v, 1), .3, 3) + 's'); });
      svg.querySelectorAll('[data-ring]').forEach(r => r.setAttribute('class', 'status-ring ' + (map[r.dataset.ring] > 1 ? 'run' : 'stop')));
      svg.querySelectorAll('[data-rain]').forEach(r => r.style.display = map['ct' + r.dataset.rain] > 1 || (en && map['cwp' + r.dataset.rain] > 1) ? '' : 'none');
      const flowOn = { cws: en, cws2: en, cwr: en, chws: en, chwr: en, byp: en && pv('CHW.CHW-GPM') < 240 };
      const dur = clamp(700 / Math.max(pv('CHW.CHW-GPM'), 50), .35, 3) + 's';
      svg.querySelectorAll('[data-p]').forEach(p => { p.classList.toggle('stopped', !flowOn[p.dataset.p]); p.style.setProperty('--dur', dur); });
      const approach = pv('CHW.CWST') - pv('BLDG.OA-WB'), lift = pv('CHW.CWRT') - pv('CHW.CHWST');
      svg.querySelector('[data-banner]').textContent = en ? `${pv('CHW.CH-2-STS') ? 'Lead + lag' : 'Lead chiller'} · ${fmt(tons, 0)} tons · approach ${fmt(approach, 1)} °F · lift ${fmt(lift, 0)} °F` : `Plant disabled — OA ${fmt(pv('BLDG.OAT'), 0)} °F (lockout < 50 °F, economizer)`;
      const b = $('#plantB'); b.className = 'badge ' + (en ? 'ok' : 'off'); b.innerHTML = `<i></i>${en ? 'Plant enabled' : 'Plant disabled'}`;
      const kwt = pv('CHW.KW-TON');
      ga.innerHTML = gauge({ value: en ? kwt : 0, min: .4, max: 1.2, dec: 2, unit: 'kW/ton', label: 'Plant efficiency', color: kwt < .75 ? 'var(--ok)' : kwt < .9 ? 'var(--warn)' : 'var(--alarm)', bands: [{ from: .4, to: .75, color: 'var(--ok)' }, { from: .75, to: .9, color: 'var(--warn)' }, { from: .9, to: 1.2, color: 'var(--alarm)' }] });
      gb.innerHTML = gauge({ value: pv('CHW.CHW-DT'), min: 0, max: 18, dec: 1, unit: '°F', label: 'CHW ΔT (design 12–14)', color: pv('CHW.CHW-DT') < 8 && en ? 'var(--alarm)' : 'var(--cool)', target: 13.5 });
      gc.innerHTML = gauge({ value: en ? approach : 0, min: 0, max: 15, dec: 1, unit: '°F', label: 'Tower approach', color: 'var(--cw)', target: 7 });
      gd.innerHTML = gauge({ value: tons, min: 0, max: 250, dec: 0, unit: 'tons', label: 'Load · 250-ton capacity', color: 'var(--chw)', target: 112 });
      if (n++ % 3 === 0) {
        t1.update({ series: [{ name: 'CHWS', color: 'var(--s1)', data: H('CHWST') }, { name: 'CHWR', color: 'var(--s2)', data: H('CHWRT') }, { name: 'Setpoint', color: 'var(--s3)', data: H('CHWST-SP'), dash: '6 4' }] });
        t2.update({ series: [{ name: 'Load', color: 'var(--s1)', data: H('TONS'), area: true }], hlines: [{ y: 112, label: 'Stage-up (90 % of lead)' }] });
      }
    };
    upd();
    return { update: upd };
  },
};
