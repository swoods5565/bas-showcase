// "Dollhouse" 3D building built purely from CSS 3D transforms (no WebGL):
// stacked floor slabs, extruded walls, glazing, rooftop equipment, live heat-mapped rooms,
// real-sun-driven shadow, drag-to-orbit, explode & isolate floors.
import { h, clamp, rampColor, fmt } from './util.js';
import { ZONES, BUILDING, CORE } from './building.js';
import { pv, sim } from './sim.js';

export const HEAT = {
  temp: { label: 'Space temperature', unit: '°F', min: 64, max: 82, stops: ['#5E81AC', '#81A1C1', '#88C0D0', '#8FBCBB', '#A3BE8C', '#A3BE8C', '#EBCB8B', '#D08770', '#BF616A'], get: z => pv(z.id + '.ZN-T'), dec: 1 },
  dev: { label: 'Deviation from setpoint', unit: '°F', min: -4, max: 4, stops: ['#5E81AC', '#88C0D0', '#D8DEE9', '#EBCB8B', '#BF616A'], get: z => { const t = pv(z.id + '.ZN-T'), c = pv(z.id + '.ZN-CSP'), hh = pv(z.id + '.ZN-HSP'); return t > c ? t - c : t < hh ? t - hh : 0; }, dec: 1 },
  co2: { label: 'CO₂ concentration', unit: 'ppm', min: 400, max: 1200, stops: ['#A3BE8C', '#C9CF8F', '#EBCB8B', '#D08770', '#BF616A'], get: z => pv(z.id + '.CO2'), dec: 0 },
  flow: { label: 'Airflow (% of max)', unit: '%', min: 0, max: 100, stops: ['#4C566A', '#5E81AC', '#81A1C1', '#88C0D0', '#8FBCBB'], get: z => 100 * pv(z.id + '.CFM') / pv(z.id + '.CFM-MAX'), dec: 0 },
  occ: { label: 'Occupants (est.)', unit: 'ppl', min: 0, max: 25, stops: ['#434C5E', '#6f6a86', '#9c7fa3', '#B48EAD', '#d6b4cf'], get: z => sim.zones[z.id].people, dec: 0 },
};

function face(parent, cls, w, hh, transform, style = {}) { const f = h('i.' + cls, { style: { width: w + 'px', height: hh + 'px', transform, ...style } }); parent.append(f); return f; }
// A rectangular solid: plan (x,y,w,d) in px, height hh, sitting at z0
export function box(x, y, w, d, hh, { top = '#4C566A', side = '#3B4252', side2 = '#434C5E', z0 = 0, cls = '' } = {}) {
  const b = h('div.dh-box' + (cls ? '.' + cls : ''), { style: { left: x + 'px', top: y + 'px', width: w + 'px', height: d + 'px', transform: `translateZ(${z0}px)` } });
  face(b, 'f-top', w, d, `translateZ(${hh}px)`, { background: top });
  face(b, 'f-n', w, hh, `rotateX(90deg)`, { background: side2 });
  face(b, 'f-s', w, hh, `translateY(${d}px) rotateX(90deg)`, { background: side });
  face(b, 'f-w', d, hh, `rotateZ(90deg) rotateX(90deg)`, { background: side });
  face(b, 'f-e', d, hh, `translateX(${w}px) rotateZ(90deg) rotateX(90deg)`, { background: side2 });
  return b;
}

