// Minimal responsive SVG charts: line/area (with crosshair tooltip), bars, scatter, sparkline, arc gauge.
// Conventions: one y-axis per chart, 2px lines, recessive grid, legends for ≥2 series.
import { s, h, clamp, fmt } from './util.js';

const niceTicks = (min, max, n = 5) => {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(st => span / st <= n) || mag * 10;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(10));
  return out;
};
const timeFmt = (t, span) => { const d = new Date(t); return span > 36 * 36e5 ? d.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric' }) : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: span < 3 * 36e5 ? '2-digit' : undefined }); };

function observe(el, draw) {
  let w = 0; const ro = new ResizeObserver(() => { const nw = el.clientWidth; if (nw && Math.abs(nw - w) > 2) { w = nw; draw(nw); } });
  ro.observe(el); el._ro = ro; return () => ro.disconnect();
}
function legend(series, square) {
  if (series.length < 2) return null;
  return h('div.chart-legend', {}, series.map(sr => h('span', {}, h('i' + (square ? '.sq' : ''), { style: { background: sr.color, ...(sr.dash ? { background: `repeating-linear-gradient(90deg, ${sr.color} 0 4px, transparent 4px 7px)` } : {}) } }), sr.name)));
}

/** Line / area chart. opts: {series:[{name,color,data:[[x,y]],area,dash,unit}], height, y:{min,max,fmt,unit}, x:{time:true, fmt}, bands:[{x0,x1,label,color}], stacked, hlines:[{y,label}] , markers}*/
export function lineChart(el, opts) {
  el.classList.add('chart'); el.innerHTML = '';
  const lg = opts.legend === false ? null : legend(opts.series);
  if (lg) el.append(lg);
  const holder = h('div'); el.append(holder);
  const tip = h('div.chart-tip'); el.append(tip);
  let state = opts;
  const draw = (W) => {
    const o = state, H = o.height || 220, m = { l: 44, r: 12, t: 10, b: 26 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    let series = o.series;
    if (o.stacked) { const acc = new Map(); series = series.map(sr => ({ ...sr, base: sr.data.map(([x]) => acc.get(x) || 0), data: sr.data.map(([x, y]) => { const b = acc.get(x) || 0; acc.set(x, b + y); return [x, b + y]; }) })); }
    const xs = series.flatMap(sr => sr.data.map(d => d[0])), ys = series.flatMap(sr => sr.data.map(d => d[1])).filter(Number.isFinite);
    if (!xs.length) { holder.innerHTML = '<div class="empty">No data</div>'; return; }
    const x0 = o.x?.min ?? Math.min(...xs), x1 = o.x?.max ?? Math.max(...xs);
    let y0 = o.y?.min ?? Math.min(...ys, ...(o.hlines || []).map(l => l.y)), y1 = o.y?.max ?? Math.max(...ys, ...(o.hlines || []).map(l => l.y));
    if (o.y?.min == null) { const pad = (y1 - y0) * .08 || 1; y0 -= pad; } if (o.y?.max == null) { y1 += (y1 - y0) * .08 || 1; }
    if (o.stacked || o.zero) y0 = Math.min(0, y0);
    const ticks = niceTicks(y0, y1, Math.max(3, Math.round(ih / 45))); y0 = Math.min(y0, ticks[0]); y1 = Math.max(y1, ticks.at(-1));
    const X = v => m.l + (v - x0) / (x1 - x0 || 1) * iw, Y = v => m.t + ih - (v - y0) / (y1 - y0 || 1) * ih;
    const yf = o.y?.fmt || (v => fmt(v, Math.abs(y1 - y0) < 5 ? 1 : 0));
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, height: H, role: 'img', 'aria-label': o.label || 'chart' });
    const g = s('g', { class: 'grid' });
    ticks.forEach(t => { g.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) })); svg.append(s('text', { x: m.l - 8, y: Y(t) + 4, 'text-anchor': 'end', class: 'axis', style: 'font-size:11px;fill:var(--muted)', text: yf(t) })); });
    svg.prepend(g);
    (o.bands || []).forEach(b => {
      const bx0 = X(clamp(b.x0, x0, x1)), bx1 = X(clamp(b.x1, x0, x1)); if (bx1 - bx0 < 1) return;
      svg.append(s('rect', { x: bx0, y: m.t, width: bx1 - bx0, height: ih, fill: b.color || 'var(--line)', opacity: b.opacity ?? .5, rx: 3 }));
      if (b.label && bx1 - bx0 > 40) svg.append(s('text', { x: bx0 + 5, y: m.t + 12, style: 'font-size:10px;fill:var(--muted)', text: b.label }));
    });
    // x ticks
    const nx = Math.max(2, Math.floor(iw / 90)), span = x1 - x0;
    for (let i = 0; i <= nx; i++) { const v = x0 + span * i / nx; svg.append(s('text', { x: X(v), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === nx ? 'end' : 'middle', style: 'font-size:11px;fill:var(--muted)', text: o.x?.fmt ? o.x.fmt(v) : o.x?.time === false ? fmt(v, 0) : timeFmt(v, span) })); }
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(Math.max(y0, Math.min(0, y1))) , y2: Y(Math.max(y0, Math.min(0, y1))), class: 'baseline', stroke: 'var(--line-2)' }));
    (o.hlines || []).forEach(l => { svg.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(l.y), y2: Y(l.y), stroke: l.color || 'var(--muted)', 'stroke-dasharray': '5 4', 'stroke-width': 1.2 })); if (l.label) svg.append(s('text', { x: W - m.r - 4, y: Y(l.y) - 5, 'text-anchor': 'end', style: `font-size:10.5px;fill:${l.color || 'var(--muted)'}`, text: l.label })); });
    const path = (d) => d.map(([x, y], i) => (i ? 'L' : 'M') + X(x).toFixed(1) + ',' + Y(y).toFixed(1)).join('');
    const defs = s('defs'); svg.append(defs);
    series.forEach((sr, i) => {
      if (!sr.data.length) return;
      if (sr.area || o.stacked) {
        const gid = 'g' + Math.random().toString(36).slice(2, 8);
        defs.append(s('linearGradient', { id: gid, x1: 0, x2: 0, y1: 0, y2: 1 }, s('stop', { offset: 0, 'stop-color': sr.color, 'stop-opacity': o.stacked ? .85 : .32 }), s('stop', { offset: 1, 'stop-color': sr.color, 'stop-opacity': o.stacked ? .55 : 0 })));
        const base = sr.base ? sr.base.map((b, k) => [sr.data[k][0], b]).reverse() : [[sr.data.at(-1)[0], y0], [sr.data[0][0], y0]];
        svg.append(s('path', { d: path(sr.data) + base.map(([x, y]) => 'L' + X(x).toFixed(1) + ',' + Y(y).toFixed(1)).join('') + 'Z', fill: `url(#${gid})`, stroke: o.stacked ? 'var(--bg)' : 'none', 'stroke-width': o.stacked ? 1 : 0 }));
      }
      svg.append(s('path', { d: path(sr.data), fill: 'none', stroke: sr.color, 'stroke-width': sr.width || 2, 'stroke-dasharray': sr.dash || null, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    });
    (o.markers || []).forEach(mk => { svg.append(s('circle', { cx: X(mk.x), cy: Y(mk.y), r: 5, fill: mk.color, stroke: 'var(--panel-solid)', 'stroke-width': 2 })); if (mk.label) svg.append(s('text', { x: X(mk.x) + 8, y: Y(mk.y) - 8, style: 'font-size:11px;fill:var(--text-2);font-weight:600', text: mk.label })); });
    // crosshair
    const xh = s('line', { y1: m.t, y2: m.t + ih, class: 'xh', stroke: 'var(--muted)', 'stroke-dasharray': '3 3', opacity: 0 });
    const dots = series.map(sr => s('circle', { r: 4.5, fill: sr.color, stroke: 'var(--panel-solid)', 'stroke-width': 2, opacity: 0 }));
    svg.append(xh, ...dots);
    const hit = s('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' }); svg.append(hit);
    const orig = o.stacked ? o.series : series;
    hit.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * (W / r.width);
      const xv = x0 + (px - m.l) / iw * (x1 - x0);
      const ref = series[0].data; let k = 0, best = Infinity;
      ref.forEach((d, i) => { const dd = Math.abs(d[0] - xv); if (dd < best) { best = dd; k = i; } });
      const xx = ref[k][0]; xh.setAttribute('x1', X(xx)); xh.setAttribute('x2', X(xx)); xh.setAttribute('opacity', 1);
      series.forEach((sr, i) => { const d = sr.data[k]; if (!d) return; dots[i].setAttribute('cx', X(d[0])); dots[i].setAttribute('cy', Y(d[1])); dots[i].setAttribute('opacity', 1); });
      tip.innerHTML = `<div class="tt">${o.x?.fmt ? o.x.fmt(xx) : o.x?.time === false ? fmt(xx, 0) : new Date(xx).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</div>` +
        orig.map((sr, i) => sr.data[k] ? `<div class="r"><i style="background:${sr.color}"></i>${sr.name}<b>${yf(sr.data[k][1])}${sr.unit ? ' ' + sr.unit : o.y?.unit ? ' ' + o.y.unit : ''}</b></div>` : '').join('') +
        (o.stacked ? `<div class="r" style="margin-top:4px;border-top:1px solid var(--line);padding-top:4px">Total<b>${yf(series.at(-1).data[k][1])}${o.y?.unit ? ' ' + o.y.unit : ''}</b></div>` : '');
      tip.style.left = (X(xx) / W * r.width) + 'px'; tip.style.top = (Math.min(...series.map(sr => sr.data[k] ? Y(sr.data[k][1]) : ih)) / H * r.height + (lg ? lg.offsetHeight + 8 : 0)) + 'px';
      tip.classList.add('show');
    });
    hit.addEventListener('pointerleave', () => { tip.classList.remove('show'); xh.setAttribute('opacity', 0); dots.forEach(d => d.setAttribute('opacity', 0)); });
    holder.replaceChildren(svg);
  };
  const stop = observe(el, draw);
  return { update(next) { state = { ...state, ...next }; if (el.clientWidth) draw(el.clientWidth); }, destroy: stop };
}

