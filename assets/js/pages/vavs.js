import { h, fmt, $, $$, rampColor, clamp } from '../util.js';
import { pv, sim, pts, isOverridden } from '../sim.js';
import { ZONES, FLOORS, BUILDING } from '../building.js';
import { planSVG, recolorPlan } from '../plans.js';
const tcol = z => rampColor(HEAT.temp.stops, (pv(z.id + '.ZN-T') - HEAT.temp.min) / (HEAT.temp.max - HEAT.temp.min));
const tlab = z => fmt(pv(z.id + '.ZN-T'), 0) + '°';
import { HEAT } from '../dollhouse.js';

const COLS = [
  ['id', 'VAV', z => z.id], ['name', 'Zone', z => z.name], ['floor', 'Lvl', z => z.floor, 1],
  ['t', 'Space °F', z => pv(z.id + '.ZN-T'), 1], ['sp', 'Htg / Clg SP', z => pv(z.id + '.ZN-CSP'), 1],
  ['cfm', 'Airflow', z => pv(z.id + '.CFM'), 1], ['csp', 'Flow SP', z => pv(z.id + '.CFM-SP'), 1], ['pct', '% of max', z => pv(z.id + '.CFM') / pv(z.id + '.CFM-MAX'), 1],
  ['dmp', 'Damper', z => pv(z.id + '.DMPR'), 1], ['hwv', 'Reheat', z => pv(z.id + '.HWV'), 1], ['dat', 'DAT °F', z => pv(z.id + '.DAT'), 1],
  ['co2', 'CO₂', z => pv(z.id + '.CO2'), 1], ['md', 'State', z => pv(z.id + '.MODE'), 1], ['al', 'Status', z => alarmsOf(z).length, 1],
];
const alarmsOf = z => ['ZN-T', 'CFM', 'CO2'].filter(k => sim.alarms.get(z.id + '.' + k)?.state === 'Active');

