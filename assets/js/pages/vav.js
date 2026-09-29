import { h, fmt, clamp, $, s, ICONS, rampColor } from '../util.js';
import { pvBox, toast } from '../app.js';
import { pv, pts, sim, clearFault } from '../sim.js';
import { ZONES, zoneById, SPACE } from '../building.js';
import { planSVG, recolorPlan } from '../plans.js';
import { lineChart } from '../charts.js';
import { HEAT } from '../dollhouse.js';

function graphic(z) {
  const win = z.face ? `<g><rect x="1760" y="600" width="40" height="300" rx="4" fill="color-mix(in srgb, var(--cool) 25%, transparent)" stroke="var(--cool)" stroke-width="2"/>${[0, 1, 2].map(i => `<line x1="1766" y1="${640 + i * 90}" x2="1794" y2="${620 + i * 90}" stroke="var(--cool)" opacity=".6"/>`).join('')}<text x="1780" y="930" text-anchor="middle" class="t-sm">${{ N: 'North', S: 'South', E: 'East', W: 'West' }[z.face]} glazing</text></g><g data-sun opacity="0"><circle cx="1860" cy="560" r="24" fill="#EBCB8B"/><circle cx="1860" cy="560" r="42" fill="#EBCB8B" opacity=".2"/></g>` : '<text x="1780" y="760" text-anchor="middle" class="t-sm" transform="rotate(90 1780 760)">Interior zone — no exterior exposure</text>';
  return `<svg class="gfx" viewBox="0 0 1920 1080" role="img" aria-label="${z.id} VAV terminal unit graphic">
  <defs><linearGradient id="rd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--duct)"/><stop offset=".45" stop-color="color-mix(in srgb, var(--duct) 75%, #fff 10%)"/><stop offset="1" stop-color="var(--duct)"/></linearGradient>
  <radialGradient id="zoneGlow" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="var(--zc, var(--ok))" stop-opacity=".30"/><stop offset="1" stop-color="var(--zc, var(--ok))" stop-opacity=".04"/></radialGradient></defs>
  <!-- primary air duct -->
  <rect x="60" y="330" width="470" height="120" rx="60" fill="url(#rd)" stroke="var(--duct-edge)" stroke-width="2"/>
  <path class="flow" data-flow="pa" d="M40,390 H560" stroke="var(--air-sa)"/>
  <text x="80" y="310" class="t-lbl">Primary air from AHU-1</text>
  <!-- flow ring -->
  <g transform="translate(470 390)"><circle r="52" fill="none" stroke="var(--muted)" stroke-width="3" stroke-dasharray="6 5"/><path d="M-52 0 H52 M0 -52 V52" stroke="var(--muted)" stroke-width="2"/></g>
  <text x="470" y="480" text-anchor="middle" class="t-sm">Flow cross (ΔP)</text>
  <!-- box -->
  <rect x="540" y="300" width="380" height="180" rx="12" class="equip"/>
  <g transform="translate(610 390)"><circle r="62" fill="var(--duct)" stroke="var(--duct-edge)" stroke-width="3"/><rect class="blade" data-blade x="-6" y="-58" width="12" height="116" rx="5" fill="var(--text-2)"/></g>
  <rect x="690" y="226" width="150" height="62" rx="8" fill="var(--panel-solid)" stroke="var(--accent)" stroke-width="2"/>
  <text x="765" y="252" text-anchor="middle" style="font-size:15px;font-weight:700;fill:var(--text)">CONTROLLER</text>
  <text x="765" y="274" text-anchor="middle" class="t-sm" style="font-size:13px">Dev ${z.device} · MAC ${z.mstp.mac}</text>
  <line x1="765" y1="288" x2="640" y2="336" stroke="var(--muted)" stroke-dasharray="4 3"/>
  <text x="700" y="400" class="t-tag">${z.id}</text><text x="700" y="430" class="t-sm" style="font-size:15px">${z.size}" inlet · ${fmt(z.cfmMax, 0)} cfm max</text>
  <!-- reheat coil -->
  <g><rect x="920" y="310" width="70" height="160" rx="4" fill="color-mix(in srgb, var(--heat) 18%, var(--equip))" stroke="var(--heat)" stroke-width="2.5"/>${Array.from({ length: 10 }, (_, i) => `<path d="M926 ${326 + i * 14} q15 -8 29 0 t29 0" fill="none" stroke="var(--heat)" stroke-width="2" opacity=".7"/>`).join('')}</g>
  <path d="M940 470 V640 M970 470 V700" stroke="var(--hw)" stroke-width="7" opacity=".8" stroke-linecap="round"/>
  <path class="pipe-core" data-pipe="hw" d="M940 640 V470" style="stroke-width:3"/>
  <g transform="translate(940 600)"><path d="M-18,-12 L18,12 L18,-12 L-18,12Z" fill="var(--panel-solid)" stroke="var(--hw)" stroke-width="2.5"/><rect x="18" y="-9" width="26" height="18" rx="3" fill="var(--equip)" stroke="var(--hw)"/></g>
  <text x="995" y="690" class="t-sm">HWS / HWR</text>
  <text x="955" y="296" text-anchor="middle" class="t-sm">Reheat</text>
  <!-- discharge -->
  <path d="M990 330 H1300 Q1340 330 1340 370 V520 H1240 V450 Q1240 450 1200 450 H990 Z" fill="url(#rd)" stroke="var(--duct-edge)" stroke-width="2"/>
  <path class="flow" data-flow="da" d="M990,390 H1290 V540" stroke="var(--dat, var(--air-sa))"/>
  <!-- zone -->
  <rect x="1060" y="540" width="780" height="420" rx="14" fill="url(#zoneGlow)" stroke="var(--line-2)" stroke-width="2"/>
  <line x1="1060" y1="580" x2="1840" y2="580" stroke="var(--line-2)" stroke-dasharray="8 6"/>
  ${[1180, 1420, 1640].map(x => `<g transform="translate(${x} 580)"><rect x="-44" y="-8" width="88" height="14" rx="3" fill="var(--equip-hi)" stroke="var(--duct-edge)"/>${[-24, 0, 24].map(dx => `<path class="flow" data-flow="dif" d="M${dx} 10 L${dx * 2.2} 90" stroke="var(--dat, var(--air-sa))" style="stroke-width:3"/>`).join('')}</g>`).join('')}
  <path d="M1290 520 V572 M1180 572 H1640" stroke="var(--duct-edge)" stroke-width="10" opacity=".7" stroke-linecap="round"/>
  <text x="1380" y="500" class="t-lbl">${z.name}</text>
  <text x="1380" y="526" class="t-sm">${fmt(z.area, 0)} ft² · Level ${z.floor} · ${z.people} design occupants</text>
  <!-- thermostat -->
  <g transform="translate(1110 700)"><rect width="190" height="210" rx="20" fill="var(--panel-solid)" stroke="var(--line-2)" stroke-width="2"/>
    <circle cx="95" cy="100" r="68" fill="none" stroke="var(--line-2)" stroke-width="8"/><circle cx="95" cy="100" r="68" fill="none" stroke="var(--zc, var(--ok))" stroke-width="8" stroke-linecap="round" stroke-dasharray="0 999" data-ring transform="rotate(135 95 100)"/>
    <text x="95" y="112" text-anchor="middle" data-tstat style="font:700 38px var(--mono);fill:var(--text)">--</text>
    <text x="95" y="140" text-anchor="middle" class="t-sm" style="font-size:14px" data-tmode>—</text>
    <text x="95" y="196" text-anchor="middle" class="t-sm" style="font-size:13px">Space sensor</text></g>
  <!-- CO2 + occupancy -->
  <g transform="translate(1340 850)"><rect width="120" height="64" rx="10" fill="var(--panel-solid)" stroke="var(--line-2)"/><text x="60" y="26" text-anchor="middle" class="t-sm" style="font-size:14px">CO₂ SENSOR</text><circle cx="18" cy="46" r="6" data-co2led fill="var(--ok)"/></g>
  <g transform="translate(1500 850)"><circle cx="30" cy="30" r="30" fill="var(--panel-solid)" stroke="var(--line-2)"/><path d="M14 38 q16 -26 32 0" fill="none" stroke="var(--muted)" stroke-width="3"/><circle cx="30" cy="26" r="6" data-occled fill="var(--muted)"/></g>
  <text x="1530" y="930" text-anchor="middle" class="t-sm" style="font-size:13px">Occupancy</text>
  ${win}
  <!-- readouts -->
  ${pvBox('AHU-1.SAT', 60, 170, { label: 'AHU SUPPLY TEMP', w: 170 })}
  ${pvBox(z.id + '.CFM', 250, 170, { label: 'AIRFLOW', w: 160 })}
  ${pvBox(z.id + '.CFM-SP', 430, 170, { label: 'FLOW SETPOINT', w: 170 })}
  ${pvBox(z.id + '.DMPR', 620, 170, { label: 'DAMPER', w: 130 })}
  ${pvBox(z.id + '.DAT', 1040, 170, { label: 'DISCHARGE TEMP', w: 170 })}
  ${pvBox(z.id + '.HWV', 800, 640, { label: 'REHEAT VALVE', w: 130 })}
  ${pvBox(z.id + '.MODE', 1230, 170, { label: 'ZONE STATE', w: 170 })}
  ${pvBox(z.id + '.ZN-T', 1420, 170, { label: 'SPACE TEMP', w: 150 })}
  ${pvBox(z.id + '.ZN-HSP', 1590, 170, { label: 'HTG SP', w: 120 })}
  ${pvBox(z.id + '.ZN-CSP', 1730, 170, { label: 'CLG SP', w: 120 })}
  ${pvBox(z.id + '.CO2', 1340, 770, { label: 'CO₂', w: 140 })}
  ${pvBox(z.id + '.OCC', 1590, 690, { label: 'OCC SENSOR', w: 170 })}
  ${pvBox(z.id + '.CLG-LOOP', 60, 590, { label: 'COOLING LOOP', w: 150 })}
  ${pvBox(z.id + '.HTG-LOOP', 230, 590, { label: 'HEATING LOOP', w: 150 })}
  ${pvBox(z.id + '.CFM-MAX', 60, 710, { label: 'CLG MAX', w: 150 })}
  ${pvBox(z.id + '.CFM-MIN', 230, 710, { label: 'MINIMUM', w: 150 })}
  ${pvBox(z.id + '.CFM-HMAX', 400, 710, { label: 'HTG MAX', w: 150 })}
  <text x="60" y="552" class="t-lbl">Control loops</text><text x="60" y="672" class="t-lbl">Airflow limits (G36)</text>
  <g transform="translate(60,980)"><rect width="1800" height="60" rx="12" fill="var(--panel-solid)" stroke="var(--line-2)"/><text x="24" y="38" style="font-size:22px;font-weight:600;fill:var(--text-2)" data-banner>—</text></g>
</svg>`;
}