/** Grouped / stacked bars. opts: {cats:[label], series:[{name,color,values:[]}], stacked, height, fmt, unit} */
export function barChart(el, opts) {
  el.classList.add('chart'); el.innerHTML = '';
  const lg = legend(opts.series, true); if (lg) el.append(lg);
  const holder = h('div'); el.append(holder); const tip = h('div.chart-tip'); el.append(tip);
  const draw = (W) => {
    const o = opts, H = o.height || 220, m = { l: 48, r: 8, t: 10, b: 26 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const n = o.cats.length, tot = o.cats.map((_, i) => o.stacked ? o.series.reduce((a, sr) => a + sr.values[i], 0) : Math.max(...o.series.map(sr => sr.values[i])));
    const ticks = niceTicks(0, Math.max(...tot) * 1.05, 4), ymax = ticks.at(-1);
    const Y = v => m.t + ih - v / ymax * ih, bw = iw / n, yf = o.fmt || (v => fmt(v, 0));
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, height: H });
    ticks.forEach(t => { svg.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), stroke: 'var(--line)' }), s('text', { x: m.l - 8, y: Y(t) + 4, 'text-anchor': 'end', style: 'font-size:11px;fill:var(--muted)', text: yf(t) })); });
    const inner = Math.min(bw * .72, 44), per = o.stacked ? inner : inner / o.series.length;
    o.cats.forEach((c, i) => {
      const cx = m.l + bw * i + bw / 2; let acc = 0; const g = s('g', { style: 'cursor:default' });
      o.series.forEach((sr, k) => {
        const v = sr.values[i]; const x = o.stacked ? cx - inner / 2 : cx - inner / 2 + per * k;
        const y = o.stacked ? Y(acc + v) : Y(v), hh = o.stacked ? Y(acc) - Y(acc + v) : Y(0) - Y(v);
        const top = !o.stacked || k === o.series.length - 1;
        if (hh > 0.5) g.append(s('path', { d: roundTop(x + 1, y + (o.stacked && k ? 1 : 0), per - 2, Math.max(0, hh - (o.stacked && k ? 1 : 0)), top ? 4 : 0), fill: sr.color, opacity: sr.opacity ?? 1 }));
        acc += v;
      });
      const hit = s('rect', { x: m.l + bw * i, y: m.t, width: bw, height: ih, fill: 'transparent' });
      hit.addEventListener('pointerenter', () => { hit.setAttribute('fill', 'var(--line)'); const r = svg.getBoundingClientRect();
        tip.innerHTML = `<div class="tt">${o.tipTitle ? o.tipTitle(i) : c}</div>` + o.series.map(sr => `<div class="r"><i style="background:${sr.color}"></i>${sr.name}<b>${yf(sr.values[i])}${o.unit ? ' ' + o.unit : ''}</b></div>`).join('') + (o.extra ? o.extra(i) : '');
        tip.style.left = (cx / W * r.width) + 'px'; tip.style.top = (Y(tot[i]) / H * r.height + (lg ? lg.offsetHeight + 8 : 0)) + 'px'; tip.classList.add('show'); });
      hit.addEventListener('pointerleave', () => { hit.setAttribute('fill', 'transparent'); tip.classList.remove('show'); });
      svg.append(hit, g);
      if (n <= 16 || i % Math.ceil(n / 12) === 0) svg.append(s('text', { x: cx, y: H - 7, 'text-anchor': 'middle', style: 'font-size:11px;fill:var(--muted)', text: c }));
    });
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: 'var(--line-2)' }));
    holder.replaceChildren(svg);
  };
  return { destroy: observe(el, draw) };
}
function roundTop(x, y, w, hh, r) { r = Math.min(r, w / 2, hh); return `M${x},${y + hh}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hh}Z`; }