export default {
  title: () => 'VAV Summary',
  mount(view) {
    view.append(h('div.page-head', {},
      h('div', {}, h('div.crumbs', { html: '<a href="#/">Meridian Center</a> › Air Side › VAV summary' }), h('h1', {}, 'VAV summary'),
        h('p', {}, `All ${ZONES.length} terminal units served by AHU-1. Sort any column, filter by level, and click a row to open the unit graphic. The key plans show every zone’s temperature, and the ranking highlights “rogue zones” that drive the supply-air and static-pressure resets.`))));
    const kp = h('div.grid.g-4'); view.append(kp);
    const mk = (l) => { const c = h('div.card', { html: `<div class="kpi"><div class="lbl">${l}</div><div class="val">--</div><div class="foot"></div></div>` }); kp.append(c); return c; };
    const k1 = mk('Zones in comfort band'), k2 = mk('Average space temp'), k3 = mk('Total VAV airflow'), k4 = mk('Reset requests (clg / static)');

    const row = h('div.grid.g-main', { style: { marginTop: '16px' } }); view.append(row);
    const tc = h('div.card'); const mat = h('div.card'); row.append(tc, mat);
    let floor = 0, sortK = 'id', dir = 1, q = '';
    const seg = h('div.seg', {}, ...['All', ...FLOORS.map(F => 'L' + F.n)].map((l, i) => h('button' + (i === 0 ? '.on' : ''), { onclick: (e) => { floor = i; $$('button', seg).forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); render(); } }, l)));
    const search = h('input.field', { placeholder: 'Filter zones…', style: { maxWidth: '200px' }, oninput: e => { q = e.target.value.toLowerCase(); render(); } });
    tc.append(h('div.card-h', {}, h('h3', {}, 'Terminal units'), h('div.row', {}, search, seg)));
    const wrap = h('div.tbl-wrap', { style: { maxHeight: '640px' } }); tc.append(wrap);
    const table = h('table.tbl'); wrap.append(table);
    table.innerHTML = `<thead><tr>${COLS.map(([k, l, , num]) => `<th data-k="${k}" class="${num ? 'num' : ''}">${l}</th>`).join('')}</tr></thead><tbody></tbody>`;
    $$('th', table).forEach(th => th.onclick = () => { const k = th.dataset.k; dir = sortK === k ? -dir : 1; sortK = k; render(); });

    mat.innerHTML = `<div class="card-h"><h3>Key plans</h3><span class="sub">space temp · click a zone</span></div><div id="mx">${FLOORS.slice().reverse().map(F => `<div class="sec-t">${F.name}</div>${planSVG(F.n, { color: tcol, label: tlab, opacity: .55 })}`).join('')}</div>
      <div class="dh-scale" style="margin-top:10px;min-width:0"><div class="ramp" style="background:linear-gradient(90deg,${HEAT.temp.stops.join(',')})"></div><div class="ticks"><span>64</span><span>73</span><span>82 °F</span></div></div>
      <div class="card-h" style="margin-top:18px"><h3>Top request generators</h3><span class="sub">G36 “rogue zone” review</span></div><div id="rogue" class="pt-list"></div>`;

    function render() {
      const col = COLS.find(c => c[0] === sortK);
      const list = ZONES.filter(z => (!floor || z.floor === floor) && (!q || (z.id + z.name).toLowerCase().includes(q)))
        .sort((a, b) => { const va = col[2](a), vb = col[2](b); return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * dir; });
      $$('th', table).forEach(th => th.textContent = COLS.find(c => c[0] === th.dataset.k)[1] + (th.dataset.k === sortK ? (dir > 0 ? ' ▲' : ' ▼') : ''));
      table.tBodies[0].innerHTML = list.map(z => {
        const t = pv(z.id + '.ZN-T'), csp = pv(z.id + '.ZN-CSP'), hsp = pv(z.id + '.ZN-HSP'), pct = clamp(pv(z.id + '.CFM') / pv(z.id + '.CFM-MAX') * 100, 0, 130);
        const al = alarmsOf(z), md = pv(z.id + '.MODE'), ov = ['ZN-CSP', 'ZN-HSP', 'CFM-SP', 'DMPR', 'HWV'].some(k => isOverridden(pts.get(z.id + '.' + k)));
        const tc = rampColor(HEAT.temp.stops, (t - HEAT.temp.min) / (HEAT.temp.max - HEAT.temp.min));
        return `<tr class="clickable" onclick="location.hash='#/vav/${z.id}'">
          <td class="mono"><b>${z.id}</b></td><td>${z.name}</td><td class="num">${z.floor}</td>
          <td class="num mono ${al.includes('ZN-T') ? 'st-alarm' : ''}"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${tc};margin-right:6px"></span>${fmt(t, 1)}</td>
          <td class="num mono muted">${fmt(hsp, 0)} / ${fmt(csp, 0)}</td>
          <td class="num mono ${al.includes('CFM') ? 'st-alarm' : ''}">${fmt(pv(z.id + '.CFM'), 0)}</td><td class="num mono muted">${fmt(pv(z.id + '.CFM-SP'), 0)}</td>
          <td class="num"><div class="bar"><i style="width:${Math.min(100, pct)}%"></i></div></td>
          <td class="num mono">${fmt(pv(z.id + '.DMPR'), 0)}%</td>
          <td class="num"><div class="bar"><i class="h" style="width:${pv(z.id + '.HWV')}%"></i></div></td>
          <td class="num mono">${fmt(pv(z.id + '.DAT'), 1)}</td>
          <td class="num mono ${al.includes('CO2') ? 'st-alarm' : ''}">${fmt(pv(z.id + '.CO2'), 0)}</td>
          <td class="num"><span class="badge ${['', 'cool', '', 'heat', 'off'][md]}">${['', 'Cooling', 'Deadband', 'Heating', 'Unocc'][md]}</span></td>
          <td class="num">${al.length ? `<span class="badge alarm"><i></i>${al.length} alarm</span>` : sim.faults[z.id] ? '<span class="badge warn"><i></i>Fault</span>' : ov ? '<span class="badge ovr"><i></i>Override</span>' : '<span class="badge ok"><i></i>OK</span>'}</td></tr>`;
      }).join('');
    }
    function upd() {
      render();
      const inBand = ZONES.filter(z => { const t = pv(z.id + '.ZN-T'); return t >= pv(z.id + '.ZN-HSP') - 1 && t <= pv(z.id + '.ZN-CSP') + 1; }).length;
      k1.querySelector('.val').innerHTML = `${inBand}<small>/ ${ZONES.length}</small>`; k1.querySelector('.foot').textContent = 'within ±1 °F of setpoints';
      k2.querySelector('.val').innerHTML = fmt(ZONES.reduce((a, z) => a + pv(z.id + '.ZN-T'), 0) / ZONES.length, 1) + '<small>°F</small>';
      const md = [0, 0, 0, 0, 0]; ZONES.forEach(z => md[pv(z.id + '.MODE')]++); k2.querySelector('.foot').innerHTML = `<span class="badge cool">${md[1]} clg</span><span class="badge">${md[2]} db</span><span class="badge heat">${md[3]} htg</span>`;
      k3.querySelector('.val').innerHTML = fmt(pv('AHU-1.SA-CFM'), 0) + '<small>cfm</small>'; k3.querySelector('.foot').textContent = `AHU fan at ${fmt(pv('AHU-1.SF-SPD'), 0)} % · ${fmt(pv('AHU-1.SA-CFM') / BUILDING.designCfm * 100, 0)} % of design`;
      k4.querySelector('.val').innerHTML = `${fmt(pv('AHU-1.CLG-REQ'), 0)}<small>/</small> ${fmt(pv('AHU-1.SP-REQ'), 0)}`; k4.querySelector('.foot').textContent = `SAT SP ${fmt(pv('AHU-1.SAT-SP'), 1)} °F · static SP ${fmt(pv('AHU-1.DSP-SP'), 2)} in.`;
      recolorPlan($('#mx'), tcol, tlab);
      const rog = ZONES.map(z => ({ z, s: pv(z.id + '.CLG-LOOP') + pv(z.id + '.DMPR') * .5 + (pv(z.id + '.ZN-T') - pv(z.id + '.ZN-CSP')) * 20 })).sort((a, b) => b.s - a.s).slice(0, 5);
      $('#rogue').innerHTML = rog.map(({ z }) => `<a class="row-pt" href="#/vav/${z.id}" style="color:inherit"><span class="n"><b>${z.id}</b> ${z.name}</span><span class="mono">${fmt(pv(z.id + '.CLG-LOOP'), 0)}% loop · ${fmt(pv(z.id + '.DMPR'), 0)}% dmpr</span></a>`).join('');
    }
    upd();
    return { update: upd };
  },
};