// G36 dual-maximum logic diagram: x = loop signal (heating left, cooling right)
function dualMax(el, z) {
  const W = 620, H = 300, m = { l: 50, r: 16, t: 20, b: 44 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
  const X = v => m.l + (v + 100) / 200 * iw;
  const cMax = pv(z.id + '.CFM-MAX'), cMin = pv(z.id + '.CFM-MIN'), hMax = pv(z.id + '.CFM-HMAX');
  const Y = v => m.t + ih - v / (cMax * 1.08) * ih;
  const Yd = v => m.t + ih - (v - 50) / 45 * ih; // DAT 50–95°F mapped onto same box as a normalized overlay
  const sat = pv('AHU-1.SAT'), datMax = Math.min(90, pv(z.id + '.ZN-HSP') + 20);
  const flow = `M${X(-100)},${Y(hMax)} L${X(-50)},${Y(cMin)} L${X(0)},${Y(cMin)} L${X(100)},${Y(cMax)}`;
  const dat = `M${X(-100)},${Yd(datMax)} L${X(-50)},${Yd(datMax)} L${X(0)},${Yd(sat)} L${X(100)},${Yd(sat)}`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Guideline 36 dual maximum control diagram">
    <rect x="${X(-100)}" y="${m.t}" width="${X(0) - X(-100)}" height="${ih}" fill="color-mix(in srgb, var(--heat) 8%, transparent)"/>
    <rect x="${X(0)}" y="${m.t}" width="${X(100) - X(0)}" height="${ih}" fill="color-mix(in srgb, var(--cool) 8%, transparent)"/>
    <text x="${X(-75)}" y="${m.t + 16}" text-anchor="middle" style="font-size:11px;fill:var(--heat);font-weight:700">HEATING LOOP</text>
    <text x="${X(50)}" y="${m.t + 16}" text-anchor="middle" style="font-size:11px;fill:var(--cool);font-weight:700">COOLING LOOP</text>
    ${[-100, -50, 0, 50, 100].map(v => `<line x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${m.t + ih}" stroke="var(--line)"/><text x="${X(v)}" y="${H - 26}" text-anchor="middle" style="font-size:11px;fill:var(--muted)">${Math.abs(v)}%</text>`).join('')}
    <text x="${X(0)}" y="${H - 8}" text-anchor="middle" style="font-size:11px;fill:var(--muted)">deadband</text>
    <line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}" stroke="var(--line-2)"/>
    ${[['Clg max', cMax], ['Htg max', hMax], ['Min', cMin]].map(([l, v]) => `<text x="${m.l - 6}" y="${Y(v) + 4}" text-anchor="end" style="font-size:10.5px;fill:var(--muted)">${fmt(v, 0)}</text>`).join('')}
    <path d="${dat}" fill="none" stroke="var(--s2)" stroke-width="2" stroke-dasharray="6 4"/>
    <path d="${flow}" fill="none" stroke="var(--s1)" stroke-width="2.5"/>
    <circle data-op r="8" fill="var(--text)" stroke="var(--panel-solid)" stroke-width="3"><animate attributeName="r" values="7;10;7" dur="1.6s" repeatCount="indefinite"/></circle>
  </svg>
  <div class="chart-legend" style="margin-top:4px"><span><i style="background:var(--s1)"></i>Airflow setpoint (cfm)</span><span><i style="background:repeating-linear-gradient(90deg,var(--s2) 0 4px,transparent 4px 7px)"></i>Discharge air temp (${fmt(sat, 0)}–${fmt(datMax, 0)} °F, normalized)</span><span><i class="sq" style="background:var(--text);border-radius:50%;width:9px;height:9px"></i>Live operating point</span></div>`;
  return (clg, htg, cfm) => { const x = clg > 0 ? clg : htg > 0 ? -htg : 0; const c = el.querySelector('[data-op]'); c.setAttribute('cx', X(x)); c.setAttribute('cy', Y(cfm)); };
}

function miniPlan(z) { return planSVG(z.floor, { selected: z.id, color: tcol, opacity: .55 }); }
const tcol = q => rampColor(HEAT.temp.stops, (HEAT.temp.get(q) - HEAT.temp.min) / (HEAT.temp.max - HEAT.temp.min));

export default {
  title: (id) => id || 'VAV',
  mount(view, id) {
    const z = zoneById[id] || ZONES[12];
    const idx = ZONES.indexOf(z), prev = ZONES[(idx + ZONES.length - 1) % ZONES.length], next = ZONES[(idx + 1) % ZONES.length];
    view.append(h('div.page-head', {},
      h('div', {}, h('div.crumbs', { html: `<a href="#/">Meridian Center</a> › Air Side › <a href="#/vavs">VAV boxes</a> › Level ${z.floor}` }), h('h1', {}, `${z.id} · ${z.name}`),
        h('p', {}, `Single-duct VAV terminal with hot-water reheat, controlled per ASHRAE Guideline 36 “dual maximum” logic. ${z.face ? 'Perimeter' : 'Interior'} zone, ${fmt(z.area, 0)} ft².`)),
      h('div.head-actions', {}, h('a.btn', { href: '#/vav/' + prev.id }, '← ' + prev.id), h('a.btn', { href: '#/vav/' + next.id }, next.id + ' →'))));
    if (sim.faults[z.id]) {
      const f = h('div.card', { style: { marginBottom: '14px', borderColor: 'color-mix(in srgb, var(--alarm) 50%, transparent)', display: 'flex', alignItems: 'center', gap: '14px' } },
        h('span.badge.alarm', { html: '<i></i>Active fault' }), h('div', { style: { flex: 1 } }, h('b', {}, sim.faults[z.id]), h('div.note', {}, 'Detected by AFDD: measured airflow cannot track setpoint while the damper command changes. Zone overheats and raises cooling requests to AHU-1.')),
        h('button.btn.primary', { onclick: (e) => { clearFault(z.id); toast(`Work order closed — ${z.id} actuator replaced`); e.currentTarget.closest('.card').remove(); } }, 'Dispatch tech & clear fault'));
      view.append(f);
    }
    const g = h('div.card.flush.gfx-wrap', { html: graphic(z) }); view.append(g);
    const svg = g.querySelector('svg');

    const row = h('div.grid.g-3', { style: { marginTop: '16px' } }); view.append(row);
    const dm = h('div.card.span-2'); dm.innerHTML = `<div class="card-h"><h3>Dual-maximum control diagram</h3><span class="sub">ASHRAE Guideline 36 §5.6</span></div><div id="dm"></div>`;
    const info = h('div.card'); row.append(dm, info);
    const sp = SPACE[z.type];
    info.innerHTML = `<div class="card-h"><h3>Zone design data</h3><span class="sub">Level ${z.floor} key plan</span></div>
      <div id="kp">${miniPlan(z)}</div>
      <div class="pt-list" style="margin-top:10px">
        <div class="row-pt"><span class="n">Ventilation (62.1) Vbz = Rp·Pz + Ra·Az</span><span class="mono">${sp.oaRp}·${z.people} + ${sp.oaRa}·${fmt(z.area, 0)} = <b>${fmt(z.vbz, 0)} cfm</b></span></div>
        <div class="row-pt"><span class="n">Design cooling max / heating max / min</span><span class="mono">${fmt(z.cfmMax, 0)} / ${fmt(z.cfmHtgMax, 0)} / ${fmt(z.cfmMin, 0)}</span></div>
        <div class="row-pt"><span class="n">Occupied / unoccupied setpoints</span><span class="mono">70–74 / 60–85 °F</span></div>
        <div class="row-pt"><span class="n">Controller</span><span class="mono">Device ${z.device} · MS/TP ${z.mstp.net}:${z.mstp.mac}</span></div>
        <div class="row-pt"><span class="n">DCV (zone CO₂ loop)</span><span class="mono" id="dcv">—</span></div>
      </div>`;
    const setOp = dualMax($('#dm', dm), z);
    const row2 = h('div.grid.g-2', { style: { marginTop: '16px' } }); view.append(row2);
    const c1 = h('div.card', { html: `<div class="card-h"><h3>Space temperature</h3><span class="sub">with heating / cooling setpoints</span></div><div></div>` });
    const c2 = h('div.card', { html: `<div class="card-h"><h3>Airflow</h3><span class="sub">measured vs. active setpoint</span></div><div></div>` });
    row2.append(c1, c2);
    const H = (k) => pts.get(z.id + '.' + k).hist.slice(-360);
    const t1 = lineChart(c1.lastChild, { height: 220, series: [], y: { unit: '°F' } });
    const t2 = lineChart(c2.lastChild, { height: 220, series: [], y: { unit: 'cfm' }, zero: true });

    let n = 0;
    const upd = () => {
      const on = pv('AHU-1.SF-STS') === 1, cfm = pv(z.id + '.CFM'), dmp = pv(z.id + '.DMPR'), hwv = pv(z.id + '.HWV'), t = pv(z.id + '.ZN-T');
      const csp = pv(z.id + '.ZN-CSP'), hsp = pv(z.id + '.ZN-HSP'), md = pv(z.id + '.MODE'), dat = pv(z.id + '.DAT');
      svg.querySelector('[data-blade]').style.transform = `rotate(${sim.faults[z.id] ? 13 : dmp / 100 * 85}deg)`;
      svg.querySelector('[data-blade]').style.fill = sim.faults[z.id] ? 'var(--alarm)' : '';
      const dur = clamp(2200 / Math.max(cfm, 60) * (z.cfmMax / 1500), .35, 5) + 's';
      svg.querySelectorAll('.flow').forEach(f => { f.style.setProperty('--dur', dur); f.classList.toggle('stopped', !on || cfm < 20); });
      svg.style.setProperty('--dat', hwv > 2 ? 'var(--heat)' : 'var(--air-sa)');
      svg.querySelector('[data-pipe]').classList.toggle('stopped', hwv < 1);
      const zc = HEAT.temp.get(z);
      const col = t > csp + .5 ? 'var(--heat)' : t < hsp - .5 ? 'var(--cool)' : 'var(--ok)';
      svg.style.setProperty('--zc', col);
      svg.querySelector('[data-tstat]').textContent = fmt(t, 1) + '°';
      svg.querySelector('[data-tmode]').textContent = ['', 'Cooling', 'Satisfied', 'Heating', 'Unoccupied'][md];
      const frac = clamp((t - 60) / 25, 0, 1); svg.querySelector('[data-ring]').setAttribute('stroke-dasharray', `${frac * 320} 999`);
      svg.querySelector('[data-co2led]').setAttribute('fill', pv(z.id + '.CO2') > 1000 ? 'var(--alarm)' : pv(z.id + '.CO2') > 800 ? 'var(--warn)' : 'var(--ok)');
      svg.querySelector('[data-occled]').setAttribute('fill', pv(z.id + '.OCC') ? 'var(--ok)' : 'var(--muted)');
      const sun = svg.querySelector('[data-sun]'); if (sun) { const az = { N: 0, E: 90, S: 180, W: 270 }[z.face]; const inc = sim.sun ? Math.cos((sim.sun.az - az) * Math.PI / 180) * (sim.sun.alt > 0 ? 1 : 0) : 0; sun.setAttribute('opacity', clamp(inc, 0, 1)); }
      const stateTxt = !on ? 'AHU off — box idle' : md === 1 ? `Cooling · airflow modulating ${fmt(pv(z.id + '.CFM-MIN'), 0)}→${fmt(pv(z.id + '.CFM-MAX'), 0)} cfm` : md === 3 ? (pv(z.id + '.HTG-LOOP') > 50 ? 'Heating stage 2 · DAT at max, airflow rising to heating max' : 'Heating stage 1 · minimum airflow, reheat modulating DAT') : 'Deadband · minimum airflow, no reheat';
      svg.querySelector('[data-banner]').textContent = `${stateTxt}  ·  DAT ${fmt(dat, 1)} °F  ·  ${fmt(sim.zones[z.id].people, 0)} occupants (est.)`;
      recolorPlan(info, tcol);
      const dcv = sim.zones[z.id].dcv || 0; const de = $('#dcv'); if (de) de.textContent = dcv > 0 ? `Active · min raised ${fmt(dcv * 100, 0)} %` : 'Idle (CO₂ < 700 ppm)';
      setOp(pv(z.id + '.CLG-LOOP'), pv(z.id + '.HTG-LOOP'), pv(z.id + '.CFM-SP'));
      if (n++ % 3 === 0) {
        t1.update({ series: [{ name: 'Space temp', color: 'var(--s1)', data: H('ZN-T') }, { name: 'Cooling SP', color: 'var(--s2)', data: H('ZN-CSP'), dash: '6 4' }, { name: 'Heating SP', color: 'var(--s3)', data: H('ZN-HSP'), dash: '6 4' }] });
        t2.update({ series: [{ name: 'Airflow', color: 'var(--s1)', data: H('CFM') }, { name: 'Setpoint', color: 'var(--s2)', data: H('CFM-SP'), dash: '6 4' }] });
      }
    };
    upd();
    return { update: upd };
  },
};