export function dollhouse(el, opts = {}) {
  const o = { heat: 'temp', explode: 1.9, rx: 58, rz: -38, zoom: 1, auto: false, roof: true, labels: true, compact: false, ...opts };
  el.classList.add('dh'); el.innerHTML = '';
  const stage = h('div.dh-stage'), bld = h('div.dh-building'); stage.append(bld); el.append(stage);
  const tip = h('div.dh-tip'); el.append(tip);
  const PW = BUILDING.plate.w, PD = BUILDING.plate.d;
  let S = 3, rooms = [], floorsEl = [], focus = null, wallH = 0, slabT = 0;

  const ground = h('div.dh-ground'); const shadow = h('div.dh-shadow');
  function build() {
    const W = el.clientWidth || 900, Hh = el.clientHeight || 600;
    S = clamp(Math.min(W / 250, Hh / 185), 1.6, 4.2) * (o.compact ? .92 : 1);
    wallH = 6.5 * S; slabT = 1.6 * S;
    bld.innerHTML = ''; rooms = []; floorsEl = [];
    // Ground plane with compass + sun shadow
    Object.assign(ground.style, { position: 'absolute', left: (-PW * S * .9) + 'px', top: (-PD * S * 1.1) + 'px', width: PW * S * 1.8 + 'px', height: PD * S * 2.2 + 'px', borderRadius: '50%', transform: `translateZ(${-slabT - 2}px)`,
      background: 'radial-gradient(closest-side, color-mix(in srgb, var(--accent) 10%, transparent), transparent 75%)', pointerEvents: 'none' });
    ground.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;opacity:.55"><ellipse cx="50" cy="50" rx="49" ry="49" fill="none" stroke="currentColor" stroke-width=".25" stroke-dasharray="1 1.5" style="color:var(--muted)"/><path d="M50 2 L52 8 L48 8 Z" fill="var(--alarm)"/><text x="50" y="12.5" text-anchor="middle" style="font:700 3.4px var(--font);fill:var(--text)">N</text></svg>`;
    Object.assign(shadow.style, { position: 'absolute', left: -PW * S / 2 + 'px', top: -PD * S / 2 + 'px', width: PW * S + 'px', height: PD * S + 'px', background: 'rgba(0,0,0,.45)', filter: 'blur(18px)', transform: `translateZ(${-slabT - 1}px)`, pointerEvents: 'none', borderRadius: '8px', transition: 'transform 2s' });
    bld.append(ground, shadow);

    for (let f = 1; f <= BUILDING.floors; f++) {
      const fl = h('div.dh-floor', { 'data-floor': f }); floorsEl.push(fl); bld.append(fl);
      const slab = h('div.dh-slab', { style: { left: -PW * S / 2 + 'px', top: -PD * S / 2 + 'px', width: PW * S + 'px', height: PD * S + 'px' } });
      fl.append(slab);
      // slab thickness (south + east faces are the ones seen from the default camera)
      slab.append(h('i.dh-slab-edge', { style: { width: PW * S + 'px', height: slabT + 'px', top: PD * S + 'px', transform: 'rotateX(-90deg)' } }));
      slab.append(h('i.dh-slab-edge', { style: { width: PD * S + 'px', height: slabT + 'px', left: PW * S + 'px', top: 0, transform: 'rotateZ(90deg) rotateX(-90deg)', filter: 'brightness(.8)' } }));
      slab.append(h('i.dh-slab-edge', { style: { width: PW * S + 'px', height: slabT + 'px', top: 0, transform: 'rotateX(-90deg)', filter: 'brightness(.7)' } }));
      slab.append(h('i.dh-slab-edge', { style: { width: PD * S + 'px', height: slabT + 'px', left: 0, top: 0, transform: 'rotateZ(90deg) rotateX(-90deg)', filter: 'brightness(.9)' } }));
      // core
      const [cx, cy, cw, cd] = CORE.r;
      slab.append(h('div.dh-room.core', { style: { left: cx * S + 'px', top: cy * S + 'px', width: cw * S + 'px', height: cd * S + 'px' }, title: CORE.name }));
      slab.append(box(cx * S + cw * S * .12, cy * S + cd * S * .1, cw * S * .34, cd * S * .3, wallH * 1.6, { top: 'var(--n3)', side: 'var(--n1)', side2: 'var(--n2)' }));
      // rooms
      for (const z of ZONES.filter(z => z.floor === f)) {
        const [x, y, w, d] = z.rect, g = 1.1;
        const r = h('div.dh-room', { 'data-zone': z.id, style: { left: (x + g) * S + 'px', top: (y + g) * S + 'px', width: (w - 2 * g) * S + 'px', height: (d - 2 * g) * S + 'px' } });
        const lb = h('div.lbl'); if (o.labels) r.append(lb);
        r.append(h('i.dh-sensor', { style: { left: (w * .5) * S - 4 + 'px', top: (d * .72) * S - 4 + 'px' } }));
        slab.append(r); rooms.push({ z, el: r, lb, w: w * S, d: d * S });
        r.addEventListener('pointerenter', () => { hover = z; showTip(z); });
        r.addEventListener('pointerleave', () => { hover = null; tip.classList.remove('show'); });
        r.addEventListener('click', (e) => { if (dragMoved) return; o.onRoom?.(z.id); });
      }
      // walls: unique interior partitions + glazed exterior
      const segs = new Map();
      const add = (x1, y1, x2, y2) => { const k = [x1, y1, x2, y2].join(','); if (!segs.has(k)) segs.set(k, [x1, y1, x2, y2]); };
      ZONES.filter(z => z.floor === f).forEach(z => { const [x, y, w, d] = z.rect; add(x, y, x + w, y); add(x, y + d, x + w, y + d); add(x, y, x, y + d); add(x + w, y, x + w, y + d); });
      for (const [x1, y1, x2, y2] of segs.values()) {
        const ext = (y1 === 0 && y2 === 0) || (y1 === PD && y2 === PD) || (x1 === 0 && x2 === 0) || (x1 === PW && x2 === PW);
        const hor = y1 === y2, len = (hor ? x2 - x1 : y2 - y1) * S, hh = ext ? wallH * 1.25 : wallH;
        slab.append(h('i.dh-wall' + (ext ? '.ext' : ''), { style: { left: x1 * S + 'px', top: y1 * S + 'px', width: len + 'px', height: hh + 'px', transform: hor ? 'rotateX(90deg)' : 'rotateZ(90deg) rotateX(90deg)' } }));
      }
      slab.append(h('div.dh-floor-tag', { style: { left: PW * S + 16 + 'px', top: PD * S - 26 + 'px' }, text: '' }, 'L' + f));
    }
    if (o.roof) {
      const roof = h('div.dh-floor.roof', { 'data-floor': 5 }); floorsEl.push(roof); bld.append(roof);
      const R = h('div.dh-roofdeck', { style: { position: 'absolute', left: -PW * S / 2 + 'px', top: -PD * S / 2 + 'px', width: PW * S + 'px', height: PD * S + 'px', transformStyle: 'preserve-3d' } }); roof.append(R);
      // AHU-1 on curb, 2 cooling towers, exhaust fans
      const ahu = box(18 * S, 36 * S, 58 * S, 20 * S, 10 * S, { top: 'linear-gradient(90deg,#5e6a82,#6f7b94)', side: '#434C5E', side2: '#4C566A', cls: 'ahu-box' });
      R.append(ahu);
      [0, 1].forEach(i => { const t = box((120 + i * 24) * S, 34 * S, 20 * S, 20 * S, 12 * S, { top: '#3B4252', side: '#5E81AC', side2: '#81A1C1' }); const fan = h('i.ct-fan', { style: { position: 'absolute', left: 2 * S + 'px', top: 2 * S + 'px', width: 16 * S + 'px', height: 16 * S + 'px', borderRadius: '50%', transform: `translateZ(${12 * S + 1}px)`, background: 'conic-gradient(from 0deg, #2E3440 0 15%, #88C0D0 15% 25%, #2E3440 25% 40%, #88C0D0 40% 50%, #2E3440 50% 65%, #88C0D0 65% 75%, #2E3440 75% 90%, #88C0D0 90%)', boxShadow: '0 0 0 3px #4C566A' } }); t.append(fan); R.append(t); });
      [[100, 70], [150, 72], [40, 72]].forEach(([x, y]) => R.append(box(x * S, y * S, 7 * S, 7 * S, 4 * S, { top: '#616e88', side: '#434C5E', side2: '#4C566A' })));
      R.append(h('div.dh-floor-tag', { style: { left: 20 * S + 'px', top: 30 * S + 'px', transform: `translateZ(${10 * S + 4}px)`, fontSize: '14px' } }, 'AHU-1'));
      R.append(h('div.dh-floor-tag', { style: { left: 120 * S + 'px', top: 28 * S + 'px', transform: `translateZ(${12 * S + 4}px)`, fontSize: '14px' } }, 'CT-1 / CT-2'));
      R.querySelector('.ahu-box').addEventListener('click', () => { if (!dragMoved) o.onEquip?.('ahu'); });
      R.querySelector('.ahu-box').style.cursor = 'pointer';
    }
    layout(); recolor();
  }
  function layout() {
    const gap = BUILDING.floorHeight * S * o.explode * .55 + slabT;
    floorsEl.forEach((fl, i) => {
      const f = i + 1; let z = i * gap, extra = 0;
      if (focus != null) { if (f > focus) extra = 520; }
      fl.style.transform = `translateZ(${z + extra}px)`;
      fl.classList.toggle('dim', focus != null && f !== focus);
    });
    const lift = (BUILDING.floors) * gap * .5;
    bld.style.transform = `scale(${o.zoom}) rotateX(${o.rx}deg) rotateZ(${o.rz}deg) translateZ(${-lift}px)`;
    // sun shadow direction (azimuth from north, clockwise). Shadow is cast away from the sun.
    const sun = sim.sun || { alt: 40, az: 180 };
    const L = sun.alt > 2 ? clamp(1 / Math.tan(sun.alt * Math.PI / 180), 0, 3) * 28 * S : 0;
    const a = (sun.az + 180) * Math.PI / 180;
    shadow.style.transform = `translateZ(${-slabT - 1}px) translate(${Math.sin(a) * L}px, ${-Math.cos(a) * L}px) scale(1.04)`;
    shadow.style.opacity = sun.alt > 2 ? clamp(.25 + sun.alt / 90, .25, .8) : .25;
  }
  let hover = null;
  function color(z) {
    const H = HEAT[o.heat], v = H.get(z);
    const hp = document.documentElement.dataset.hmi === 'hp';
    if (hp) { const bad = pts_alarm(z); return bad ? '#BF616A' : rampColor(['#6b7384', '#9aa3b3', '#c3cad6'], (v - H.min) / (H.max - H.min)); }
    return rampColor(H.stops, (v - H.min) / (H.max - H.min));
  }
  const pts_alarm = (z) => ['ZN-T', 'CFM', 'CO2'].some(k => sim.alarms.get(z.id + '.' + k)?.state === 'Active');
  function recolor() {
    const H = HEAT[o.heat];
    for (const r of rooms) {
      r.el.style.backgroundColor = color(r.z);
      if (o.labels) {
        const v = H.get(r.z); const small = r.w < 90 || r.d < 50;
        r.lb.innerHTML = `<b>${fmt(v, H.dec)}${H.unit === '°F' ? '°' : ''}</b>${small ? '' : `<span>${r.z.name}</span>`}`;
      }
      r.el.classList.toggle('alarm', pts_alarm(r.z));
    }
    // cooling tower fans spin with VFD speed
    el.querySelectorAll('.ct-fan').forEach((f, i) => { const sp = pv(`CHW.CT-${i + 1}-SPD`); f.style.animation = sp > 1 ? `spin ${clamp(60 / sp, .4, 4)}s linear infinite` : 'none'; });
    if (hover) showTip(hover, true);
  }
  function showTip(z, keep) {
    const md = pv(z.id + '.MODE'); const mode = ['', 'Cooling', 'Deadband', 'Heating', 'Unoccupied'][md];
    tip.innerHTML = `<h4>${z.name} <span class="muted" style="font-weight:500">· ${z.id}</span></h4>
      <div class="r">Space temp<b>${fmt(pv(z.id + '.ZN-T'), 1)} °F</b></div>
      <div class="r">Setpoints (htg / clg)<b>${fmt(pv(z.id + '.ZN-HSP'), 0)} / ${fmt(pv(z.id + '.ZN-CSP'), 0)} °F</b></div>
      <div class="r">Airflow<b>${fmt(pv(z.id + '.CFM'), 0)} / ${fmt(pv(z.id + '.CFM-SP'), 0)} cfm</b></div>
      <div class="r">Reheat valve<b>${fmt(pv(z.id + '.HWV'), 0)} %</b></div>
      <div class="r">CO₂<b>${fmt(pv(z.id + '.CO2'), 0)} ppm</b></div>
      <div class="r">State<b>${mode}${sim.faults[z.id] ? ' · FAULT' : ''}</b></div>
      <div class="r" style="margin-top:6px"><span class="faint">Click to open VAV graphic</span></div>`;
    tip.classList.add('show');
  }
  el.addEventListener('pointermove', (e) => { const r = el.getBoundingClientRect(); let x = e.clientX - r.left, y = e.clientY - r.top; if (x > r.width - 250) x -= 250; if (y > r.height - 200) y -= 200; tip.style.left = x + 'px'; tip.style.top = y + 'px'; });

  // Orbit controls
  let drag = null, dragMoved = false, lastInteract = 0;
  el.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, rx: o.rx, rz: o.rz }; dragMoved = false; el.classList.add('grabbing'); });
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  function onMove(e) { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) dragMoved = true; if (!dragMoved) return; o.rz = drag.rz - dx * .35; o.rx = clamp(drag.rx - dy * .25, 8, 82); lastInteract = performance.now(); layout(); }
  function onUp() { if (drag) { el.classList.remove('grabbing'); drag = null; setTimeout(() => dragMoved = false, 0); } }
  let raf = 0, t0 = performance.now();
  const loop = (t) => { if (o.auto && !drag && t - lastInteract > 2500 && !matchMedia('(prefers-reduced-motion: reduce)').matches) { o.rz += (t - t0) * .006; layout(); } t0 = t; raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  const ro = new ResizeObserver(() => build()); ro.observe(el);

  return {
    update: recolor,
    set(k, v) { o[k] = v; if (k === 'heat') recolor(); else if (k === 'labels') build(); else layout(); },
    get: (k) => o[k],
    focus(f) { focus = f; layout(); },
    reset() { o.rx = 58; o.rz = -38; o.zoom = 1; layout(); },
    select(id) { rooms.forEach(r => r.el.classList.toggle('sel', r.z.id === id)); },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); },
  };
}

export function heatLegend(mode) {
  const H = HEAT[mode];
  return h('div.dh-scale', {}, h('div', {}, H.label),
    h('div.ramp', { style: { background: `linear-gradient(90deg, ${H.stops.join(',')})` } }),
    h('div.ticks', {}, h('span', {}, fmt(H.min, 0)), h('span', {}, fmt((H.min + H.max) / 2, 0)), h('span', {}, fmt(H.max, 0) + ' ' + H.unit)));
}
