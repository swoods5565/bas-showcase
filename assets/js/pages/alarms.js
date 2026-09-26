import { h, fmt, $, $$ } from '../util.js';
import { sim, ackAlarm, ALARM_CLASS, pts } from '../sim.js';
import { inspect, toast } from '../app.js';

const clsOrder = ['life', 'critical', 'high', 'medium', 'low'];
const ago = (t) => { const s = (sim.t - t) / 1000; return s < 60 ? `${Math.max(0, s | 0)} s` : s < 3600 ? `${(s / 60) | 0} min` : `${(s / 3600).toFixed(1)} h`; };

export default {
  title: () => 'Alarms & Events',
  mount(view) {
    view.append(h('div.page-head', {},
      h('div', {}, h('div.crumbs', { html: '<a href="#/">Meridian Tower</a> › Dashboards › Alarms' }), h('h1', {}, 'Alarms & events'),
        h('p', {}, 'Intrinsic-reporting style alarms with BACnet notification classes, time delays, return-to-normal and acknowledgement. NOAA/NWS weather alerts for the site are merged in as external notifications. Try commanding a point to force an alarm — e.g. set AHU-1.SF-SS to Off.')),
      h('div.head-actions', {}, h('button.btn', { onclick: () => { [...sim.alarms.values()].filter(a => !a.acked).forEach(a => ackAlarm(a.id)); toast('All alarms acknowledged'); upd(); } }, 'Acknowledge all'))));
    const kp = h('div.grid', { style: { gridTemplateColumns: 'repeat(5, minmax(0,1fr))' } }); view.append(kp);
    const row = h('div.grid.g-main', { style: { marginTop: '16px' } }); view.append(row);
    const tc = h('div.card'), side = h('div.card'); row.append(tc, side);
    let filt = 'active';
    const seg = h('div.seg', {}, ...[['active', 'Active'], ['unacked', 'Unacknowledged'], ['all', 'All incl. returned']].map(([k, l], i) => h('button' + (i === 0 ? '.on' : ''), { onclick: (e) => { filt = k; $$('button', seg).forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); upd(); } }, l)));
    tc.append(h('div.card-h', {}, h('h3', {}, 'Alarm summary'), seg));
    const wrap = h('div.tbl-wrap', { style: { maxHeight: '520px' } }); tc.append(wrap);
    const tb = h('table.tbl'); wrap.append(tb);
    tb.innerHTML = '<thead><tr><th>Priority</th><th>Time</th><th>Source</th><th>Message</th><th class="num">Value</th><th>State</th><th></th></tr></thead><tbody></tbody>';
    tb.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ack]'); if (b) { ackAlarm(b.dataset.ack); upd(); return; }
      const r = e.target.closest('[data-src]'); if (r && pts.has(r.dataset.src)) inspect(r.dataset.src);
    });
    side.innerHTML = `<div class="card-h"><h3>Notification classes</h3><span class="sub">BACnet event priority</span></div>
      <div class="pt-list">${clsOrder.map(k => { const c = ALARM_CLASS[k]; return `<div class="row-pt"><span class="n"><span class="badge ${c.color}"><i></i>${c.name}</span></span><span class="mono">NC ${c.nc} · prio ${c.prio}</span></div>`; }).join('')}</div>
      <div class="note" style="margin-top:10px">Lower event priority number = more urgent (0–255). Transitions reported: TO-OFFNORMAL, TO-FAULT, TO-NORMAL; acknowledgement is required per transition for classes 1–3.</div>
      <div class="card-h" style="margin-top:18px"><h3>Event log</h3><span class="sub">most recent first</span></div><div id="evlog" style="max-height:330px;overflow:auto"></div>`;
    const upd = () => {
      const all = [...sim.alarms.values()];
      kp.innerHTML = clsOrder.map(k => { const n = all.filter(a => a.cls === k && a.state === 'Active').length; const c = ALARM_CLASS[k]; return `<div class="card"><div class="kpi"><div class="lbl">${c.name}</div><div class="val ${n && c.color === 'alarm' ? 'st-alarm' : ''}">${n}</div><div class="foot">active · NC ${c.nc}</div></div></div>`; }).join('');
      const list = all.filter(a => filt === 'all' || (filt === 'active' ? a.state === 'Active' : !a.acked))
        .sort((a, b) => clsOrder.indexOf(a.cls) - clsOrder.indexOf(b.cls) || b.t - a.t);
      tb.tBodies[0].innerHTML = list.map(a => { const c = ALARM_CLASS[a.cls]; return `<tr>
        <td><span class="badge ${c.color}"><i></i>${c.name}</span></td>
        <td class="mono muted">${a.t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} <span class="faint">(${ago(a.t)})</span></td>
        <td class="mono" data-src="${a.point}" style="cursor:pointer"><b>${a.point}</b><div class="faint" style="font-size:11px">${a.dev}</div></td>
        <td style="white-space:normal;max-width:340px">${a.msg}</td>
        <td class="num mono">${a.value}</td>
        <td>${a.state === 'Active' ? '<span class="badge alarm"><i></i>Offnormal</span>' : '<span class="badge ok"><i></i>Returned</span>'}</td>
        <td>${a.acked ? `<span class="faint" style="font-size:12px">Acked</span>` : `<button class="btn" data-ack="${a.id}">Ack</button>`}</td></tr>`; }).join('') || `<tr><td colspan="7"><div class="empty">No alarms in this view</div></td></tr>`;
      $('#evlog').innerHTML = sim.events.slice(0, 60).map(e => `<div class="row-pt" style="grid-template-columns:auto 1fr auto"><span class="badge ${e.kind === 'TO-NORMAL' || e.kind === 'ACKNOWLEDGED' ? 'ok' : ALARM_CLASS[e.cls].color}" style="font-size:10px">${e.kind}</span><span class="n" style="margin-left:6px"><b>${e.point}</b> ${e.msg}</span><span class="mono faint" style="font-size:11px">${e.t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span></div>`).join('');
    };
    upd();
    let n = 0;
    return { update: () => { if (n++ % 2 === 0) upd(); } };
  },
};
