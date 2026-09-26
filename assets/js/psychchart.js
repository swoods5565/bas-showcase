// Interactive psychrometric chart (IP units, sea-level-corrected by site pressure)
import { s, h, fmt } from './util.js';
import { wSat, wFromRH, stateTW, tFromHW, P_STD } from './psychro.js';

export function psychChart(el, { P = P_STD, tMin = 20, tMax = 110, wMax = .030, height = 380 } = {}) {
  el.classList.add('chart'); el.innerHTML = '';
  const W = 900, H = height, m = { l: 16, r: 58, t: 14, b: 34 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
  const X = t => m.l + (t - tMin) / (tMax - tMin) * iw, Y = w => m.t + ih - w / wMax * ih;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Psychrometric chart' });
  const defs = s('defs'); svg.append(defs);
  const clipId = 'sat' + Math.random().toString(36).slice(2, 7);
  // saturation curve polygon (clip region)
  const sat = []; for (let t = tMin; t <= tMax; t += 1) { const w = wSat(t, P); if (w > wMax) { sat.push([X(t), Y(wMax)]); break; } sat.push([X(t), Y(w)]); }
  const satPath = 'M' + sat.map(p => p.join(',')).join('L');
  const lastX = sat.at(-1)[0];
  defs.append(s('clipPath', { id: clipId }, s('path', { d: `${satPath}L${X(tMax)},${Y(wMax)}L${X(tMax)},${Y(0)}L${X(tMin)},${Y(0)}Z` })));
  const g = s('g', { 'clip-path': `url(#${clipId})` }); svg.append(g);
  g.append(s('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'color-mix(in srgb, var(--accent) 4%, transparent)' }));
  // DB verticals
  for (let t = tMin; t <= tMax; t += 5) g.append(s('line', { x1: X(t), x2: X(t), y1: Y(0), y2: Y(wMax), stroke: 'var(--line)', 'stroke-width': t % 10 ? .6 : 1 }));
  // W horizontals (grains)
  for (let gr = 0; gr <= wMax * 7000; gr += 20) g.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(gr / 7000), y2: Y(gr / 7000), stroke: 'var(--line)', 'stroke-width': .6 }));
  // enthalpy lines
  for (let hh = 10; hh <= 55; hh += 5) { const w0 = 0, t0 = tFromHW(hh, w0), w1 = wMax, t1 = tFromHW(hh, w1); g.append(s('line', { x1: X(t0), y1: Y(w0), x2: X(t1), y2: Y(w1), stroke: 'var(--line-2)', 'stroke-dasharray': '2 5', 'stroke-width': .8 })); }
  // RH curves
  for (let rh = 10; rh < 100; rh += 10) {
    const pts = []; for (let t = tMin; t <= tMax; t += 1) { const w = wFromRH(t, rh, P); if (w > wMax) break; pts.push([X(t), Y(w)]); }
    g.append(s('path', { d: 'M' + pts.map(p => p.join(',')).join('L'), fill: 'none', stroke: 'var(--muted)', 'stroke-width': rh === 50 ? 1.1 : .6, opacity: .55 }));
    const lp = pts[Math.min(pts.length - 1, Math.floor(pts.length * .86))]; if (lp) svg.append(s('text', { x: lp[0] + 3, y: lp[1] - 3, style: 'font-size:10px;fill:var(--faint)', text: rh + '%' }));
  }
  // ASHRAE 55 comfort envelopes (approximate graphic-method polygons)
  const poly = (arr, cls, label) => { const d = 'M' + arr.map(([t, w]) => X(t) + ',' + Y(w)).join('L') + 'Z'; g.append(s('path', { d, fill: `color-mix(in srgb, ${cls} 16%, transparent)`, stroke: cls, 'stroke-width': 1.2, 'stroke-dasharray': '5 3' })); svg.append(s('text', { x: X(arr[3][0]) + 4, y: Y(arr[3][1]) + 14, style: `font-size:10.5px;fill:${cls};font-weight:600`, text: label })); };
  poly([[69, 0], [76.5, 0], [74.5, .012], [67.5, .012]], 'var(--heat)', 'Winter 1.0 clo');
  poly([[74.5, 0], [81, 0], [79, .012], [72.5, .012]], 'var(--cool)', 'Summer 0.5 clo');
  svg.append(s('path', { d: satPath, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2 }));
  // axes labels
  for (let t = tMin; t <= tMax; t += 10) svg.append(s('text', { x: X(t), y: H - 16, 'text-anchor': 'middle', style: 'font-size:11px;fill:var(--muted)', text: t }));
  svg.append(s('text', { x: m.l + iw / 2, y: H - 2, 'text-anchor': 'middle', style: 'font-size:11px;fill:var(--muted)', text: 'Dry-bulb temperature (°F)' }));
  for (let gr = 0; gr <= wMax * 7000; gr += 40) svg.append(s('text', { x: W - m.r + 6, y: Y(gr / 7000) + 4, style: 'font-size:11px;fill:var(--muted)', text: gr }));
  svg.append(s('text', { x: W - 8, y: m.t + ih / 2, transform: `rotate(90 ${W - 8} ${m.t + ih / 2})`, 'text-anchor': 'middle', style: 'font-size:11px;fill:var(--muted)', text: 'Humidity ratio (gr/lb dry air)' }));
  svg.append(s('text', { x: X(tMin) + 70, y: Y(wSat(tMin + 40, P)) - 18, style: 'font-size:10.5px;fill:var(--faint)', transform: `rotate(-38 ${X(tMin) + 70} ${Y(wSat(tMin + 40, P)) - 18})`, text: 'Enthalpy (Btu/lb) — dashed' }));
  const layer = s('g'); svg.append(layer);
  // hover readout
  const cross = s('g', { opacity: 0 }, s('line', { class: 'cx', stroke: 'var(--muted)', 'stroke-dasharray': '3 3' }), s('line', { class: 'cy', stroke: 'var(--muted)', 'stroke-dasharray': '3 3' }));
  svg.append(cross);
  const tip = h('div.chart-tip'); el.append(svg, tip);
  svg.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect(); const px = (e.clientX - r.left) * W / r.width, py = (e.clientY - r.top) * H / r.height;
    const t = tMin + (px - m.l) / iw * (tMax - tMin), w = (m.t + ih - py) / ih * wMax;
    if (t < tMin || t > tMax || w < 0 || w > wSat(t, P)) { tip.classList.remove('show'); cross.setAttribute('opacity', 0); return; }
    const st = stateTW(t, w, P);
    const [lx, ly] = [cross.children[0], cross.children[1]];
    lx.setAttribute('x1', X(t)); lx.setAttribute('x2', X(t)); lx.setAttribute('y1', Y(0)); lx.setAttribute('y2', Y(w));
    ly.setAttribute('x1', X(t)); ly.setAttribute('x2', W - m.r); ly.setAttribute('y1', Y(w)); ly.setAttribute('y2', Y(w)); cross.setAttribute('opacity', 1);
    tip.innerHTML = `<div class="tt">Cursor state point</div><div class="r">Dry bulb<b>${fmt(t, 1)} °F</b></div><div class="r">RH<b>${fmt(st.rh, 0)} %</b></div><div class="r">Wet bulb<b>${fmt(st.wb, 1)} °F</b></div><div class="r">Dew point<b>${fmt(st.dp, 1)} °F</b></div><div class="r">Humidity ratio<b>${fmt(st.gr, 0)} gr/lb</b></div><div class="r">Enthalpy<b>${fmt(st.h, 1)} Btu/lb</b></div>`;
    tip.style.left = (X(t) / W * r.width) + 'px'; tip.style.top = (Y(w) / H * r.height) + 'px'; tip.classList.add('show');
  });
  svg.addEventListener('pointerleave', () => { tip.classList.remove('show'); cross.setAttribute('opacity', 0); });

  return {
    /** points: [{id,label,t,w,color}], lines: [[fromId,toId]] */
    set(points, lines = []) {
      layer.innerHTML = ''; const byId = Object.fromEntries(points.map(p => [p.id, p]));
      const mk = 'ar' + Math.random().toString(36).slice(2, 6);
      layer.append(s('defs', {}, s('marker', { id: mk, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, s('path', { d: 'M0,0L10,5L0,10z', fill: 'var(--text-2)' }))));
      lines.forEach(([a, b]) => { const p = byId[a], q = byId[b]; if (!p || !q) return; layer.append(s('line', { x1: X(p.t), y1: Y(p.w), x2: X(q.t), y2: Y(q.w), stroke: 'var(--text-2)', 'stroke-width': 1.6, 'marker-end': `url(#${mk})`, opacity: .8 })); });
      points.forEach(p => {
        const x = X(Math.max(tMin, Math.min(tMax, p.t))), y = Y(Math.min(wMax, p.w));
        if (!p.small) layer.append(s('circle', { cx: x, cy: y, r: 13, fill: p.color, opacity: .18 }, s('animate', { attributeName: 'r', values: '9;16;9', dur: '2.4s', repeatCount: 'indefinite' })));
        layer.append(s('circle', { cx: x, cy: y, r: p.small ? 4 : 6.5, fill: p.color, stroke: 'var(--panel-solid)', 'stroke-width': p.small ? 1.5 : 2.5 }));
        layer.append(s('text', { x: x + 11, y: y - 9, style: 'font-size:12.5px;font-weight:700;fill:var(--text);paint-order:stroke;stroke:var(--bg);stroke-width:4px', text: p.label }));
      });
    },
  };
}
