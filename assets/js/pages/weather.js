import { h, fmt, $, clamp, debounce, ICONS } from '../util.js';
import { wx, geocode, setLocation, WMO, sunPosition, refresh } from '../weather.js';
import { pv, sim } from '../sim.js';
import { lineChart } from '../charts.js';
import { psychChart } from '../psychchart.js';
import { state, wFromRH, P_STD } from '../psychro.js';
import { toast } from '../app.js';

const AQI = [[50, 'Good', '#00e400'], [100, 'Moderate', '#ffff00'], [150, 'Unhealthy for sensitive groups', '#ff7e00'], [200, 'Unhealthy', '#ff0000'], [300, 'Very unhealthy', '#8f3f97'], [500, 'Hazardous', '#7e0023']];

export default {
  title: () => 'Outdoor Conditions',
  mount(view) {
    const head = h('div.page-head', {},
      h('div', {}, h('div.crumbs', { html: '<a href="#/">Meridian Center</a> › Dashboards › Outdoor conditions' }), h('h1', {}, 'Outdoor conditions'),
        h('p', {}, 'Live public data for the site: Open-Meteo weather and air quality, NOAA/NWS alerts, and ERA5 degree-days. Psychrometric properties are computed with the ASHRAE Hyland–Wexler formulation at site barometric pressure. Change the site to drive the whole simulation from another city’s weather.')));
    const locBox = h('div.head-actions');
    const inp = h('input.field', { placeholder: 'Search a city…', style: { minWidth: '220px' }, 'aria-label': 'Search city' });
    const res = h('div.card', { style: { position: 'absolute', zIndex: 20, padding: '6px', display: 'none', minWidth: '280px', marginTop: '6px' } });
    const wrap = h('div', { style: { position: 'relative' } }, inp, res);
    locBox.append(wrap, h('button.btn', { onclick: () => { if (!navigator.geolocation) return toast('Geolocation not available'); navigator.geolocation.getCurrentPosition(p => { setLocation({ name: 'My location', lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), country: null }); toast('Site moved to your location — refreshing weather…'); }, () => toast('Location permission denied')); } }, 'Use my location'));
    head.append(locBox); view.append(head);
    inp.addEventListener('input', debounce(async () => {
      const q = inp.value.trim(); if (q.length < 2) { res.style.display = 'none'; return; }
      try { const r = await geocode(q); res.innerHTML = ''; r.forEach(l => res.append(h('div.row-pt', { style: { cursor: 'pointer', padding: '8px' }, onclick: () => { setLocation(l); res.style.display = 'none'; inp.value = ''; toast(`Site moved to ${l.name} — refreshing weather…`); } }, h('span', {}, l.name), h('span.muted.mono', {}, `${l.lat.toFixed(2)}, ${l.lon.toFixed(2)}`)))); res.style.display = r.length ? 'block' : 'none'; }
      catch { res.innerHTML = '<div class="muted" style="padding:8px">Geocoding unavailable offline</div>'; res.style.display = 'block'; }
    }, 300));

    const r1 = h('div.grid.g-3'); view.append(r1);
    const now = h('div.card.span-2'), side = h('div.card'); r1.append(now, side);
    const r2 = h('div.grid.g-main', { style: { marginTop: '16px' } }); view.append(r2);
    const fc = h('div.card', { html: '<div class="card-h"><h3>Temperature & dew point · 72 h</h3><span class="sub">shaded = airside economizer available</span></div><div></div>' });
    const cl = h('div.card'); r2.append(fc, cl);
    const r3 = h('div.grid.g-main', { style: { marginTop: '16px' } }); view.append(r3);
    const ps = h('div.card', { html: '<div class="card-h"><h3>Psychrometric chart</h3><span class="sub">now + next 24 h trajectory · hover to read any state</span></div><div></div>' });
    const al = h('div.card'); r3.append(ps, al);
    const r4 = h('div.grid.g-2', { style: { marginTop: '16px' } }); view.append(r4);
    const sol = h('div.card', { html: '<div class="card-h"><h3>Global horizontal irradiance</h3><span class="sub">W/m² · drives façade solar gains in the model</span></div><div></div>' });
    const sunC = h('div.card'); r4.append(sol, sunC);

    const cT = lineChart(fc.lastChild, { height: 260, series: [], y: { unit: '°F' } });
    const cS = lineChart(sol.lastChild, { height: 220, series: [], y: { unit: 'W/m²' }, zero: true });
    let pc = null;

    const render = () => {
      const c = wx.cur; if (!c) return;
      const P = wx.P || P_STD, st = state(c.t, c.rh, P);
      const aqi = wx.aq?.aqi ?? 0, cat = AQI.find(a => aqi <= a[0]) || AQI.at(-1);
      now.innerHTML = `<div class="card-h"><h3>${wx.loc.name}</h3><span class="sub">${wx.live ? 'Open-Meteo · updated ' + wx.updated?.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'Offline — synthetic climate'}</span></div>
        <div class="row" style="gap:28px;align-items:center">
          <div><div class="kpi"><div class="val" style="font-size:64px">${fmt(c.t, 1)}<small style="font-size:22px">°F</small></div><div class="foot" style="font-size:14px">${WMO[c.code] || '—'} · feels like ${fmt(c.feels, 0)} °F · ${fmt(wx.loc.lat, 3)}, ${fmt(wx.loc.lon, 3)} · ${fmt(wx.elevationFt, 0)} ft</div></div></div>
          <svg class="compass" viewBox="0 0 120 120" aria-label="Wind ${fmt(c.wind, 0)} mph from ${fmt(c.windDir, 0)}°"><circle cx="60" cy="60" r="54" fill="none" stroke="var(--line-2)" stroke-width="2"/>${['N', 'E', 'S', 'W'].map((d, i) => `<text x="${60 + 44 * Math.sin(i * Math.PI / 2)}" y="${64 - 44 * Math.cos(i * Math.PI / 2)}" text-anchor="middle" style="font-size:11px;fill:var(--muted);font-weight:700">${d}</text>`).join('')}
            <g transform="rotate(${c.windDir + 180} 60 60)" style="transition:transform 1s"><path d="M60 22 L68 44 L60 38 L52 44Z" fill="var(--accent)"/><line x1="60" y1="38" x2="60" y2="92" stroke="var(--accent)" stroke-width="3"/></g>
            <text x="60" y="64" text-anchor="middle" style="font:700 15px var(--mono);fill:var(--text)">${fmt(c.wind, 0)}</text><text x="60" y="78" text-anchor="middle" style="font-size:9px;fill:var(--muted)">mph</text></svg>
        </div>
        <div class="grid g-4" style="margin-top:14px;gap:10px">
          ${[['Relative humidity', fmt(c.rh, 0), '%'], ['Dew point', fmt(st.dp, 1), '°F'], ['Wet bulb', fmt(st.wb, 1), '°F'], ['Enthalpy', fmt(st.h, 1), 'Btu/lb'], ['Humidity ratio', fmt(st.gr, 0), 'gr/lb'], ['Pressure', fmt(P * 2.036, 2), 'in. Hg'], ['Cloud cover', fmt(c.cloud, 0), '%'], ['Gusts', fmt(c.gust, 0), 'mph']]
            .map(([l, v, u]) => `<div class="hero-stats" style="display:block"><div class="s"><div class="l">${l}</div><div class="v">${v}<small class="muted" style="font-size:12px;margin-left:3px">${u}</small></div></div></div>`).join('')}
        </div>`;
      side.innerHTML = `<div class="card-h"><h3>Air quality</h3><span class="sub">US EPA AQI · Open-Meteo</span></div>
        <div class="kpi"><div class="val">${fmt(aqi, 0)}</div><div class="foot"><span style="width:10px;height:10px;border-radius:50%;background:${cat[2]}"></span>${cat[1]}</div></div>
        <div class="aqi-bar" style="margin:14px 0 6px"><i style="left:${clamp(aqi / 500 * 100, 0, 100)}%"></i></div>
        <div class="row between note"><span>0</span><span>100</span><span>200</span><span>300</span><span>500</span></div>
        <div class="pt-list" style="margin-top:10px">
          <div class="row-pt"><span class="n">PM2.5</span><span class="mono">${fmt(wx.aq?.pm25, 1)} µg/m³</span></div>
          <div class="row-pt"><span class="n">PM10</span><span class="mono">${fmt(wx.aq?.pm10, 1)} µg/m³</span></div>
          <div class="row-pt"><span class="n">Ozone</span><span class="mono">${fmt(wx.aq?.o3, 0)} µg/m³</span></div>
          <div class="row-pt"><span class="n">NO₂</span><span class="mono">${fmt(wx.aq?.no2, 1)} µg/m³</span></div>
        </div>
        <div class="note" style="margin-top:10px">${aqi > 100 ? '⚠ Consider limiting economizer OA fraction / enabling smoke-event mode.' : 'Outdoor air acceptable for economizer operation.'}</div>`;
      const hl = wx.climate?.highLimit ?? 70;
      const H = wx.hourly || [];
      const bands = []; let start = null;
      H.forEach((x, i) => { const ok = x.t < hl && x.t > 38; if (ok && start == null) start = x.time.getTime(); if ((!ok || i === H.length - 1) && start != null) { bands.push({ x0: start, x1: x.time.getTime(), color: 'color-mix(in srgb, var(--ok) 16%, transparent)', opacity: 1 }); start = null; } });
      cT.update({ series: [{ name: 'Dry bulb', color: 'var(--s2)', data: H.map(x => [x.time.getTime(), x.t]) }, { name: 'Dew point', color: 'var(--s1)', data: H.map(x => [x.time.getTime(), x.dp]) }], bands: [...bands, { x0: Date.now() - 6e5, x1: Date.now() + 6e5, color: 'var(--text)', opacity: .5, label: '' }], hlines: [{ y: hl, label: `Econ high limit ${hl} °F`, color: 'var(--warn)' }] });
      cS.update({ series: [{ name: 'GHI', color: 'var(--s2)', data: H.map(x => [x.time.getTime(), x.ghi]), area: true }] });
      const econH = H.filter(x => x.time > Date.now() && x.time < Date.now() + 48 * 36e5 && x.t < hl && x.t > 38).length;
      cl.innerHTML = `<div class="card-h"><h3>Climate & HVAC implications</h3><span class="sub">derived</span></div>
        <div class="pt-list">
          <div class="row-pt"><span class="n">Climate zone (ASHRAE 169, est.)</span><span class="mono"><b>${wx.climate?.zone || '—'}</b></span></div>
          <div class="row-pt"><span class="n">HDD65 / CDD65 · trailing 12 mo</span><span class="mono">${fmt(wx.climate?.hdd65, 0)} / ${fmt(wx.climate?.cdd65, 0)}</span></div>
          <div class="row-pt"><span class="n">CDD50 (zone criterion)</span><span class="mono">${fmt(wx.climate?.cdd50, 0)}</span></div>
          <div class="row-pt"><span class="n">90.1 economizer high limit</span><span class="mono">${hl} °F fixed dry bulb</span></div>
          <div class="row-pt"><span class="n">Economizer hours · next 48 h</span><span class="mono">${econH} h</span></div>
          <div class="row-pt"><span class="n">Cooling tower approach target</span><span class="mono">WB ${fmt(st.wb, 1)} + 7 = ${fmt(Math.max(65, st.wb + 7), 1)} °F</span></div>
          <div class="row-pt"><span class="n">HW reset setpoint now</span><span class="mono">${fmt(clamp(160 - (c.t - 10) * .8, 120, 160), 0)} °F</span></div>
        </div>
        <div class="note" style="margin-top:10px">Zone estimated from IECC/ASHRAE 169 thermal criteria (HDD65, CDD50) using ${wx.dd?.live ? 'ERA5 reanalysis' : 'synthetic'} daily temperatures; moisture regime approximated from longitude.</div>`;
      al.innerHTML = `<div class="card-h"><h3>NOAA / NWS alerts</h3><span class="sub">${wx.nws ? 'api.weather.gov · live' : wx.loc.country && wx.loc.country !== 'US' ? 'US locations only' : 'unavailable'}</span></div>` +
        (wx.alerts?.length ? wx.alerts.map(a => `<div class="fdd"><div class="r" style="flex-direction:column;align-items:flex-start"><span class="badge ${/Severe|Extreme/.test(a.severity) ? 'alarm' : 'warn'}"><i></i>${a.event}</span><span style="font-size:12.5px">${a.headline || ''}</span></div></div>`).join('')
          : `<div class="empty">${ICONS.sun}<div>No active watches, warnings or advisories for this point.</div></div>`) +
        `<div class="note">Active NWS alerts appear in the BAS alarm list as external notifications.</div>`;
      // sun arc
      const d0 = wx.daily?.[0] || wx.daily?.[1]; const nowD = new Date();
      const today = (wx.daily || []).find(d => d.sunrise.toDateString() === nowD.toDateString()) || d0;
      if (today) {
        const f = clamp((nowD - today.sunrise) / (today.sunset - today.sunrise), 0, 1), sp = sunPosition(nowD, wx.loc.lat, wx.loc.lon);
        const x = 20 + f * 360, y = 110 - Math.sin(f * Math.PI) * 90;
        sunC.innerHTML = `<div class="card-h"><h3>Sun</h3><span class="sub">solar position (NOAA algorithm)</span></div>
          <svg class="sun-arc" viewBox="0 0 400 130"><path d="M20 110 Q200 -70 380 110" fill="none" stroke="var(--line-2)" stroke-dasharray="4 5"/><line x1="0" y1="110" x2="400" y2="110" stroke="var(--line-2)"/>
          ${sp.alt > 0 ? `<circle cx="${x}" cy="${y}" r="11" fill="#EBCB8B"/><circle cx="${x}" cy="${y}" r="22" fill="#EBCB8B" opacity=".2"/>` : ''}
          <text x="20" y="126" style="font-size:11px;fill:var(--muted)">${today.sunrise.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</text><text x="380" y="126" text-anchor="end" style="font-size:11px;fill:var(--muted)">${today.sunset.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</text></svg>
          <div class="pt-list"><div class="row-pt"><span class="n">Altitude / azimuth</span><span class="mono">${fmt(sp.alt, 1)}° / ${fmt(sp.az, 0)}°</span></div>
          <div class="row-pt"><span class="n">Irradiance GHI / DNI</span><span class="mono">${fmt(c.ghi, 0)} / ${fmt(c.dni, 0)} W/m²</span></div>
          <div class="row-pt"><span class="n">Max UV index today</span><span class="mono">${fmt(today.uv, 1)}</span></div>
          <div class="row-pt"><span class="n">Today hi / lo</span><span class="mono">${fmt(today.tmax, 0)} / ${fmt(today.tmin, 0)} °F</span></div></div>`;
      }
      if (!pc) pc = psychChart(ps.lastChild, { height: 400, P, tMin: 0, tMax: 110, wMax: .028 });
      const fut = H.filter(x => x.time > Date.now() && x.time < Date.now() + 24 * 36e5).filter((_, i) => i % 3 === 0);
      pc.set([...fut.map((x, i) => ({ id: 'f' + i, label: i === fut.length - 1 ? '+24 h' : '', t: x.t, w: wFromRH(x.t, x.rh, P), color: 'var(--s3)', small: true })), { id: 'now', label: 'Outdoor now', t: c.t, w: st.w, color: 'var(--s2)' }, { id: 'ra', label: 'Space (RA)', t: pv('AHU-1.RAT'), w: sim.plant.wra, color: 'var(--s1)' }],
        fut.map((_, i) => i ? ['f' + (i - 1), 'f' + i] : ['now', 'f0']));
    };
    render();
    return { weather: render, update: () => { } };
  },
};
