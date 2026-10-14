// RTU-1, library style.
import base, { readouts, banner } from './rtu.js';
import { pv } from '../sim.js';
import { clamp } from '../util.js';
import { box, coil, damper, damperH, filter, blower, hood, topFan, pipe, tstat, lamp, tag, swapGraphic, Q } from '../qa/kit.js';

const compressor = (x, y, key) => `<g filter="url(#qa-shadow)"><rect x="${x - 32}" y="${y}" width="64" height="96" rx="14" fill="url(#qa-housing)"/><ellipse cx="${x}" cy="${y + 4}" rx="32" ry="12" fill="#6d7177"/><ellipse cx="${x}" cy="${y + 2}" rx="20" ry="7" fill="#8e9399"/>
  <rect x="${x - 22}" y="${y + 26}" width="44" height="44" rx="6" fill="#2f6bff" opacity="0" data-qglow="${key}" class="qa-glow qa-pulse"/><rect x="${x - 40}" y="${y + 92}" width="80" height="8" fill="#2a2c30"/>
  <circle cx="${x + 26}" cy="${y + 30}" r="6" fill="url(#qa-r-cu)"/></g>`;

function graphic() {
  const ay = 300, ah = 270;
  return `
  <rect x="0" y="600" width="1920" height="30" fill="#6b6f75"/><rect x="0" y="600" width="1920" height="6" fill="#9aa0a6"/>
  <rect x="100" y="700" width="1720" height="280" rx="10" class="qa-room" stroke="#9aa0a6" stroke-width="2"/>
  ${box(340, 580, 120, 120, { d: 40, rails: true })}${box(1150, 580, 120, 120, { d: 40, rails: true })}
  ${box(1150, 700, 560, 42, { d: 30, sections: [1270] })}
  ${[1320, 1480, 1640].map(x => `<g><ellipse cx="${x}" cy="752" rx="46" ry="10" fill="#8e9399"/><ellipse cx="${x}" cy="748" rx="34" ry="7" fill="#c9ccd1"/><ellipse cx="${x}" cy="760" rx="56" ry="9" fill="#6d7177" opacity=".7"/></g>`).join('')}
  ${[1320, 1480, 1640].map(x => [-20, 0, 20].map(dx => `<path class="flow qa-air qa-da" data-qf="dif" d="M${x + dx} 768 L${x + dx * 2.2} 812"/>`).join('')).join('')}
  <rect x="340" y="700" width="120" height="16" fill="url(#qa-grille)"/>
  <text x="520" y="790" class="qa-tag" text-anchor="start" style="font-size:19px">RECEIVING &amp; LOADING DOCK</text><text x="520" y="818" class="t-sm">2,400 ft² · single zone · not on the VAV system</text>
  ${tstat(1530, 790, { key: 'z' })}
  <!-- cabinet -->
  ${box(140, 280, 1560, 300, { d: 70, tone: 'tan', rails: false, shadow: true })}
  <rect x="150" y="${ay}" width="1150" height="${ah}" fill="#8f9398"/><rect x="150" y="${ay}" width="1150" height="${ah}" fill="url(#qa-housing)" opacity=".15"/>
  <path d="M150 ${ay} H1300 V${ay + ah} H150Z" fill="none" stroke="#a99571" stroke-width="10"/>
  ${hood(140, 300, 140)}
  <path class="flow qa-air" data-qf="oa" d="M60,370 H600"/>
  <path class="flow qa-air" data-qf="ra" d="M400,690 V450 H600"/>
  <path class="flow qa-air" data-qf="sa" d="M600,450 H1210 V700"/>
  ${damper(220, ay + 10, 150, { n: 6, key: 'OAD', actuator: 'top' })}
  ${damperH(345, 548, 110, { n: 4, key: 'RAD', actuator: false })}
  ${filter(520, ay + 10, ah - 20, { key: 'filt', d: 50 })}
  ${coil(640, ay + 10, ah - 20, { kind: 'dx', key: 'dx', d: 50 })}
  ${coil(780, ay + 10, ah - 20, { kind: 'gas', key: 'gas', d: 50 })}
  ${blower(1020, 440, 80, { key: 'sf' })}
  ${tag(900, ay + 34, 'SF', { anchor: 'end' })}${lamp(880, ay + 54, 'sf')}
  <!-- condensing section -->
  <rect x="1310" y="${ay}" width="380" height="${ah}" fill="#cdb894"/>
  <rect x="1320" y="${ay + 8}" width="360" height="86" fill="url(#qa-grille)"/>
  ${compressor(1420, 450, 'c1')}${compressor(1580, 450, 'c2')}
  ${pipe([[1446, 480], [1470, 480], [1470, 585], [652, 585], [652, 570]], 'cu', { w: 7 })}
  ${topFan(1440, 248, 76, { key: 'cf1' })}${topFan(1620, 248, 76, { key: 'cf2' })}
  ${tag(1420, 438, 'C1')}${tag(1580, 438, 'C2')}
  ${tag(500, 646, 'RTU-1 · 8-ton packaged rooftop unit', { anchor: 'start' })}
  ${readouts()}
  <g transform="translate(60,1000)"><rect width="1800" height="56" rx="12" class="qa-banner"/><text x="24" y="36" class="qa-banner-t" data-qbanner>—</text></g>`;
}

export default {
  title: base.title,
  mount(view, id) {
    const ctl = base.mount(view, id);
    const svg = swapGraphic(view, 'RTU-1 packaged rooftop unit, library style', graphic());
    const upd = () => {
      ctl.update?.();
      const on = pv('RTU-1.SF-STS') === 1, spd = pv('RTU-1.SF-SPD');
      Q.spin(svg, 'sf', spd); Q.lamp(svg, 'sf', on);
      Q.spin(svg, 'cf1', pv('RTU-1.CF-1') * 100); Q.spin(svg, 'cf2', pv('RTU-1.CF-2') * 100);
      Q.blades(svg, 'OAD', pv('RTU-1.OAD')); Q.blades(svg, 'RAD', 100 - pv('RTU-1.OAD'));
      Q.glow(svg, 'dx', pv('RTU-1.CMP-1') * 50 + pv('RTU-1.CMP-2') * 50); Q.glow(svg, 'gas', pv('RTU-1.HTG-1') * 50 + pv('RTU-1.HTG-2') * 50);
      Q.glow(svg, 'c1', pv('RTU-1.CMP-1') * 100); Q.glow(svg, 'c2', pv('RTU-1.CMP-2') * 100);
      svg.querySelectorAll('[data-qflame="gas"]').forEach(f => f.setAttribute('opacity', pv('RTU-1.HTG-1') ? 1 : 0));
      svg.querySelector('[data-qdirt="filt"]').setAttribute('opacity', clamp((pv('RTU-1.FILT-DP') - .2) / .8, 0, .75).toFixed(2));
      const dur = clamp(60 / Math.max(spd, 5), .4, 4) + 's';
      svg.querySelectorAll('[data-qf]').forEach(f => { const v = on && (f.dataset.qf !== 'oa' || pv('RTU-1.OAD') > 2); f.classList.toggle('stopped', !v); f.style.setProperty('--dur', dur); });
      svg.querySelectorAll('.qa-da').forEach(f => f.style.stroke = pv('RTU-1.HTG-1') ? '#ff6a3d' : pv('RTU-1.CMP-1') ? '#3d8bff' : '');
      Q.text(svg, '[data-qtemp="z"]', `${pv('RTU-1.ZN-T').toFixed(1)}°`);
      Q.text(svg, '[data-qbanner]', banner());
    };
    upd();
    return { ...ctl, update: upd };
  },
};
