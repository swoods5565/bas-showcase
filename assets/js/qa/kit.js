// Vector-library-style symbol kit.
// Look-alike pieces drawn in the shaded, oblique-3D style of commercial BAS vector libraries
// (box ducts with white rails and black corner caps, cutaway coils, belt-drive blowers,
// gear-driven dampers, base-mounted pumps, copper valves with orange actuators).
// Every function returns an SVG string for the 1920 × 1080 equipment canvas.
// Animated parts carry data attributes that the page update loops drive:
//   data-qrot   spinning wheel / impeller (uses the shared .rotor CSS)
//   data-qglow  coil / heat-exchanger glow (opacity follows the stage or valve %)
//   data-qblade damper blades (scale follows position)
//   data-qdirt  filter loading overlay
//   data-qp     flow dashes inside a pipe run
import { store } from '../util.js';

// Oblique projection used by every 3D piece: depth recedes up and to the right.
const DX = .7, DY = -.55;

// Piping service colors, as [dark edge, highlight].
export const SVC = {
  chws: ['#0b5fa5', '#6cc8ff'], chwr: ['#0a2f6b', '#3c78d8'],
  hws: ['#b5382f', '#ffb0a4'], hwr: ['#5c0d0d', '#c43a32'],
  cws: ['#139346', '#7ff2a6'], cwr: ['#0a4f22', '#2fae5a'],
  gas: ['#b88a00', '#ffe866'], cu: ['#6e3a1b', '#e3a172'], metal: ['#4a4e55', '#d4d9e0'],
};
const TONE = {
  duct: { front: '#8f9398', top: '#b9bdc2', side: '#6d7176' },
  dark: { front: '#55595f', top: '#787c82', side: '#3e4146' },
  tan: { front: '#cdb894', top: '#e2d2b0', side: '#a99571' },
  cream: { front: '#e8dcc6', top: '#f4ecdd', side: '#c7b99f' },
  blue: { front: '#2f68d0', top: '#5a8ef0', side: '#2150a8' },
  teal: { front: '#4fa79a', top: '#7cc8bb', side: '#3a8478' },
  beige: { front: '#d8cfba', top: '#ebe4d3', side: '#b3a98f' },
};

const pts = (a) => a.map(p => p.join(',')).join(' ');

/** Shared gradients and patterns. Put once inside <defs>. */
export function defs() {
  const lin = (id, x2, y2, stops) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</linearGradient>`;
  const tube = ([d, l]) => [[0, d], [.32, l], [.55, mix(d, l)], [1, d]];
  let out = '';
  for (const [k, c] of Object.entries(SVC)) {
    out += lin('qa-h-' + k, 0, 1, tube(c)) + lin('qa-v-' + k, 1, 0, tube(c));
    out += `<radialGradient id="qa-r-${k}" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="${c[1]}"/><stop offset=".55" stop-color="${mix(c[0], c[1])}"/><stop offset="1" stop-color="${c[0]}"/></radialGradient>`;
  }
  out += lin('qa-rail-h', 0, 1, [[0, '#ffffff'], [.6, '#e1e3e6'], [1, '#a9adb3']]);
  out += lin('qa-rail-v', 1, 0, [[0, '#ffffff'], [.6, '#e1e3e6'], [1, '#a9adb3']]);
  out += lin('qa-steel-h', 0, 1, [[0, '#5d6168'], [.35, '#e9ecef'], [.6, '#9ba0a7'], [1, '#4b4f55']]);
  out += lin('qa-steel-v', 1, 0, [[0, '#5d6168'], [.35, '#e9ecef'], [.6, '#9ba0a7'], [1, '#4b4f55']]);
  out += lin('qa-copper-v', 1, 0, [[0, '#5a2c12'], [.35, '#f0b27d'], [.6, '#b4632f'], [1, '#5a2c12']]);
  out += lin('qa-copper-h', 0, 1, [[0, '#5a2c12'], [.35, '#f0b27d'], [.6, '#b4632f'], [1, '#5a2c12']]);
  out += lin('qa-act', 0, 1, [[0, '#ff9a5c'], [.45, '#f26b2a'], [1, '#c4501a']]);
  out += lin('qa-housing', 0, 1, [[0, '#5b5f66'], [1, '#2f3237']]);
  out += lin('qa-glass', 0, 1, [[0, '#cfe9ff'], [1, '#7bb7e8']]);
  out += lin('qa-flue', 1, 0, [[0, '#6b6f75'], [.4, '#d7dbe0'], [1, '#5b5f66']]);
  out += `<radialGradient id="qa-scroll" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#d9dce0"/><stop offset=".7" stop-color="#8e9298"/><stop offset="1" stop-color="#55595f"/></radialGradient>`;
  out += `<radialGradient id="qa-hub" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#f4f5f6"/><stop offset="1" stop-color="#5d6168"/></radialGradient>`;
  out += `<pattern id="qa-fins" width="7" height="10" patternUnits="userSpaceOnUse"><rect width="7" height="10" fill="#55595e"/><path d="M0 0 V10" stroke="#9aa0a6" stroke-width="2"/></pattern>`;
  out += `<pattern id="qa-diamond" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="#2b2c2e"/><path d="M3 15 L9 9 M12 6 L16 2" stroke="#c97a45" stroke-width="2.4" stroke-linecap="round"/><path d="M3 3 L7 7 M11 11 L15 15" stroke="#8f4f27" stroke-width="2" stroke-linecap="round"/></pattern>`;
  out += `<pattern id="qa-pleat" width="14" height="22" patternUnits="userSpaceOnUse"><rect width="14" height="22" fill="#e9ebee"/><path d="M0 0 L7 22 L14 0" fill="none" stroke="#a9aeb5" stroke-width="2"/></pattern>`;
  out += `<pattern id="qa-louver" width="20" height="14" patternUnits="userSpaceOnUse"><rect width="20" height="14" fill="#7e8288"/><path d="M0 2 H20" stroke="#d6d9dd" stroke-width="3"/><path d="M0 5 H20" stroke="#4a4d52" stroke-width="2"/></pattern>`;
  out += `<pattern id="qa-grille" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#3a3d42"/><path d="M0 6 H12 M6 0 V12" stroke="#6e7278" stroke-width="2"/></pattern>`;
  out += `<filter id="qa-shadow" x="-10%" y="-10%" width="130%" height="140%"><feDropShadow dx="6" dy="10" stdDeviation="8" flood-color="#000" flood-opacity=".28"/></filter>`;
  return out;
}
function mix(a, b) {
  const p = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round((v + y[i]) / 2).toString(16).padStart(2, '0')).join('');
}

