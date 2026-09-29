// 2-D key plans: the rendered floor image with live, clickable zone overlays (SVG).
import { ZONES, floorById, CORES } from './building.js';
import { fmt } from './util.js';

/** Returns SVG markup for one floor. color(z) → css color; label(z) → short text */
export function planSVG(floorN, { selected = null, color = () => 'transparent', label = null, opacity = .6 } = {}) {
  const F = floorById[floorN];
  const zones = ZONES.filter(z => z.floor === floorN);
  return `<svg viewBox="0 0 ${F.w} ${F.h}" width="100%" role="img" aria-label="${F.name} key plan" style="display:block">
    <image href="${F.img}" x="0" y="0" width="${F.w}" height="${F.h}"/>
    ${(CORES[floorN] || []).map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#hatch${floorN})" opacity=".55" pointer-events="none"/>`).join('')}
    <defs><pattern id="hatch${floorN}" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" fill="#4C566A" opacity=".25"/><line x1="0" y1="0" x2="0" y2="14" stroke="#4C566A" stroke-width="5" opacity=".6"/></pattern></defs>
    ${zones.map(z => { const [x, y, w, h] = z.px; const sel = z.id === selected;
      return `<a href="#/vav/${z.id}"><g data-mz="${z.id}"><title>${z.id} · ${z.name}</title>
        <rect class="mz" x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${color(z)}" fill-opacity="${opacity}" stroke="${sel ? 'var(--text)' : 'rgba(46,52,64,.35)'}" stroke-width="${sel ? 8 : 2}"/>
        ${label && w > 70 && h > 45 ? `<text x="${x + w / 2}" y="${y + h / 2 + 11}" text-anchor="middle" style="font:700 ${Math.min(34, w / 4)}px var(--mono);fill:#2E3440;pointer-events:none">${label(z)}</text>` : ''}</g></a>`; }).join('')}
  </svg>`;
}
/** Recolor an already-rendered plan in place */
export function recolorPlan(root, color, label) {
  root.querySelectorAll('[data-mz]').forEach(g => {
    const z = ZONES.find(q => q.id === g.dataset.mz); g.querySelector('rect').setAttribute('fill', color(z));
    const t = g.querySelector('text'); if (t && label) t.textContent = label(z);
  });
}
export { fmt };