/** Scatter with optional fit line. opts: {points:[[x,y,label]], fit:[[x,y]...], color, xl, yl, height, xf, yf} */
export function scatterChart(el, opts) {
  el.classList.add('chart'); el.innerHTML = ''; const holder = h('div'); el.append(holder); const tip = h('div.chart-tip'); el.append(tip);
  const draw = (W) => {
    const o = opts, H = o.height || 240, m = { l: 50, r: 10, t: 10, b: 36 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const xs = o.points.map(p => p[0]), ys = o.points.map(p => p[1]);
    const xt = niceTicks(Math.min(...xs), Math.max(...xs), 6), yt = niceTicks(Math.min(0, ...ys), Math.max(...ys) * 1.05, 4);
    const X = v => m.l + (v - xt[0]) / (xt.at(-1) - xt[0]) * iw, Y = v => m.t + ih - (v - yt[0]) / (yt.at(-1) - yt[0]) * ih;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, height: H });
    yt.forEach(t => svg.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), stroke: 'var(--line)' }), s('text', { x: m.l - 8, y: Y(t) + 4, 'text-anchor': 'end', style: 'font-size:11px;fill:var(--muted)', text: (o.yf || (v => fmt(v, 0)))(t) })));
    xt.forEach(t => svg.append(s('text', { x: X(t), y: H - 20, 'text-anchor': 'middle', style: 'font-size:11px;fill:var(--muted)', text: fmt(t, 0) })));
    svg.append(s('text', { x: m.l + iw / 2, y: H - 3, 'text-anchor': 'middle', style: 'font-size:11px;fill:var(--muted)', text: o.xl }));
    o.points.forEach(p => { const c = s('circle', { cx: X(p[0]), cy: Y(p[1]), r: 3.2, fill: p[3] || o.color, opacity: .7, stroke: 'var(--panel-solid)', 'stroke-width': 1 });
      c.addEventListener('pointerenter', () => { c.setAttribute('r', 6); const r = svg.getBoundingClientRect(); tip.innerHTML = `<div class="tt">${p[2] || ''}</div><div class="r">${o.xl}<b>${fmt(p[0], 1)}</b></div><div class="r">${o.yl}<b>${(o.yf || (v => fmt(v, 0)))(p[1])}</b></div>`; tip.style.left = X(p[0]) / W * r.width + 'px'; tip.style.top = Y(p[1]) / H * r.height + 'px'; tip.classList.add('show'); });
      c.addEventListener('pointerleave', () => { c.setAttribute('r', 3.2); tip.classList.remove('show'); }); svg.append(c); });
    if (o.fit) svg.append(s('path', { d: o.fit.map(([x, y], i) => (i ? 'L' : 'M') + X(x) + ',' + Y(y)).join(''), fill: 'none', stroke: o.fitColor || 'var(--text-2)', 'stroke-width': 2.2, 'stroke-dasharray': '6 4' }));
    if (o.cp) { svg.append(s('line', { x1: X(o.cp), x2: X(o.cp), y1: m.t, y2: m.t + ih, stroke: 'var(--muted)', 'stroke-dasharray': '2 4' }), s('text', { x: X(o.cp) + 5, y: m.t + 12, style: 'font-size:10.5px;fill:var(--muted)', text: `change-point ${fmt(o.cp, 0)}°F` })); }
    holder.replaceChildren(svg);
  };
  return { destroy: observe(el, draw) };
}