/** Rectangular box duct / casing with depth, white frame rails and black corner caps. */
export function box(x, y, w, h, { d = 56, tone = 'duct', rails = true, sections = [], open = '', shadow = true } = {}) {
  const t = TONE[tone] || tone, dx = d * DX, dy = d * DY;
  const top = [[x, y], [x + dx, y + dy], [x + w + dx, y + dy], [x + w, y]];
  const side = [[x + w, y], [x + w + dx, y + dy], [x + w + dx, y + h + dy], [x + w, y + h]];
  let s = `<g${shadow ? ' filter="url(#qa-shadow)"' : ''}><polygon points="${pts(top)}" fill="${t.top}"/>${open.includes('r') ? '' : `<polygon points="${pts(side)}" fill="${t.side}"/>`}<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${t.front}"/></g>`;
  if (rails) {
    const r = 7, c = 13;
    const hr = (xx, yy, ww) => `<rect x="${xx}" y="${yy - r / 2}" width="${ww}" height="${r}" fill="url(#qa-rail-h)"/>`;
    const vr = (xx, yy, hh) => `<rect x="${xx - r / 2}" y="${yy}" width="${r}" height="${hh}" fill="url(#qa-rail-v)"/>`;
    const cap = (xx, yy) => `<rect x="${xx - c / 2}" y="${yy - c / 2}" width="${c}" height="${c}" rx="2" fill="#1d1e20"/>`;
    s += `<path d="M${x + dx} ${y + dy} H${x + w + dx}${open.includes('r') ? '' : ` V${y + h + dy}`}" stroke="#cfd2d6" stroke-width="5" fill="none"/>`;
    s += `<path d="M${x} ${y} L${x + dx} ${y + dy} M${x + w} ${y} L${x + w + dx} ${y + dy}${open.includes('r') ? '' : ` M${x + w} ${y + h} L${x + w + dx} ${y + h + dy}`}" stroke="#d9dce0" stroke-width="5"/>`;
    s += hr(x, y, w) + hr(x, y + h, w) + (open.includes('l') ? '' : vr(x, y, h)) + (open.includes('r') ? '' : vr(x + w, y, h));
    sections.forEach(sx => { s += vr(sx, y, h); });
    s += [[x, y], [x + w, y], [x, y + h], [x + w, y + h], [x + dx, y + dy], [x + w + dx, y + dy]].filter(([xx]) => !(open.includes('l') && xx === x) && !(open.includes('r') && xx >= x + w)).map(([a, b]) => cap(a, b)).join('');
    sections.forEach(sx => { s += cap(sx, y) + cap(sx, y + h); });
  }
  return s;
}

/** Round duct (tube) running horizontally, cx..cx+len, centered on cy. */
export function tubeH(x, cy, len, r) {
  return `<g><rect x="${x}" y="${cy - r}" width="${len}" height="${2 * r}" fill="url(#qa-steel-h)"/><ellipse cx="${x + len}" cy="${cy}" rx="${r * .28}" ry="${r}" fill="#a3a8ae" stroke="#e9ecef" stroke-width="3"/><path d="M${x + len * .33} ${cy - r} v${2 * r} M${x + len * .66} ${cy - r} v${2 * r}" stroke="#ffffff" stroke-opacity=".35" stroke-width="3"/></g>`;
}

/** Orthogonal pipe run built from shaded tube segments. points: [[x,y],…] */
export function pipe(points, svc, { w = 18, key, flanges = false } = {}) {
  let s = '<g>';
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    if (a[1] === b[1]) s += `<rect x="${Math.min(a[0], b[0])}" y="${a[1] - w / 2}" width="${Math.abs(b[0] - a[0])}" height="${w}" fill="url(#qa-h-${svc})"/>`;
    else s += `<rect x="${a[0] - w / 2}" y="${Math.min(a[1], b[1])}" width="${w}" height="${Math.abs(b[1] - a[1])}" fill="url(#qa-v-${svc})"/>`;
  }
  for (let i = 1; i < points.length - 1; i++) { const [x, y] = points[i]; s += `<rect x="${x - w * .62}" y="${y - w * .62}" width="${w * 1.24}" height="${w * 1.24}" rx="${w * .45}" fill="url(#qa-r-${svc})"/>`; }
  if (flanges) [points[0], points[points.length - 1]].forEach(([x, y], i) => {
    const [px, py] = i ? points[points.length - 2] : points[1];
    s += px === x ? `<rect x="${x - w * .85}" y="${y - 4}" width="${w * 1.7}" height="8" rx="2" fill="url(#qa-h-${svc})"/>` : `<rect x="${x - 4}" y="${y - w * .85}" width="8" height="${w * 1.7}" rx="2" fill="url(#qa-v-${svc})"/>`;
  });
  if (key) s += `<path class="pipe-core qa-core" data-qp="${key}" d="M${points.map(p => p.join(' ')).join(' L')}" fill="none"/>`;
  return s + '</g>';
}

