import { h, fmt, fmtK, $, clamp } from '../util.js';
import { pv, pts, sim } from '../sim.js';
import { wx } from '../weather.js';
import { lineChart, barChart, scatterChart, spark } from '../charts.js';
import { hourKW, yearFromDD, changePoint, FACTORS, AREA } from '../energymodel.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default {
  title: () => 'Energy & Utilities',
  mount(view) {
    view.append(h('div.page-head', {},
      h('div', {}, h('div.crumbs', { html: '<a href="#/">Meridian Tower</a> › Dashboards › Energy & utilities' }), h('h1', {}, 'Energy & utility dashboard'),
        h('p', {}, 'Live metering from the building’s electric, gas and water meters, with 12 months of history modeled from real ERA5 daily temperatures for the site, weather-normalized with change-point regression and benchmarked against ENERGY STAR national medians.')),
      h('div.head-actions', {}, h('span.badge', { id: 'ddSrc' }))));

    // KPI tiles
    const kpis = h('div.grid', { style: { gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))' } }); view.append(kpis);
    const K = {};
    [['kw', 'Electric demand', 'MTR.KW'], ['kwh', 'Electricity today', 'MTR.KWH'], ['peak', 'Peak demand (15-min)', 'MTR.KW-PEAK'], ['thm', 'Natural gas today', 'MTR.GAS-THM'], ['gal', 'Water today', 'MTR.WTR-GAL'], ['co2', 'Carbon today', null]].forEach(([k, l, id]) => {
      const c = h('div.card.reveal', { html: `<div class="kpi"><div class="lbl">${l}</div><div class="val" ${id ? `data-pt="${id}"` : ''}>--</div><div class="foot" data-f></div><div class="spark" data-s></div></div>` });
      kpis.append(c); K[k] = c;
    });

    // Row: 24 h profile + benchmark
    const r1 = h('div.grid.g-main', { style: { marginTop: '16px' } }); view.append(r1);
    const prof = h('div.card', { html: '<div class="card-h"><h3>Load profile by end use · today</h3><span class="sub">modeled from hourly weather · kW</span></div><div></div>' });
    const bench = h('div.card'); r1.append(prof, bench);

    const r2 = h('div.grid.g-2', { style: { marginTop: '16px' } }); view.append(r2);
    const mE = h('div.card', { html: '<div class="card-h"><h3>Electricity · last 12 months</h3><span class="sub">MWh per month</span></div><div></div>' });
    const mG = h('div.card', { html: '<div class="card-h"><h3>Natural gas · last 12 months</h3><span class="sub">therms per month</span></div><div></div>' });
    r2.append(mE, mG);
    const r3 = h('div.grid.g-2', { style: { marginTop: '16px' } }); view.append(r3);
    const sE = h('div.card', { html: '<div class="card-h"><h3>Weather normalization · electricity</h3><span class="sub" data-fit></span></div><div></div>' });
    const sG = h('div.card', { html: '<div class="card-h"><h3>Weather normalization · gas</h3><span class="sub" data-fit></span></div><div></div>' });
    r3.append(sE, sG);
    const r4 = h('div.grid.g-3', { style: { marginTop: '16px' } }); view.append(r4);
    const eu = h('div.card', { html: '<div class="card-h"><h3>End use · right now</h3><span class="sub">sub-meters</span></div><div id="eu"></div>' });
    const dm = h('div.card', { html: '<div class="card-h"><h3>Live demand</h3><span class="sub">vs demand-limit setpoint</span></div><div></div>' });
    const cc = h('div.card'); r4.append(eu, dm, cc);
    view.append(h('p.note', { style: { marginTop: '14px' }, html: `Benchmarks: ENERGY STAR Portfolio Manager national median, Office — site ${FACTORS.medianOfficeSiteEUI} / source ${FACTORS.medianOfficeSourceEUI} kBtu/ft²; source-site ratios ${FACTORS.elecSite2Source} (grid electricity) and ${FACTORS.gasSite2Source} (natural gas). Emissions: EPA eGRID2022 U.S. average ${FACTORS.lbCO2perMWh} lb CO₂/MWh; natural gas ${FACTORS.tCO2perTherm} t CO₂/therm. Tariff ($${FACTORS.rate.kwh}/kWh, $${FACTORS.rate.kw}/kW-month, $${FACTORS.rate.therm}/therm) is illustrative. Regression follows the 3-parameter change-point form used in ASHRAE Guideline 14; G14 calibration targets are CV(RMSE) ≤ 15 % monthly / 30 % hourly.` }));

    const cProf = lineChart(prof.lastChild, { height: 290, stacked: true, series: [], y: { unit: 'kW' } });
    const cDem = lineChart(dm.lastChild, { height: 200, series: [], y: { unit: 'kW' } });
    let built = false;
    const buildHistory = () => {
      if (!wx.dd || built) return; built = true;
      const Y = yearFromDD(wx.dd);
      $('#ddSrc').className = 'badge ' + (wx.dd.live ? 'ok' : 'off'); $('#ddSrc').innerHTML = `<i></i>${wx.dd.live ? 'ERA5 reanalysis · ' + wx.loc.name.split(',')[0] : 'Synthetic climate (offline)'}`;
      const ms = Y.months.filter(m => m.n > 20).slice(-12);
      barChart(mE.lastChild, { height: 240, cats: ms.map(m => MON[m.date.getMonth()]), series: [{ name: 'Electricity', color: 'var(--s1)', values: ms.map(m => m.kwh / 1000) }], fmt: v => fmt(v, 0), unit: 'MWh',
        tipTitle: i => `${MON[ms[i].date.getMonth()]} ${ms[i].date.getFullYear()}`, extra: i => `<div class="r">Cooling degree-days<b>${fmt(ms[i].cdd, 0)}</b></div><div class="r">Peak demand<b>${fmt(ms[i].peak, 0)} kW</b></div><div class="r">Est. cost<b>$${fmtK(ms[i].kwh * FACTORS.rate.kwh + ms[i].peak * FACTORS.rate.kw)}</b></div>` });
      barChart(mG.lastChild, { height: 240, cats: ms.map(m => MON[m.date.getMonth()]), series: [{ name: 'Natural gas', color: 'var(--s2)', values: ms.map(m => m.thm) }], fmt: v => fmtK(v, 1), unit: 'therms',
        tipTitle: i => `${MON[ms[i].date.getMonth()]} ${ms[i].date.getFullYear()}`, extra: i => `<div class="r">Heating degree-days<b>${fmt(ms[i].hdd, 0)}</b></div><div class="r">Est. cost<b>$${fmtK(ms[i].thm * FACTORS.rate.therm)}</b></div>` });
      const wd = Y.days.filter(d => d.weekday);
      const fe = changePoint(wd.map(d => d.tmean), wd.map(d => d.kwh), 'cooling');
      const fg = changePoint(wd.map(d => d.tmean), wd.map(d => d.thm), 'heating');
      const line = (f) => { const a = []; for (let x = -5; x <= 90; x += 1) a.push([x, f.predict(x)]); return a; };
      const lbl = d => d.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const xr = [Math.min(...wd.map(d => d.tmean)), Math.max(...wd.map(d => d.tmean))];
      scatterChart(sE.lastChild, { height: 260, color: 'var(--s1)', xl: 'Daily mean OAT (°F)', yl: 'kWh/day', points: wd.map(d => [d.tmean, d.kwh, lbl(d)]), fit: line(fe).filter(p => p[0] >= xr[0] && p[0] <= xr[1]), cp: fe.cp });
      scatterChart(sG.lastChild, { height: 260, color: 'var(--s2)', xl: 'Daily mean OAT (°F)', yl: 'therms/day', points: wd.map(d => [d.tmean, d.thm, lbl(d)]), fit: line(fg).filter(p => p[0] >= xr[0] && p[0] <= xr[1]), cp: fg.cp, yf: v => fmt(v, 0) });
      sE.querySelector('[data-fit]').textContent = `3P cooling · R² ${fmt(fe.r2, 2)} · CV(RMSE) ${fmt(fe.cv, 1)} % · weekdays`;
      sG.querySelector('[data-fit]').textContent = `3P heating · R² ${fmt(fg.r2, 2)} · CV(RMSE) ${fmt(fg.cv, 1)} % · weekdays`;
      // Benchmark card
      const siteP = (1 - Y.site / FACTORS.medianOfficeSiteEUI) * 100, srcP = (1 - Y.source / FACTORS.medianOfficeSourceEUI) * 100;
      const bar = (v, med, max, col) => `<div style="position:relative;height:12px;border-radius:6px;background:var(--line);margin:6px 0 2px"><div style="position:absolute;inset:0 auto 0 0;width:${v / max * 100}%;background:${col};border-radius:6px;transition:width 1s"></div><div title="National median" style="position:absolute;top:-5px;bottom:-5px;left:${med / max * 100}%;width:2px;background:var(--text)"></div></div>`;
      bench.innerHTML = `<div class="card-h"><h3>Benchmark · trailing 12 months</h3><span class="sub">vs ENERGY STAR median office</span></div>
        <div class="kpi"><div class="lbl">Site EUI</div><div class="val">${fmt(Y.site, 1)}<small>kBtu/ft²·yr</small></div>${bar(Y.site, FACTORS.medianOfficeSiteEUI, 120, 'var(--s1)')}<div class="foot">${siteP >= 0 ? `<span class="delta-dn">▼ ${fmt(siteP, 0)} % below</span>` : `<span class="delta-up">▲ ${fmt(-siteP, 0)} % above</span>`} national median ${FACTORS.medianOfficeSiteEUI}</div></div>
        <div class="kpi" style="margin-top:14px"><div class="lbl">Source EUI</div><div class="val">${fmt(Y.source, 1)}<small>kBtu/ft²·yr</small></div>${bar(Y.source, FACTORS.medianOfficeSourceEUI, 240, 'var(--s3)')}<div class="foot">${srcP >= 0 ? `<span class="delta-dn">▼ ${fmt(srcP, 0)} % below</span>` : `<span class="delta-up">▲ ${fmt(-srcP, 0)} % above</span>`} national median ${FACTORS.medianOfficeSourceEUI}</div></div>
        <div class="hr"></div>
        <div class="pt-list">
          <div class="row-pt"><span class="n">Electricity</span><span class="mono">${fmt(Y.kwh / 1000, 0)} MWh</span></div>
          <div class="row-pt"><span class="n">Natural gas</span><span class="mono">${fmt(Y.thm, 0)} therms</span></div>
          <div class="row-pt"><span class="n">Emissions (EPA factors)</span><span class="mono">${fmt(Y.co2, 0)} t CO₂</span></div>
          <div class="row-pt"><span class="n">Climate</span><span class="mono">HDD65 ${fmt(wx.climate?.hdd65 || 0, 0)} · CDD65 ${fmt(wx.climate?.cdd65 || 0, 0)} · CZ ${wx.climate?.zone || '—'}</span></div>
        </div>`;
    };

    let n = 0;
    const upd = () => {
      buildHistory();
      const hist = (id) => pts.get(id).hist.map(x => x[1]).slice(-240);
      spark(K.kw.querySelector('[data-s]'), hist('MTR.KW'), 'var(--s1)');
      K.kw.querySelector('[data-f]').textContent = `${fmt(pv('MTR.KW') / AREA * 1000, 2)} W/ft² · load factor ${fmt(pv('MTR.KWH') / Math.max(1, pv('MTR.KW-PEAK') * (sim.t.getHours() + sim.t.getMinutes() / 60)) * 100, 0)} %`;
      K.kwh.querySelector('[data-f]').textContent = `≈ $${fmt(pv('MTR.KWH') * FACTORS.rate.kwh, 0)} energy charge`;
      K.peak.querySelector('[data-f]').innerHTML = `limit <span class="pv-chip" style="padding:0 4px">${fmt(pv('BLDG.DEMAND-LIM'), 0)} kW</span> · $${fmt(pv('MTR.KW-PEAK') * FACTORS.rate.kw, 0)} demand`;
      K.thm.querySelector('[data-f]').textContent = `${fmt(pv('MTR.GAS-RATE'), 2)} therms/h now`;
      K.gal.querySelector('[data-f]').textContent = `${fmt(pv('MTR.WTR-GPM'), 1)} gpm incl. tower makeup`;
      const co2 = pv('MTR.KWH') / 1000 * FACTORS.lbCO2perMWh / 2204.62 * 1000 + pv('MTR.GAS-THM') * FACTORS.tCO2perTherm * 1000;
      K.co2.querySelector('.val').innerHTML = `${fmt(co2, 0)}<small>kg CO₂</small>`; K.co2.querySelector('[data-f]').textContent = `≈ ${fmt(co2 * 1000 / 404, 0)} passenger-car miles (EPA 404 g/mi)`;
      [['kwh', 'MTR.KWH', 's1'], ['peak', 'MTR.KW-PEAK', 's1'], ['thm', 'MTR.GAS-THM', 's2'], ['gal', 'MTR.WTR-GAL', 's4']].forEach(([k, id, c]) => spark(K[k].querySelector('[data-s]'), hist(id), `var(--${c})`));
      // end-use bars
      const parts = [['Plug & IT', 'MTR.KW-PLUG'], ['Cooling plant', 'MTR.KW-CHW'], ['Lighting', 'MTR.KW-LTG'], ['AHU fans', 'MTR.KW-FANS'], ['Pumps, elevators, misc.', 'MTR.KW-OTHER']];
      const tot = parts.reduce((a, [, id]) => a + pv(id), 0);
      $('#eu').innerHTML = parts.map(([l, id]) => `<div style="margin:8px 0"><div class="row between" style="font-size:12.5px"><span>${l}</span><span class="mono" data-pt="${id}" data-bind="val">${fmt(pv(id), 1)}</span></div><div style="height:8px;border-radius:4px;background:var(--line);margin-top:4px"><div style="height:100%;width:${pv(id) / tot * 100}%;border-radius:4px;background:var(--s1);transition:width 1s"></div></div></div>`).join('') + `<div class="note">kW · total ${fmt(tot, 0)} kW</div>`;
      if (n++ % 5 === 0) {
        // 24 h profile using hourly weather
        const day0 = new Date(sim.t); day0.setHours(0, 0, 0, 0); const wd = day0.getDay() > 0 && day0.getDay() < 6;
        const S = { ltg: [], plug: [], fans: [], chw: [], other: [] };
        for (let hr = 0; hr < 24; hr += .5) {
          const t = new Date(day0.getTime() + hr * 36e5);
          const w = (wx.hourly || []).reduce((b, x) => Math.abs(x.time - t) < Math.abs((b?.time ?? 0) - t) ? x : b, null);
          const r = hourKW(hr, w ? w.t : pv('BLDG.OAT'), w ? w.ghi : 300, wd);
          Object.keys(S).forEach(k => S[k].push([t.getTime(), r[k]]));
        }
        cProf.update({ series: [
          { name: 'Plug & IT', color: 'var(--s1)', data: S.plug }, { name: 'Lighting', color: 'var(--s4)', data: S.ltg },
          { name: 'Cooling plant', color: 'var(--s2)', data: S.chw }, { name: 'Fans + misc.', color: 'var(--s3)', data: S.fans.map((p, i) => [p[0], p[1] + S.other[i][1]]) }],
          bands: [{ x0: sim.t.getTime() - 9e5, x1: sim.t.getTime() + 9e5, label: 'now', color: 'color-mix(in srgb, var(--text) 18%, transparent)', opacity: 1 }] });
        cDem.update({ series: [{ name: 'Demand', color: 'var(--s1)', data: pts.get('MTR.KW').hist.slice(-360), area: true }], hlines: [{ y: pv('BLDG.DEMAND-LIM'), label: 'Demand limit', color: 'var(--alarm)' }] });
        const cost = pv('MTR.KWH') * FACTORS.rate.kwh + pv('MTR.GAS-THM') * FACTORS.rate.therm;
        cc.innerHTML = `<div class="card-h"><h3>Cost & intensity · today</h3><span class="sub">illustrative tariff</span></div>
          <div class="kpi"><div class="lbl">Utility cost so far</div><div class="val">$${fmt(cost, 0)}</div><div class="foot">$${fmt(cost / AREA * 1000, 2)} per 1,000 ft²</div></div>
          <div class="pt-list" style="margin-top:12px">
            <div class="row-pt"><span class="n">Energy intensity today</span><span class="mono">${fmt((pv('MTR.KWH') * 3.412 + pv('MTR.GAS-THM') * 100) / AREA * 1000, 1)} Btu/ft²</span></div>
            <div class="row-pt"><span class="n">Cooling plant share</span><span class="mono">${fmt(pv('MTR.KW-CHW') / pv('MTR.KW') * 100, 0)} %</span></div>
            <div class="row-pt"><span class="n">Fan power index</span><span class="mono">${fmt(pv('MTR.KW-FANS') * 1000 / Math.max(pv('AHU-1.SA-CFM'), 1), 2)} W/cfm</span></div>
            <div class="row-pt"><span class="n">Water use intensity</span><span class="mono">${fmt(pv('MTR.WTR-GAL') / AREA * 1000, 1)} gal/1,000 ft²</span></div>
          </div>`;
      }
    };
    upd();
    return { update: upd, weather: () => { built = false; buildHistory(); } };
  },
};
