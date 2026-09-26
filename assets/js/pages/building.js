import { h, fmt, $, $$, ICONS } from '../util.js';
import { dollhouse, heatLegend, HEAT } from '../dollhouse.js';
import { ZONES, BUILDING } from '../building.js';
import { pv, sim, pts } from '../sim.js';
import { spark } from '../charts.js';

export default {
  title: () => 'Building 3D',
  mount(view) {
    view.append(h('div.page-head', {},
      h('div', {}, h('div.crumbs', { html: `<a href="#/">Meridian Tower</a> › Building` }), h('h1', {}, 'Dollhouse floor plans'),
        h('p', {}, 'Every floor is a live, heat-mapped plan built from CSS 3D transforms. Drag to orbit, isolate a level, explode the stack, and click any room to open its VAV graphic. The shadow follows the real sun position for the site.')),
    ));
    const card = h('div.card.flush'); view.append(card);
    const dhEl = h('div', { style: { height: '680px' } }); card.append(dhEl);
    const dh = dollhouse(dhEl, { onRoom: id => location.hash = '#/vav/' + id, onEquip: () => location.hash = '#/ahu', explode: 2.2 });
    const hud = h('div.dh-hud'), hudR = h('div.dh-hud-r'); dhEl.append(hud, hudR);
    const seg = (items, cur, fn) => { const s = h('div.seg'); items.forEach(([k, l]) => { const b = h('button', { onclick: () => { $$('button', s).forEach(x => x.classList.remove('on')); b.classList.add('on'); fn(k); } }, l); if (k === cur) b.classList.add('on'); s.append(b); }); return s; };
    let legend = heatLegend('temp');
    hud.append(seg([['temp', 'Temp'], ['dev', 'Δ Setpoint'], ['co2', 'CO₂'], ['flow', 'Airflow'], ['occ', 'Occupancy']], 'temp', k => { dh.set('heat', k); const n = heatLegend(k); legend.replaceWith(n); legend = n; }));
    hud.append(seg([[null, 'All'], [1, 'L1'], [2, 'L2'], [3, 'L3'], [4, 'L4']], null, f => dh.focus(f)));
    const range = h('input', { type: 'range', min: 1, max: 4, step: .05, value: 2.2, 'aria-label': 'Explode floors', style: { width: '160px', accentColor: 'var(--accent)' }, oninput: e => dh.set('explode', +e.target.value) });
    hud.append(h('div.dh-scale', { style: { minWidth: 'auto', flexDirection: 'row', alignItems: 'center', gap: '10px' } }, h('span', {}, 'Explode'), range));
    hud.append(h('div.row', {}, h('button.btn', { onclick: () => dh.reset(), html: 'Reset view' }), h('button.btn', { onclick: (e) => { const on = !dh.get('auto'); dh.set('auto', on); e.currentTarget.classList.toggle('primary', on); }, html: `${ICONS.play} Orbit` })));
    const sunBox = h('div.dh-scale'); hudR.append(legend, sunBox);
    dhEl.append(h('div.dh-hint', {}, 'Drag to orbit · click a room to open its VAV · rooftop AHU opens AHU-1'));

    // Floor summary cards
    const grid = h('div.grid.g-4', { style: { marginTop: '16px' } }); view.append(grid);
    const cards = [1, 2, 3, 4].map(f => {
      const c = h('div.card.reveal', { style: { cursor: 'pointer' }, onclick: () => { dh.focus(f); $$('.dh-hud .seg')[1].querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === f)); card.scrollIntoView({ behavior: 'smooth' }); } });
      c.innerHTML = `<div class="card-h"><h3>Level ${f}</h3><span class="sub" data-k="al"></span></div>
        <div class="row between"><div class="kpi"><div class="lbl">Avg space temp</div><div class="val" data-k="t">--</div></div><div class="kpi" style="text-align:right"><div class="lbl">Avg CO₂</div><div class="val" style="font-size:22px" data-k="c">--</div></div></div>
        <div class="spark" data-k="sp" style="height:34px;margin:8px 0"></div>
        <div class="row" style="gap:6px" data-k="m"></div>`;
      grid.append(c); return c;
    });
    const upd = () => {
      dh.update();
      const s = sim.sun || { alt: 0, az: 0 };
      sunBox.innerHTML = `<div>Sun position (live, ${new Date(sim.t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })})</div><div class="mono" style="color:var(--text);font-size:13px">Alt ${fmt(s.alt, 1)}° · Az ${fmt(s.az, 0)}° · GHI ${fmt(sim.ghi || 0, 0)} W/m²</div>`;
      cards.forEach((c, i) => {
        const zs = ZONES.filter(z => z.floor === i + 1);
        const t = zs.reduce((a, z) => a + pv(z.id + '.ZN-T'), 0) / zs.length, co2 = zs.reduce((a, z) => a + pv(z.id + '.CO2'), 0) / zs.length;
        const md = [0, 0, 0, 0, 0]; zs.forEach(z => md[pv(z.id + '.MODE')]++);
        const al = zs.filter(z => ['ZN-T', 'CFM', 'CO2'].some(k => sim.alarms.get(z.id + '.' + k)?.state === 'Active')).length;
        c.querySelector('[data-k=t]').innerHTML = fmt(t, 1) + '<small>°F</small>';
        c.querySelector('[data-k=c]').innerHTML = fmt(co2, 0) + '<small>ppm</small>';
        c.querySelector('[data-k=al]').innerHTML = al ? `<span class="badge alarm"><i></i>${al} alarm${al > 1 ? 's' : ''}</span>` : '<span class="badge ok"><i></i>Normal</span>';
        c.querySelector('[data-k=m]').innerHTML = `<span class="badge cool">${md[1]} cooling</span><span class="badge">${md[2]} deadband</span><span class="badge heat">${md[3]} heating</span>`;
        const series = [];
        const len = Math.min(...zs.map(z => (ptsHist(z.id + '.ZN-T')).length));
        for (let k = Math.max(0, len - 180); k < len; k++) series.push(zs.reduce((a, z) => a + ptsHist(z.id + '.ZN-T')[k][1], 0) / zs.length);
        spark(c.querySelector('[data-k=sp]'), series, 'var(--accent)');
      });
    };
    upd();
    return { update: upd, destroy: () => dh.destroy(), theme: () => dh.update() };
  },
};
const ptsHist = (id) => pts.get(id)?.hist || [];