/** Coil slab seen inside a duct: copper headers, fin block receding into the duct, glow overlay. */
export function coil(x, y, h, { kind = 'cool', w = 22, d = 56, key = '' } = {}) {
  const dx = d * DX, dy = d * DY;
  const side = [[x + w, y], [x + w + dx, y + dy], [x + w + dx, y + h + dy], [x + w, y + h]];
  const glow = { cool: '#2f8bff', heat: '#ff3b25', dx: '#2f8bff', gas: '#ff3b25', elec: '#ff9a1f', steam: '#ffd21f' }[kind];
  let s = `<g><polygon points="${pts(side)}" fill="url(#qa-fins)"/>`;
  s += `<polygon points="${pts(side)}" fill="${glow}" opacity="0" data-qglow="${key}" class="qa-glow"/>`;
  if (kind === 'gas') {
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#2f3135"/>` + Array.from({ length: Math.floor(h / 26) }, (_, i) => `<path d="M${x + 4} ${y + 14 + i * 26} h${w - 8}" stroke="#d8dbe0" stroke-width="6" stroke-linecap="round"/><circle cx="${x + w / 2}" cy="${y + 14 + i * 26}" r="3" fill="#ff7a2f" data-qflame="${key}" opacity="0"/>`).join('');
    s += `<rect x="${x - 8}" y="${y + h * .55}" width="24" height="44" rx="4" fill="#6b6f75" stroke="#2a2c30"/><circle cx="${x + 4}" cy="${y + h * .55 + 22}" r="8" fill="url(#qa-hub)"/>`;
  } else if (kind === 'dx') {
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#3a3c40"/><rect x="${x + 3}" y="${y}" width="9" height="${h}" fill="url(#qa-steel-v)"/>`;
    s += Array.from({ length: 9 }, (_, i) => `<path d="M${x + 8} ${y + h * .45} Q${x + w * .7} ${y + h * .45 + (i - 4) * h / 16} ${x + w} ${y + h * .1 + i * h * .1}" stroke="#d7dadf" stroke-width="1.6" fill="none"/>`).join('');
    s += `<circle cx="${x + 8}" cy="${y + h * .45}" r="7" fill="url(#qa-hub)" stroke="#2a2c30"/>`;
  } else {
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#qa-diamond)"/>`;
    s += `<rect x="${x - 6}" y="${y - 4}" width="11" height="${h + 8}" rx="5" fill="url(#qa-copper-v)"/><rect x="${x + w - 6}" y="${y - 4}" width="11" height="${h + 8}" rx="5" fill="url(#qa-copper-v)"/>`;
    s += `<circle cx="${x}" cy="${y + 12}" r="8" fill="#141516"/><circle cx="${x + w}" cy="${y + h - 12}" r="8" fill="#141516"/>`;
  }
  return s + '</g>';
}