/** Sparkline into an existing element */
export function spark(el, values, color = 'var(--accent)', { fill = true, h: H = 34 } = {}) {
  const W = 200; if (!values.length) { el.innerHTML = ''; return; }
  let mn = Math.min(...values), mx = Math.max(...values); if (mx - mn < 1e-6) { mx += .5; mn -= .5; }
  const pts = values.map((v, i) => [i / (values.length - 1 || 1) * W, H - 3 - (v - mn) / (mx - mn) * (H - 6)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="${H}">${fill ? `<path d="${d}L${W},${H}L0,${H}Z" fill="${color}" opacity=".12"/>` : ''}<path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" vector-effect="non-scaling-stroke"/><circle cx="${pts.at(-1)[0]}" cy="${pts.at(-1)[1]}" r="2.5" fill="${color}"/></svg>`;
}

/** Arc gauge (270°) returns svg string */
export function gauge({ value, min = 0, max = 100, label = '', unit = '', color = 'var(--accent)', bands = [], dec = 0, size = 160, target }) {
  const r = 62, cx = 80, cy = 80, a0 = -225, a1 = 45, t = clamp((value - min) / (max - min), 0, 1);
  const P = (a, rr = r) => [cx + rr * Math.cos(a * Math.PI / 180), cy + rr * Math.sin(a * Math.PI / 180)];
  const arc = (from, to, rr = r) => { const [x0, y0] = P(from, rr), [x1, y1] = P(to, rr); return `M${x0},${y0}A${rr},${rr} 0 ${to - from > 180 ? 1 : 0} 1 ${x1},${y1}`; };
  const av = a0 + (a1 - a0) * t;
  const bandPaths = bands.map(b => `<path d="${arc(a0 + (a1 - a0) * (b.from - min) / (max - min), a0 + (a1 - a0) * (b.to - min) / (max - min), r + 10)}" stroke="${b.color}" stroke-width="3" fill="none" opacity=".8"/>`).join('');
  const tg = target != null ? (() => { const a = a0 + (a1 - a0) * clamp((target - min) / (max - min), 0, 1); const [x0, y0] = P(a, r - 9), [x1, y1] = P(a, r + 9); return `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="var(--text)" stroke-width="2.5"/>`; })() : '';
  return `<svg viewBox="0 0 160 150" width="100%" style="max-width:${size}px;display:block;margin:auto" role="img" aria-label="${label} ${fmt(value, dec)} ${unit}">
    <path d="${arc(a0, a1)}" stroke="var(--line-2)" stroke-width="11" fill="none" stroke-linecap="round"/>
    <path d="${arc(a0, Math.max(a0 + .5, av))}" stroke="${color}" stroke-width="11" fill="none" stroke-linecap="round" style="transition:all 1s"/>
    ${bandPaths}${tg}
    <text x="80" y="82" text-anchor="middle" style="font:650 26px var(--mono);fill:var(--text)">${fmt(value, dec)}</text>
    <text x="80" y="101" text-anchor="middle" style="font:500 11px var(--font);fill:var(--muted)">${unit}</text>
    <text x="80" y="140" text-anchor="middle" style="font:600 10.5px var(--font);fill:var(--muted);letter-spacing:.08em;text-transform:uppercase">${label}</text></svg>`;
}
