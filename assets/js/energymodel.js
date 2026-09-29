// Analytic hourly energy model for Meridian Center, calibrated to the live simulation's end uses.
// Used for 24 h profiles and for the 12-month history driven by real (ERA5) daily temperatures.
import { mulberry32, clamp } from './util.js';
import { BUILDING } from './building.js';

export const AREA = BUILDING.grossArea; // ft² gross
const K = AREA / 72000; // model was calibrated on a 72,000 ft² reference building
export const FACTORS = {
  elecSite2Source: 2.70, gasSite2Source: 1.05,        // ENERGY STAR Portfolio Manager (Aug 2023)
  medianOfficeSiteEUI: 52.9, medianOfficeSourceEUI: 116.4, // ENERGY STAR US national median, Office
  lbCO2perMWh: 823.1,                                  // EPA eGRID2022 US average (GHG Equivalencies Calculator)
  tCO2perTherm: 0.0053,                                // EPA, natural gas
  kBtuPerKWh: 3.412, kBtuPerTherm: 100,
  rate: { kwh: 0.105, kw: 14.0, therm: 0.85 },         // illustrative tariff assumptions
};

export function occCurve(h, weekday) {
  const [a, b] = weekday ? [6, 19] : [8, 16];
  if (h < a || h >= b) return 0;
  const base = weekday ? 1 : .25;
  const f = h < 9 ? .1 + .8 * (h - a) / (9 - a) : h < 12 ? .9 : h < 13 ? .75 : h < 16.5 ? .88 : .88 - .78 * (h - 16.5) / (b - 16.5);
  return f * base;
}
/** hourly end-use kW for an hour given outdoor temp and solar (W/m²) */
export function hourKW(h, oat, ghi, weekday) {
  const occ = occCurve(h, weekday), on = occ > 0 || (weekday ? h >= 5 && h < 6 : false);
  const ltg = 38 * (on ? .15 + .85 * Math.min(1, occ * 1.3) : .06);
  const plug = 36 * (on ? .35 + .65 * occ : .2) + 17;
  const coolLoadTons = on ? Math.max(0, (oat - 55) * 2.8 + ghi * .04 + occ * 18) : Math.max(0, (oat - 70) * .6);
  const chw = coolLoadTons > 4 && oat > 50 ? coolLoadTons * .68 : 0;
  const fans = on ? 7 + 26 * Math.min(1, .35 + coolLoadTons / 180) ** 2.7 + 2 : 0;
  const heatMBH = Math.max(0, (55 - oat) * (on ? 17 : 9)) + (on ? 25 : 8);
  const therms = heatMBH * 1000 / .92 / 1e5 + (on ? .3 : .08);
  const other = 7 + (on ? 9 * .6 + 4 : 2.4);
  return { ltg: ltg * K, plug: plug * K, fans: fans * K, chw: chw * K, other: other * K, kw: (ltg + plug + fans + chw + other) * K, therms: therms * K, tons: coolLoadTons * K };
}
/** daily totals from a daily-mean temperature (diurnal swing ±9 °F) */
export function dayTotals(date, tmean, rnd = Math.random) {
  const wd = date.getDay() > 0 && date.getDay() < 6; let kwh = 0, thm = 0, peak = 0;
  const doy = (date - new Date(date.getFullYear(), 0, 0)) / 864e5;
  const daylen = 12 + 3 * Math.sin((doy - 80) / 365 * 2 * Math.PI);
  for (let h = 0; h < 24; h++) {
    const t = tmean + 9 * Math.sin((h - 9) / 24 * 2 * Math.PI);
    const ghi = Math.max(0, 850 * Math.sin(Math.PI * (h - (12 - daylen / 2)) / daylen)) * (.6 + .4 * rnd());
    const r = hourKW(h + .5, t, ghi, wd); kwh += r.kw; thm += r.therms; peak = Math.max(peak, r.kw);
  }
  const noise = 1 + (rnd() - .5) * .16;
  return { kwh: kwh * noise, thm: thm * (1 + (rnd() - .5) * .1), peak: peak * noise, weekday: wd };
}
export function yearFromDD(dd) {
  const rnd = mulberry32(42);
  const days = dd.days.map(d => ({ ...d, ...dayTotals(d.date, d.tmean, rnd) }));
  const months = new Map();
  for (const d of days) {
    const k = d.date.getFullYear() + '-' + d.date.getMonth();
    if (!months.has(k)) months.set(k, { date: new Date(d.date.getFullYear(), d.date.getMonth(), 1), kwh: 0, thm: 0, peak: 0, hdd: 0, cdd: 0, n: 0, tsum: 0 });
    const m = months.get(k); m.kwh += d.kwh; m.thm += d.thm; m.peak = Math.max(m.peak, d.peak); m.hdd += d.hdd; m.cdd += d.cdd; m.n++; m.tsum += d.tmean;
  }
  const ms = [...months.values()].map(m => ({ ...m, tmean: m.tsum / m.n }));
  const kwh = days.reduce((a, d) => a + d.kwh, 0), thm = days.reduce((a, d) => a + d.thm, 0);
  const site = (kwh * FACTORS.kBtuPerKWh + thm * FACTORS.kBtuPerTherm) / AREA;
  const source = (kwh * FACTORS.kBtuPerKWh * FACTORS.elecSite2Source + thm * FACTORS.kBtuPerTherm * FACTORS.gasSite2Source) / AREA;
  return { days, months: ms, kwh, thm, site, source, co2: kwh / 1000 * FACTORS.lbCO2perMWh / 2204.62 + thm * FACTORS.tCO2perTherm };
}
/** 3-parameter change-point regression (ASHRAE Guideline 14 / Inverse Modeling Toolkit style) */
export function changePoint(xs, ys, mode = 'cooling') {
  let best = null;
  for (let cp = 40; cp <= 75; cp += .5) {
    const f = xs.map(x => mode === 'cooling' ? Math.max(0, x - cp) : Math.max(0, cp - x));
    const n = xs.length, mf = f.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (f[i] - mf) * (ys[i] - my); sxx += (f[i] - mf) ** 2; }
    const b1 = sxx ? sxy / sxx : 0, b0 = my - b1 * mf;
    let sse = 0, sst = 0; for (let i = 0; i < n; i++) { const e = ys[i] - (b0 + b1 * f[i]); sse += e * e; sst += (ys[i] - my) ** 2; }
    if (!best || sse < best.sse) best = { cp, b0, b1, sse, r2: 1 - sse / sst, cv: Math.sqrt(sse / (n - 3)) / my * 100 };
  }
  best.predict = x => best.b0 + best.b1 * (mode === 'cooling' ? Math.max(0, x - best.cp) : Math.max(0, best.cp - x));
  return best;
}
export { clamp };