/** Vertical damper slab (blades stacked vertically, seen at an angle). */
export function damper(x, y, h, { n = 6, key = '', w = 18, d = 56, gears = true, actuator = 'top' } = {}) {
  const dx = d * DX, dy = d * DY, p = h / n;
  let s = `<g><polygon points="${pts([[x + w, y], [x + w + dx, y + dy], [x + w + dx, y + h + dy], [x + w, y + h]])}" fill="#2c2e31" opacity=".55"/>`;
  for (let i = 0; i < n; i++) {
    const y0 = y + i * p + 3, y1 = y0 + p - 6;
    s += `<polygon class="qa-blade" data-qblade="${key}" points="${pts([[x + w, y0], [x + w + dx, y0 + dy], [x + w + dx, y1 + dy], [x + w, y1]])}" fill="url(#qa-blade-g)" stroke="#5c6066" stroke-width="1"/>`;
  }
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#26282b"/>`;
  if (gears) for (let i = 0; i < n; i++) { const cy = y + i * p + p / 2; s += `<circle cx="${x + w / 2}" cy="${cy}" r="${Math.min(w, p) * .42}" fill="#6d7177" stroke="#3a3c40" stroke-width="3" stroke-dasharray="3 2"/><circle cx="${x + w / 2}" cy="${cy}" r="2.5" fill="#1d1e20"/>`; }
  s += `<rect x="${x + w + dx - 4}" y="${y + dy}" width="5" height="${h}" fill="#26282b"/>`;
  if (actuator) s += act(x - 34, actuator === 'top' ? y - 58 : y + h + 6);
  return s + '</g>';
}
/** Horizontal damper (blades side by side), for a vertical airflow path. */
export function damperH(x, y, w, { n = 6, key = '', t = 18, d = 56, actuator = true } = {}) {
  const dx = d * DX, dy = d * DY, p = w / n;
  let s = `<g><polygon points="${pts([[x, y], [x + dx, y + dy], [x + w + dx, y + dy], [x + w, y]])}" fill="#2c2e31" opacity=".5"/>`;
  for (let i = 0; i < n; i++) {
    const x0 = x + i * p + 3, x1 = x0 + p - 6;
    s += `<polygon class="qa-blade qa-blade-h" data-qblade="${key}" points="${pts([[x0, y], [x0 + dx, y + dy], [x1 + dx, y + dy], [x1, y]])}" fill="url(#qa-blade-g)" stroke="#5c6066" stroke-width="1"/>`;
  }
  s += `<rect x="${x}" y="${y}" width="${w}" height="${t}" fill="#26282b"/>`;
  for (let i = 0; i < n; i++) s += `<circle cx="${x + i * p + p / 2}" cy="${y + t / 2}" r="${Math.min(t, p) * .4}" fill="#6d7177" stroke="#3a3c40" stroke-width="3" stroke-dasharray="3 2"/>`;
  if (actuator) s += act(x + w + 8, y - 20);
  return s + '</g>';
}
/** Orange damper/valve actuator. */
export function act(x, y, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="6" y="30" width="44" height="20" rx="3" fill="#b9bdc2" stroke="#7d8187"/><rect x="0" y="0" width="56" height="34" rx="5" fill="url(#qa-act)"/><rect x="0" y="0" width="56" height="7" rx="3" fill="#ffb27f"/><circle cx="12" cy="20" r="3.5" fill="#1d1e20"/><circle cx="44" cy="22" r="3" fill="#1d1e20"/><rect x="24" y="14" width="10" height="10" rx="2" fill="#d65b1f"/></g>`;
}

/** Pleated filter slab with a loading (dirt) overlay. */
export function filter(x, y, h, { w = 18, d = 56, key = '' } = {}) {
  const dx = d * DX, dy = d * DY;
  const side = [[x + w, y], [x + w + dx, y + dy], [x + w + dx, y + h + dy], [x + w, y + h]];
  return `<g><polygon points="${pts(side)}" fill="url(#qa-pleat)"/><polygon points="${pts(side)}" fill="#6b5232" opacity="0" data-qdirt="${key}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#2a2c2f"/><rect x="${x + w + dx - 5}" y="${y + dy}" width="6" height="${h}" fill="#2a2c2f"/><path d="M${x + w} ${y} L${x + w + dx} ${y + dy} M${x + w} ${y + h} L${x + w + dx} ${y + h + dy}" stroke="#2a2c2f" stroke-width="6"/></g>`;
}

/** Belt-drive blower (housing, spinning wheel, motor and belt). Centered on the wheel. */
export function blower(cx, cy, r, { key = '', motor = 'right' } = {}) {
  const H = r * 1.38, m = motor === 'right' ? 1 : -1;
  let s = `<g filter="url(#qa-shadow)"><rect x="${cx - H}" y="${cy - H}" width="${2 * H}" height="${2 * H}" rx="6" fill="url(#qa-housing)"/>
    <rect x="${cx - H + 10}" y="${cy - H + 10}" width="${2 * H - 20}" height="${2 * H - 20}" rx="4" fill="none" stroke="#7b7f86" stroke-width="3"/>
    <path d="M${cx + H} ${cy - H} l${r * .22} ${-r * .17} v${2 * H} l${-r * .22} ${r * .17}z" fill="#25272b"/></g>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${r * 1.12}" fill="url(#qa-scroll)"/><circle cx="${cx}" cy="${cy}" r="${r * 1.0}" fill="#3a3d42"/>`;
  s += `<g class="rotor" data-qrot="${key}">${Array.from({ length: 22 }, (_, i) => `<path d="M${cx + r * .42} ${cy} q${r * .25} ${-r * .08} ${r * .55} ${-r * .3}" transform="rotate(${i * 360 / 22} ${cx} ${cy})" stroke="#f1f2f4" stroke-width="${r * .085}" fill="none" stroke-linecap="round"/>`).join('')}
    <circle cx="${cx}" cy="${cy}" r="${r * .44}" fill="none" stroke="#c9ccd1" stroke-width="${r * .06}"/><circle cx="${cx}" cy="${cy}" r="${r * .2}" fill="url(#qa-hub)" stroke="#3a3d42" stroke-width="2"/>
    <path d="M${cx} ${cy - r * .2} v${r * .4}" stroke="#3a3d42" stroke-width="3"/></g>`;
  const mx = cx + m * r * .95, my = cy + r * .95;
  s += `<path d="M${cx - r * .17 * m} ${cy - r * .05} L${mx - r * .12 * m} ${my - r * .14} M${cx + r * .17 * m} ${cy + r * .05} L${mx + r * .12 * m} ${my + r * .12}" stroke="#16171a" stroke-width="${r * .06}"/>`;
  s += `<g><rect x="${mx - r * .5}" y="${my - r * .26}" width="${r}" height="${r * .52}" rx="${r * .1}" fill="url(#qa-steel-h)"/>${[-.3, -.15, 0, .15, .3].map(k => `<path d="M${mx + k * r} ${my - r * .26} v${r * .52}" stroke="#6b6f75" stroke-width="2"/>`).join('')}
    <ellipse cx="${mx - m * r * .5}" cy="${my}" rx="${r * .09}" ry="${r * .26}" fill="#9a9fa6"/><circle cx="${mx - m * r * .5}" cy="${my}" r="${r * .1}" fill="url(#qa-hub)"/>
    <rect x="${mx - r * .55}" y="${my + r * .24}" width="${r * 1.1}" height="${r * .12}" fill="#2a2c30"/></g>`;
  return s;
}

/** Condenser / tower fan seen from above at an angle (ellipse with a spinning rotor). */
export function topFan(cx, cy, rx, { key = '', ry = rx * .24 } = {}) {
  return `<g><ellipse cx="${cx}" cy="${cy + ry * .35}" rx="${rx * 1.06}" ry="${ry * 1.12}" fill="#2a2c30"/><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#45484e" stroke="#9ca1a8" stroke-width="3"/>
    <g transform="translate(${cx} ${cy}) scale(1 ${ry / rx})"><g class="rotor" data-qrot="${key}">${[0, 72, 144, 216, 288].map(a => `<path d="M0 0 C${rx * .25} ${-rx * .12} ${rx * .7} ${-rx * .18} ${rx * .9} ${-rx * .02} C${rx * .62} ${rx * .1} ${rx * .25} ${rx * .1} 0 0z" transform="rotate(${a})" fill="#c3c7cd" stroke="#6b6f75" stroke-width="2"/>`).join('')}<circle r="${rx * .12}" fill="url(#qa-hub)"/></g></g>
    <path d="M${cx - rx} ${cy} H${cx + rx} M${cx} ${cy - ry} V${cy + ry}" stroke="#202225" stroke-width="2" opacity=".6"/></g>`;
}

/** Base-mounted end-suction pump (side view). color: blue | green | red */
export function pump(x, y, { color = 'blue', dir = 'right', key = '', s = 1 } = {}) {
  const C = { blue: ['#0d5fc4', '#4fb2ff', '#7cc8ff'], green: ['#0a8a2a', '#3fdc5f', '#8cf2a0'], red: ['#8f1414', '#e0393c', '#ff8a8a'] }[color];
  const id = `qa-pm-${color}`;
  const flip = dir === 'left' ? `translate(${x} ${y}) scale(${-s} ${s})` : `translate(${x} ${y}) scale(${s})`;
  return `<g transform="${flip}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C[0]}"/><stop offset=".35" stop-color="${C[2]}"/><stop offset=".6" stop-color="${C[1]}"/><stop offset="1" stop-color="${C[0]}"/></linearGradient></defs>
    <rect x="-70" y="30" width="150" height="12" rx="2" fill="${C[1]}" stroke="${C[0]}"/><rect x="-62" y="42" width="134" height="6" fill="${C[0]}"/>
    <rect x="-64" y="-20" width="78" height="46" rx="10" fill="url(#${id})"/>${[-50, -38, -26, -14, -2].map(xx => `<path d="M${xx} -20 v46" stroke="${C[0]}" stroke-opacity=".5" stroke-width="2"/>`).join('')}
    <rect x="-24" y="-30" width="22" height="12" rx="2" fill="${C[0]}"/><rect x="-26" y="-12" width="10" height="20" rx="2" fill="#ffffff" opacity=".85"/>
    <rect x="14" y="-6" width="18" height="18" fill="url(#qa-steel-h)"/>
    <circle cx="48" cy="2" r="27" fill="url(#${id})" stroke="${C[0]}" stroke-width="2"/>
    <rect x="38" y="-44" width="20" height="22" fill="url(#${id})"/><rect x="33" y="-50" width="30" height="8" rx="2" fill="${C[0]}"/>
    <rect x="72" y="-10" width="16" height="22" fill="url(#${id})"/><rect x="86" y="-15" width="8" height="32" rx="2" fill="${C[0]}"/>
    <g class="rotor" data-qrot="${key}">${[0, 60, 120, 180, 240, 300].map(a => `<path d="M48 2 L64 -3 L64 7Z" transform="rotate(${a} 48 2)" fill="#ffffff" opacity=".7"/>`).join('')}<circle cx="48" cy="2" r="5" fill="${C[0]}"/></g>
    <circle cx="-64" cy="3" r="20" fill="${C[0]}"/><g class="rotor" data-qrot="${key}">${[0, 90, 180, 270].map(a => `<rect x="-66" y="-14" width="4" height="34" transform="rotate(${a} -64 3)" fill="${C[2]}"/>`).join('')}</g>
  </g>`;
}

/** Water-cooled chiller: condenser + evaporator barrels, compressor on top, control panel. */
export function chiller(x, y, { key = '', tone = 'beige', len = 380 } = {}) {
  const t = TONE[tone];
  const id = 'qa-ch-' + tone;
  const barrel = (yy, r) => `<g><rect x="${x}" y="${yy - r}" width="${len}" height="${2 * r}" rx="6" fill="url(#${id})"/>
    <ellipse cx="${x}" cy="${yy}" rx="${r * .32}" ry="${r}" fill="${t.side}" stroke="${t.front}" stroke-width="3"/><ellipse cx="${x + len}" cy="${yy}" rx="${r * .32}" ry="${r}" fill="${t.side}" stroke="${t.front}" stroke-width="3"/>
    ${[.12, .88].map(k => `<rect x="${x + len * k - 5}" y="${yy - r - 2}" width="10" height="${2 * r + 4}" rx="3" fill="${t.side}" opacity=".7"/>`).join('')}</g>`;
  const cY = y + 34, eY = y + 112;
  return `<g filter="url(#qa-shadow)"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.side}"/><stop offset=".3" stop-color="${t.top}"/><stop offset=".65" stop-color="${t.front}"/><stop offset="1" stop-color="${t.side}"/></linearGradient></defs>
    <rect x="${x + 30}" y="${y + 150}" width="${len - 60}" height="16" fill="#3b3e43"/>${[x + 50, x + len - 70].map(xx => `<rect x="${xx}" y="${y + 112}" width="20" height="44" fill="#4a4d52"/>`).join('')}
    ${barrel(cY, 30)}${barrel(eY, 38)}
    <rect x="${x + 90}" y="${eY - 22}" width="${len - 150}" height="44" rx="4" fill="#2f6bff" opacity="0" data-qglow="${key}" class="qa-glow qa-pulse"/>
    <g><rect x="${x + 110}" y="${y - 40}" width="150" height="56" rx="14" fill="url(#qa-steel-h)"/><rect x="${x + 250}" y="${y - 30}" width="56" height="40" rx="8" fill="#7c8188"/><circle cx="${x + 140}" cy="${y - 12}" r="16" fill="#5c6067"/>
    <rect x="${x + 180}" y="${y + 4}" width="26" height="26" fill="#6c7076"/></g>
    <g><rect x="${x + len - 70}" y="${y - 54}" width="64" height="72" rx="4" fill="${t.front}" stroke="${t.side}" stroke-width="2"/><rect x="${x + len - 60}" y="${y - 44}" width="40" height="22" rx="2" fill="#163a2a"/><text x="${x + len - 40}" y="${y - 28}" text-anchor="middle" style="font:700 12px var(--mono);fill:#5dff9a" data-qscreen="${key}">OFF</text><circle cx="${x + len - 52}" cy="${y + 2}" r="5" fill="#30353b" data-qled="${key}"/></g></g>`;
}

/** Cooling tower (packaged, induced draft) with fan deck. Returns its basin outlet at (x+40, y+h). */
export function tower(x, y, { key = '', w = 220, h = 200 } = {}) {
  let s = box(x, y, w, h, { d: 70, tone: 'cream', rails: false });
  s += `<rect x="${x + 12}" y="${y + h * .42}" width="${w - 24}" height="${h * .5}" fill="url(#qa-louver)" opacity=".75"/>`;
  s += Array.from({ length: 4 }, (_, i) => `<path d="M${x + (i + 1) * w / 5} ${y} v${h}" stroke="#c7b99f" stroke-width="2"/>`).join('');
  s += `<g data-qrain="${key}" opacity="0">${Array.from({ length: 12 }, (_, i) => `<line x1="${x + 20 + i * (w - 40) / 11}" y1="${y + h * .45}" x2="${x + 20 + i * (w - 40) / 11}" y2="${y + h * .45 + 12}" stroke="#3c8de0" stroke-width="3" stroke-linecap="round"><animate attributeName="y1" values="${y + h * .45};${y + h * .9}" dur="${.8 + (i % 4) * .15}s" repeatCount="indefinite"/><animate attributeName="y2" values="${y + h * .45 + 12};${y + h * .9 + 12}" dur="${.8 + (i % 4) * .15}s" repeatCount="indefinite"/></line>`).join('')}</g>`;
  const fx = x + w / 2 + 28, fy = y - 30;
  s += `<path d="M${fx - 78} ${fy} V${fy - 24} H${fx + 78} V${fy}" fill="#8b9096"/><ellipse cx="${fx}" cy="${fy - 24}" rx="78" ry="19" fill="#b4b8be"/>`;
  s += topFan(fx, fy - 24, 66, { key });
  s += `<rect x="${x + 6}" y="${y + h - 4}" width="${w - 12}" height="14" fill="#a99a80"/><circle cx="${x + w - 30}" cy="${y + h - 26}" r="10" fill="url(#qa-hub)"/>`;
  return s;
}

/** Packaged condensing boiler with a cutaway window onto the glowing heat exchanger. */
export function boiler(x, y, { key = '', w = 220, h = 330, tone = 'blue' } = {}) {
  let s = box(x, y, w, h, { d: 60, tone, rails: false });
  s += `<rect x="${x + 110}" y="${y - 200}" width="34" height="${200 - 30}" fill="url(#qa-flue)"/><ellipse cx="${x + 127}" cy="${y - 200}" rx="17" ry="6" fill="#3e4146"/>`;
  s += `<g data-qplume="${key}" opacity="0">${[0, 1, 2].map(i => `<circle cx="${x + 127}" cy="${y - 214}" r="${10 + i * 6}" fill="#b9bdc2" opacity=".35"><animate attributeName="cy" values="${y - 210};${y - 280}" dur="${2.4 + i * .6}s" repeatCount="indefinite" begin="${i * .7}s"/><animate attributeName="opacity" values=".45;0" dur="${2.4 + i * .6}s" repeatCount="indefinite" begin="${i * .7}s"/></circle>`).join('')}</g>`;
  s += `<rect x="${x + 22}" y="${y - 62}" width="66" height="40" rx="6" fill="#3a3d42"/><circle cx="${x + 55}" cy="${y - 42}" r="13" fill="url(#qa-hub)"/>`;
  const wx = x + 34, wy = y + 120, ww = w - 68, wh = 150;
  s += `<rect x="${wx - 6}" y="${wy - 6}" width="${ww + 12}" height="${wh + 12}" rx="10" fill="#1a2a4a"/><rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="8" fill="#e9ecef"/>`;
  s += `<rect x="${wx + 18}" y="${wy + 14}" width="${ww - 36}" height="${wh - 28}" rx="${(ww - 36) * .2}" fill="url(#qa-copper-h)"/>`;
  s += Array.from({ length: 9 }, (_, i) => `<path d="M${wx + 18} ${wy + 24 + i * 13} h${ww - 36}" stroke="#4a2410" stroke-width="3" opacity=".7"/>`).join('');
  s += `<rect x="${wx + 18}" y="${wy + 14}" width="${ww - 36}" height="${wh - 28}" rx="${(ww - 36) * .2}" fill="#ff4a1f" opacity="0" data-qglow="${key}" class="qa-glow qa-pulse"/>`;
  s += `<rect x="${x + 30}" y="${y + 30}" width="80" height="44" rx="4" fill="#0f1c33"/><text x="${x + 70}" y="${y + 58}" text-anchor="middle" style="font:700 16px var(--mono);fill:#5dff9a" data-qscreen="${key}">OFF</text>`;
  return s;
}

/** Copper two-way valve body with an orange electric actuator. orient: 'h' (pipe horizontal) or 'v'. */
export function valve(x, y, { orient = 'v', s = 1 } = {}) {
  const body = orient === 'v'
    ? `<rect x="-12" y="-22" width="24" height="44" fill="url(#qa-copper-v)"/><rect x="-18" y="-12" width="36" height="24" rx="6" fill="url(#qa-copper-h)"/><circle r="11" fill="url(#qa-r-cu)"/>`
    : `<rect x="-22" y="-12" width="44" height="24" fill="url(#qa-copper-h)"/><rect x="-12" y="-18" width="24" height="36" rx="6" fill="url(#qa-copper-v)"/><circle r="11" fill="url(#qa-r-cu)"/>`;
  return `<g transform="translate(${x} ${y}) scale(${s})">${body}<rect x="-6" y="-40" width="12" height="20" fill="#9aa0a6"/>${act(-28, -86, 1)}</g>`;
}

/** Strap-on / immersion water temperature sensor (white well housing). */
export function waterTemp(x, y) {
  return `<g transform="translate(${x} ${y})"><rect x="-22" y="-34" width="44" height="26" rx="8" fill="url(#qa-steel-h)"/><circle cx="0" cy="-21" r="7" fill="#33363b"/><rect x="-4" y="-10" width="8" height="18" fill="url(#qa-steel-v)"/></g>`;
}
/** Inline flow meter with a blue transmitter head. */
export function flowMeter(x, y) {
  return `<g transform="translate(${x} ${y})"><rect x="-6" y="-46" width="12" height="30" fill="url(#qa-steel-v)"/><circle cx="0" cy="-62" r="20" fill="#2a7de1"/><circle cx="0" cy="-62" r="14" fill="#f4f7fb"/><rect x="-8" y="-65" width="16" height="6" rx="2" fill="#2a7de1"/></g>`;
}

/** Duct-mounted sensors that sit on top of a duct, with the probe dropping into the airstream. */
export function ductSensor(x, yTop, kind = 'temp', depth = 70) {
  const probe = (len) => `<rect x="-3" y="0" width="6" height="${len}" fill="url(#qa-steel-v)"/><circle cx="0" cy="${len}" r="3.5" fill="#6b6f75"/>`;
  const housings = {
    temp: `<rect x="-26" y="-32" width="52" height="26" rx="4" fill="#d7dadf" stroke="#9aa0a6"/>${[-12, 0, 12].map(k => `<circle cx="${k}" cy="-19" r="4.5" fill="none" stroke="#9aa0a6" stroke-width="2"/>`).join('')}<path d="M-8 -6 L-12 0 H12 L8 -6Z" fill="#3a3d42"/>`,
    avg: `<rect x="-26" y="-32" width="52" height="26" rx="4" fill="#d7dadf" stroke="#9aa0a6"/>${[-12, 0, 12].map(k => `<circle cx="${k}" cy="-19" r="4.5" fill="none" stroke="#9aa0a6" stroke-width="2"/>`).join('')}`,
    hum: `<rect x="-20" y="-34" width="40" height="28" rx="5" fill="#2f7fe0"/><rect x="-22" y="-36" width="44" height="8" rx="3" fill="#5aa2ff"/><circle cx="0" cy="-18" r="7" fill="#d7e8ff"/>`,
    smoke: `<rect x="-46" y="-26" width="92" height="22" rx="8" fill="#d7dadf" stroke="#9aa0a6"/><circle cx="-24" cy="-15" r="5" fill="#e3342f"/><circle cx="-8" cy="-15" r="5" fill="#e3342f"/>`,
    press: `<rect x="-30" y="-30" width="60" height="26" rx="6" fill="#e3e6ea" stroke="#9aa0a6"/><circle cx="-14" cy="-17" r="9" fill="#ffffff" stroke="#6b6f75" stroke-width="2"/><path d="M-14 -17 l5 -4" stroke="#e3342f" stroke-width="2"/>`,
    co2: `<rect x="-24" y="-34" width="48" height="26" rx="4" fill="#f26b2a"/><rect x="-24" y="-34" width="48" height="7" rx="3" fill="#ff9a5c"/><path d="M-10 -8 L-16 0 H16 L10 -8Z" fill="#3a3d42"/>`,
  };
  const body = kind === 'avg' ? `<path d="M0 0 ${Array.from({ length: 6 }, (_, i) => `q${i % 2 ? -14 : 14} ${depth / 12} 0 ${depth / 6}`).join(' ')}" stroke="#b06a3a" stroke-width="3" fill="none"/>`
    : kind === 'smoke' ? `<g transform="translate(-16 0)">${probe(depth * .7)}</g><g transform="translate(16 0)">${probe(depth)}</g>` : probe(depth);
  return `<g transform="translate(${x} ${yTop})"><g opacity=".9">${body}</g>${housings[kind]}</g>`;
}

/** Airflow measuring station drawn as a grid of tubes across the duct face. */
export function afms(x, y, h, { d = 56 } = {}) {
  const dx = d * DX, dy = d * DY;
  return `<g opacity=".95">${Array.from({ length: 4 }, (_, i) => { const yy = y + (i + .5) * h / 4; return `<path d="M${x} ${yy} L${x + dx} ${yy + dy}" stroke="#d3d6db" stroke-width="7" stroke-linecap="round"/><path d="M${x} ${yy} L${x + dx} ${yy + dy}" stroke="#8e9399" stroke-width="2"/>`; }).join('')}<rect x="${x - 4}" y="${y}" width="8" height="${h}" fill="#7e8288"/></g>`;
}

/** Louvered outdoor-air intake / exhaust hood. */
export function hood(x, y, h, { side = 'left', d = 56 } = {}) {
  const w = 60, s = side === 'left' ? -1 : 1, x0 = side === 'left' ? x : x;
  return `<g filter="url(#qa-shadow)"><polygon points="${pts([[x0, y - 10], [x0 + s * w, y + 30], [x0 + s * w, y + h + 10], [x0, y + h + 10]])}" fill="#a99a80"/><polygon points="${pts([[x0, y - 10], [x0 + s * w, y + 30], [x0 + s * w, y + h + 10], [x0, y + h + 10]])}" fill="url(#qa-louver)" opacity=".55"/><path d="M${x0} ${y - 10} L${x0 + s * w} ${y + 30}" stroke="#ece2cc" stroke-width="5"/></g>`;
}

/** Wall thermostat in the library's "Thermostat" UI-icon style, with a live reading slot. */
export function tstat(x, y, { key = '' } = {}) {
  return `<g transform="translate(${x} ${y})" filter="url(#qa-shadow)"><rect width="190" height="120" rx="14" fill="#eef1f4" stroke="#aab0b8" stroke-width="2"/><rect x="14" y="14" width="124" height="66" rx="6" fill="url(#qa-glass)"/>
    <text x="76" y="60" text-anchor="middle" style="font:700 32px var(--mono);fill:#123" data-qtemp="${key}">--</text>
    <path d="M160 22 l14 24 h-28z" fill="#e3342f"/><path d="M160 74 l14 -24 h-28z" fill="#33b5f0"/>
    ${[22, 62, 102].map(xx => `<rect x="${xx}" y="94" width="30" height="8" rx="3" fill="#43c463"/>`).join('')}</g>`;
}

/** Status lamp (library On / Off / Alarm states). */
export function lamp(x, y, key) { return `<circle cx="${x}" cy="${y}" r="9" fill="#7d8187" stroke="#2a2c30" stroke-width="2" data-qlamp="${key}"/>`; }

/** Equipment tag in a rounded label plate. */
export function tag(x, y, text, { anchor = 'middle' } = {}) { return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="qa-tag">${text}</text>`; }

/** Wrap a library canvas: toolbar (light / dark panel) + svg. */
export function canvas(label, body, extraDefs = '') {
  return `<div class="qa-tools"><span class="qa-note">Library style</span><div class="seg" role="group" aria-label="Panel background"><button data-qpanel="light">Light</button><button data-qpanel="dark">Dark</button></div></div>
  <svg class="gfx qa-gfx" viewBox="0 0 1920 1080" role="img" aria-label="${label}"><defs>${defs()}<linearGradient id="qa-blade-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1f2f4"/><stop offset=".5" stop-color="#c4c8cd"/><stop offset="1" stop-color="#868b92"/></linearGradient>${extraDefs}</defs>${body}</svg>`;
}

/** Create the library card, wire the light/dark panel switch, and return { card, svg }. */
export function mountCard(label, body) {
  const card = document.createElement('div');
  card.className = 'card flush qa-wrap';
  card.dataset.panel = store('qaPanel') || 'light';
  card.innerHTML = canvas(label, body);
  const sync = () => card.querySelectorAll('[data-qpanel]').forEach(b => b.classList.toggle('on', b.dataset.qpanel === card.dataset.panel));
  card.querySelectorAll('[data-qpanel]').forEach(b => b.onclick = () => { card.dataset.panel = b.dataset.qpanel; store('qaPanel', b.dataset.qpanel); sync(); });
  sync();
  return { card, svg: card.querySelector('svg') };
}

/** Replace a page's standard graphic with the library card (the standard one stays mounted, hidden, so its own update loop keeps working). */
export function swapGraphic(view, label, body) {
  const old = view.querySelector('.gfx-wrap');
  const { card, svg } = mountCard(label, body);
  old.style.display = 'none'; old.setAttribute('aria-hidden', 'true');
  old.after(card);
  // the hidden copy's readouts must not take keyboard focus
  old.querySelectorAll('[tabindex]').forEach(e => e.setAttribute('tabindex', '-1'));
  return svg;
}

// ---- update helpers --------------------------------------------------------------
export const Q = {
  spin(svg, key, pct, k = 45) { svg.querySelectorAll(`[data-qrot="${key}"]`).forEach(r => { r.classList.toggle('stopped', !(pct > 1)); r.style.setProperty('--dur', Math.min(4, Math.max(.25, k / Math.max(pct, 1))) + 's'); }); },
  glow(svg, key, pct) { svg.querySelectorAll(`[data-qglow="${key}"]`).forEach(g => g.style.opacity = pct > .5 ? (.18 + .62 * Math.min(pct, 100) / 100).toFixed(2) : 0); },
  blades(svg, key, pct) { svg.querySelectorAll(`[data-qblade="${key}"]`).forEach(b => b.style.transform = b.classList.contains('qa-blade-h') ? `scaleX(${1 - .84 * pct / 100})` : `scaleY(${1 - .84 * pct / 100})`); },
  flow(svg, key, on, dur = 1.2) { svg.querySelectorAll(`[data-qp="${key}"]`).forEach(p => { p.classList.toggle('stopped', !on); p.style.setProperty('--dur', dur + 's'); }); },
  lamp(svg, key, state) { svg.querySelectorAll(`[data-qlamp="${key}"]`).forEach(l => l.setAttribute('fill', state === 'alarm' ? '#e03215' : state ? '#3fd15b' : '#7d8187')); },
  text(svg, sel, t) { const e = svg.querySelector(sel); if (e && e.textContent !== t) e.textContent = t; },
};
