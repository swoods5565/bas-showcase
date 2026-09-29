// "Dollhouse" 3D building built purely from CSS 3D transforms (no WebGL):
// the rendered floor plans are stacked as 3D plates with live heat-mapped zone overlays,
// a sun-driven silhouette shadow, a mechanical yard, drag-to-orbit, explode & isolate floors.
import { h, clamp, rampColor, fmt } from './util.js';
import { ZONES, FLOORS } from './building.js';
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
  const o = { heat: 'temp', explode: 1.6, rx: 52, rz: -24, zoom: 1, auto: false, roof: true, labels: true, compact: false, ...opts };
  el.classList.add('dh'); el.innerHTML = '';
  const stage = h('div.dh-stage'), bld = h('div.dh-building'); stage.append(bld); el.append(stage);
  const tip = h('div.dh-tip'); el.append(tip);
  const PW = FLOORS[0].w, PD = FLOORS[0].h; // plan extents (Level-1 image px)
  let k = .6, rooms = [], floorsEl = [], focus = null, shadow = null;

  function build() {
    const W = el.clientWidth || 900, Hh = el.clientHeight || 600;
    k = clamp(Math.min(W * .6 / PW, Hh * .78 / PD), .2, 1.1) * (o.compact ? .95 : 1);
    bld.innerHTML = ''; rooms = []; floorsEl = [];
    const root = h('div', { style: { position: 'absolute', left: -PW * k / 2 + 'px', top: -PD * k / 2 + 'px', width: PW * k + 'px', height: PD * k + 'px', transformStyle: 'preserve-3d' } });
    bld.append(root);
    // ground: compass ring + a sun shadow cast from the Level-1 silhouette
    const ground = h('div', { style: { position: 'absolute', left: -PW * k * .18 + 'px', top: -PD * k * .2 + 'px', width: PW * k * 1.36 + 'px', height: PD * k * 1.4 + 'px', transform: 'translateZ(-3px)', pointerEvents: 'none',
      background: 'radial-gradient(closest-side, color-mix(in srgb, var(--accent) 9%, transparent), transparent 75%)', borderRadius: '50%' } });
    ground.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;opacity:.55"><ellipse cx="50" cy="50" rx="49" ry="49" fill="none" stroke="currentColor" stroke-width=".25" stroke-dasharray="1 1.5" style="color:var(--muted)"/><path d="M50 2 L52 8 L48 8 Z" fill="var(--alarm)"/><text x="50" y="12.5" text-anchor="middle" style="font:700 3.4px var(--font);fill:var(--text)">N</text></svg>`;
    shadow = h('img.dh-shadow', { src: FLOORS[0].img, alt: '', draggable: 'false', style: { position: 'absolute', left: 0, top: 0, width: PW * k + 'px', filter: 'brightness(0) blur(10px)', opacity: .55, pointerEvents: 'none', transition: 'transform 2s' } });
    root.append(ground, shadow);

    for (const F of FLOORS) {
      const fl = h('div.dh-floor', { 'data-floor': F.n }); floorsEl.push(fl); root.append(fl);
      const s = k * F.s; // image px → screen px
      const plate = h('div.dh-plate', { style: { position: 'absolute', left: F.x * k + 'px', top: F.y * k + 'px', width: F.w * s + 'px', height: F.h * s + 'px', transformStyle: 'preserve-3d' } });
      fl.append(plate);
      plate.append(h('img.dh-img', { src: F.img, alt: F.name + ' floor plan', draggable: 'false', style: { width: '100%', height: '100%' } }));
      for (const z of ZONES.filter(q => q.floor === F.n)) {
        const [x, y, w, d] = z.px, g = 4;
        const r = h('div.dh-room', { 'data-zone': z.id, style: { left: (x + g) * s + 'px', top: (y + g) * s + 'px', width: (w - 2 * g) * s + 'px', height: (d - 2 * g) * s + 'px' } });
        const lb = h('div.lbl'); if (o.labels) r.append(lb);
        r.append(h('i.dh-sensor', { style: { left: w * .5 * s - 4 + 'px', top: d * .7 * s - 4 + 'px' } }));
        plate.append(r); rooms.push({ z, el: r, lb, w: w * s, d: d * s });
        r.addEventListener('pointerenter', () => { hover = z; showTip(z); });
        r.addEventListener('pointerleave', () => { hover = null; tip.classList.remove('show'); });
        r.addEventListener('click', () => { if (dragMoved) return; o.onRoom?.(z.id); });
      }
      fl.append(h('div.dh-floor-tag', { style: { left: (F.n === 1 ? PW + 20 : F.x + F.w * F.s + 20) * k + 'px', top: (F.n === 1 ? PD - 160 : F.y + 40) * k + 'px' } }, 'L' + F.n));
    }
    if (o.roof) {
      // Ground-mounted mechanical yard in the two courtyards
      const yard = h('div.dh-floor.yard', { 'data-floor': 0 }); root.append(yard);
      const ahu = box(345 * k, 170 * k, 250 * k, 95 * k, 70 * k, { top: 'linear-gradient(90deg,#5e6a82,#6f7b94)', side: '#434C5E', side2: '#4C566A', cls: 'ahu-box' });
      yard.append(ahu);
      [0, 1].forEach(i => { const t = box((1000 + i * 150) * k, 150 * k, 115 * k, 115 * k, 95 * k, { top: '#3B4252', side: '#5E81AC', side2: '#81A1C1' }); const f = 95 * k; t.append(h('i.ct-fan', { style: { position: 'absolute', left: 10 * k + 'px', top: 10 * k + 'px', width: f + 'px', height: f + 'px', borderRadius: '50%', transform: `translateZ(${95 * k + 1}px)`, background: 'conic-gradient(from 0deg, #2E3440 0 15%, #88C0D0 15% 25%, #2E3440 25% 40%, #88C0D0 40% 50%, #2E3440 50% 65%, #88C0D0 65% 75%, #2E3440 75% 90%, #88C0D0 90%)', boxShadow: '0 0 0 3px #4C566A' } })); t.classList.add('ct-box'); yard.append(t); });
      yard.append(h('div.dh-floor-tag', { style: { left: 345 * k + 'px', top: 120 * k + 'px', transform: `translateZ(${70 * k + 6}px)`, fontSize: '14px' } }, 'AHU-1'));
      yard.append(h('div.dh-floor-tag', { style: { left: 1000 * k + 'px', top: 100 * k + 'px', transform: `translateZ(${95 * k + 6}px)`, fontSize: '14px' } }, 'CT-1 / CT-2'));
      ahu.style.cursor = 'pointer'; ahu.addEventListener('click', () => { if (!dragMoved) o.onEquip?.('ahu'); });
      yard.querySelectorAll('.ct-box').forEach(t => { t.style.cursor = 'pointer'; t.addEventListener('click', () => { if (!dragMoved) location.hash = '#/chw'; }); });
    }
    layout(); recolor();
  }
  function layout() {
    const gap = 65 * k * (1 + o.explode * 1.5); // 13 ft floor-to-floor ≈ 65 plan px, exaggerated by "explode"
    floorsEl.forEach((fl) => {
      const f = +fl.dataset.floor, i = Math.max(0, f - 1);
      const extra = focus != null && f > focus ? 560 : 0;
      fl.style.transform = `translateZ(${i * gap + extra}px)`;
      fl.classList.toggle('dim', focus != null && f !== focus && !(f === 0 && focus === 1));
    });
    bld.style.transform = `scale(${o.zoom}) rotateX(${o.rx}deg) rotateZ(${o.rz}deg) translateZ(${-gap * .45}px)`;
    const sun = sim.sun || { alt: 40, az: 180 };
    const L = sun.alt > 2 ? clamp(1 / Math.tan(sun.alt * Math.PI / 180), 0, 3) * 55 * k : 0;
    const a = (sun.az + 180) * Math.PI / 180;
    if (shadow) { shadow.style.transform = `translateZ(-2px) translate(${Math.sin(a) * L}px, ${-Math.cos(a) * L}px)`; shadow.style.opacity = sun.alt > 2 ? clamp(.25 + sun.alt / 110, .25, .7) : .2; }
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
    reset() { o.rx = 52; o.rz = -24; o.zoom = 1; layout(); },
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
