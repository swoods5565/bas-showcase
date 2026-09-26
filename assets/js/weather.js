// Live outdoor data from public, key-free APIs:
//  • Open-Meteo Forecast API   — current conditions, 24 h history + 48 h forecast, sunrise/sunset
//  • Open-Meteo Air Quality    — US AQI, PM2.5, PM10, O3, NO2
//  • Open-Meteo Archive (ERA5) — 12 months of daily mean temperature → HDD/CDD, climate zone
//  • Open-Meteo Geocoding      — location search
//  • NOAA / NWS api.weather.gov — active watches & warnings (US only)
// Falls back to a deterministic synthetic climate when offline so the demo never breaks.
import { state as psy, pressureFromAltitude } from './psychro.js';
import { store, clamp, noise } from './util.js';

export const DEFAULT_LOC = { name: 'Peoria, Illinois', lat: 40.6936, lon: -89.5890, tz: 'America/Chicago', country: 'US' };
const listeners = new Set();
export const wx = {
  loc: store('loc') || DEFAULT_LOC,
  live: false, source: 'Connecting…', updated: null, elevationFt: 650,
  cur: null, hourly: [], daily: [], aq: null, alerts: [], dd: null, climate: null, sun: null,
};
export const onWeather = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach(f => { try { f(wx); } catch (e) { console.error(e); } });

async function j(url, opts) { const r = await fetch(url, opts); if (!r.ok) throw new Error(r.status + ' ' + url); return r.json(); }
const ymd = (d) => d.toISOString().slice(0, 10);

export async function geocode(q) {
  const r = await j(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
  return (r.results || []).map(x => ({ name: [x.name, x.admin1, x.country_code !== 'US' ? x.country : null].filter(Boolean).join(', '), lat: x.latitude, lon: x.longitude, tz: x.timezone, country: x.country_code }));
}
export function setLocation(loc) { wx.loc = loc; store('loc', loc); wx.dd = null; wx.climate = null; refresh(true); }

export const WMO = { 0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Rain showers', 81: 'Rain showers', 82: 'Violent showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Thunderstorm w/ hail' };

// --- NOAA solar position (low-precision, ±0.5°) --------------------------------
export function sunPosition(date, lat, lon) {
  const rad = Math.PI / 180, d = (date.getTime() / 86400000) - 10957.5; // days since J2000
  const g = (357.529 + 0.98560028 * d) * rad, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad, e = (23.439 - 0.00000036 * d) * rad;
  const RA = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const ha = ((gmst * 15 + lon) * rad) - RA;
  const alt = Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(lat * rad) - Math.sin(lat * rad) * Math.cos(ha));
  return { alt: alt / rad, az: ((az / rad) + 360) % 360 };
}

// --- IECC / ASHRAE 169 climate zone from degree-days (thermal criteria) -------
export function climateZone(hdd65, cdd50, lat, lon) {
  let z;
  if (cdd50 > 9000) z = 1; else if (cdd50 > 6300) z = 2;
  else if (hdd65 <= 5400 && cdd50 > 4500) z = 3; else if (hdd65 <= 5400) z = 4;
  else if (hdd65 <= 7200) z = 5; else if (hdd65 <= 9000) z = 6; else if (hdd65 <= 12600) z = 7; else z = 8;
  // Moisture regime approximated from longitude/coast (A = moist, B = dry, C = marine)
  let m = 'A';
  if (lon < -100 && lon > -121) m = 'B';
  if (lon <= -121 && lat > 34 && z >= 3 && z <= 5) m = 'C';
  if (z >= 7) m = '';
  return z + m;
}
// ASHRAE 90.1 Table 6.5.1.1.3 — fixed dry-bulb economizer high-limit shutoff (°F)
export function econHighLimit(cz) {
  if (/^(1B|2B|3B|3C|4B|4C|5B|5C|6B|7|8)$/.test(cz)) return 75;
  if (/^(5A|6A)$/.test(cz)) return 70;
  return 65;
}

// --- Synthetic fallback -------------------------------------------------------
function synthTemp(date, lat) {
  const doy = (date - new Date(date.getFullYear(), 0, 0)) / 864e5;
  const annual = 52 - (lat - 40) * 1.2 - 24 * Math.cos((doy - 15) / 365 * 2 * Math.PI);
  const diurnal = 9 * Math.sin(((date.getHours() + date.getMinutes() / 60) - 9) / 24 * 2 * Math.PI);
  return annual + diurnal + noise('oat', date.getTime() / 36e5, 18) * 6;
}
function synthesize() {
  const now = new Date(), lat = wx.loc.lat;
  const hourly = [];
  for (let k = -24; k <= 48; k++) {
    const d = new Date(now); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + k);
    const t = synthTemp(d, lat), rh = clamp(70 - (t - 50) * .6 + noise('rh', d.getTime() / 36e5, 10) * 12, 20, 98);
    const sp = sunPosition(d, lat, wx.loc.lon);
    const ghi = Math.max(0, 1000 * Math.sin(sp.alt * Math.PI / 180)) * (0.75 + 0.25 * noise('cc', d.getTime() / 36e5, 7));
    hourly.push({ time: d, t, rh, dp: psy(t, rh).dp, ghi, cc: 40 });
  }
  const t = synthTemp(now, lat), rh = clamp(70 - (t - 50) * .6, 20, 98);
  const sp = sunPosition(now, lat, wx.loc.lon);
  wx.cur = { t, rh, dp: psy(t, rh).dp, feels: t, wind: 8, windDir: 225, gust: 14, cloud: 40, ghi: Math.max(0, 900 * Math.sin(sp.alt * Math.PI / 180)), dni: 0, code: 2, isDay: sp.alt > 0, pressure: 14.35 };
  wx.hourly = hourly;
  const sr = new Date(now); sr.setHours(6, 45, 0, 0); const ss = new Date(now); ss.setHours(19, 5, 0, 0);
  wx.daily = [{ date: now, sunrise: sr, sunset: ss, tmax: t + 8, tmin: t - 10, uv: 5 }];
  wx.aq = { aqi: 38, pm25: 7.2, pm10: 12, o3: 61, no2: 9 };
  if (!wx.dd) wx.dd = synthDD();
  wx.source = 'Simulated climate (offline)'; wx.live = false;
}
function synthDD() {
  const days = []; const end = new Date(); end.setDate(end.getDate() - 6);
  for (let i = 364; i >= 0; i--) { const d = new Date(end); d.setDate(d.getDate() - i); d.setHours(13); days.push({ date: new Date(d), tmean: synthTemp(d, wx.loc.lat) - 7 }); }
  return summarizeDD(days);
}
function summarizeDD(days) {
  const months = new Map(); let hdd = 0, cdd = 0, cdd50 = 0;
  for (const d of days) {
    const h = Math.max(0, 65 - d.tmean), c = Math.max(0, d.tmean - 65), c50 = Math.max(0, d.tmean - 50);
    d.hdd = h; d.cdd = c; hdd += h; cdd += c; cdd50 += c50;
    const k = d.date.getFullYear() + '-' + String(d.date.getMonth() + 1).padStart(2, '0');
    if (!months.has(k)) months.set(k, { key: k, date: new Date(d.date.getFullYear(), d.date.getMonth(), 1), hdd: 0, cdd: 0, tsum: 0, n: 0 });
    const m = months.get(k); m.hdd += h; m.cdd += c; m.tsum += d.tmean; m.n++;
  }
  const cz = climateZone(hdd, cdd50, wx.loc.lat, wx.loc.lon);
  wx.climate = { zone: cz, hdd65: hdd, cdd65: cdd, cdd50, highLimit: econHighLimit(cz) };
  return { days, months: [...months.values()].map(m => ({ ...m, tmean: m.tsum / m.n })), hdd, cdd };
}

// --- Live fetch ---------------------------------------------------------------
let timer = null, inflight = false;
export async function refresh(force = false) {
  if (inflight && !force) return; inflight = true;
  const { lat, lon } = wx.loc;
  try {
    const f = await j(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,shortwave_radiation,direct_normal_irradiance,is_day,weather_code` +
      `&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,shortwave_radiation,cloud_cover` +
      `&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,uv_index_max` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&past_days=1&forecast_days=3`);
    const c = f.current;
    wx.elevationFt = (f.elevation ?? 200) * 3.281;
    wx.cur = { t: c.temperature_2m, rh: c.relative_humidity_2m, dp: c.dew_point_2m, feels: c.apparent_temperature, wind: c.wind_speed_10m, windDir: c.wind_direction_10m, gust: c.wind_gusts_10m, cloud: c.cloud_cover, ghi: c.shortwave_radiation, dni: c.direct_normal_irradiance, code: c.weather_code, isDay: !!c.is_day, pressure: c.surface_pressure * 0.0145038 };
    wx.utcOffset = f.utc_offset_seconds;
    const H = f.hourly; const now = Date.now();
    // Open-Meteo returns local wall-clock strings; convert with the location's UTC offset
    const toDate = (s) => new Date(Date.parse(s + 'Z') - f.utc_offset_seconds * 1000);
    wx.hourly = H.time.map((t, i) => ({ time: toDate(t), t: H.temperature_2m[i], rh: H.relative_humidity_2m[i], dp: H.dew_point_2m[i], ghi: H.shortwave_radiation[i], cc: H.cloud_cover[i] }))
      .filter(x => x.time.getTime() > now - 25 * 36e5 && x.time.getTime() < now + 49 * 36e5);
    const D = f.daily;
    wx.daily = D.time.map((t, i) => ({ date: toDate(t + 'T12:00'), sunrise: toDate(D.sunrise[i]), sunset: toDate(D.sunset[i]), tmax: D.temperature_2m_max[i], tmin: D.temperature_2m_min[i], uv: D.uv_index_max[i] }));
    wx.live = true; wx.source = 'Open-Meteo (live)';
  } catch (e) { console.warn('Weather offline → synthetic', e.message); synthesize(); }

  try {
    const a = await j(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide&timezone=auto`);
    wx.aq = { aqi: a.current.us_aqi, pm25: a.current.pm2_5, pm10: a.current.pm10, o3: a.current.ozone, no2: a.current.nitrogen_dioxide, live: true };
  } catch { wx.aq = wx.aq || { aqi: 38, pm25: 7.2, pm10: 12, o3: 61, no2: 9 }; }

  if (wx.loc.country === 'US' || wx.loc.country == null) {
    try {
      const a = await j(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`, { headers: { Accept: 'application/geo+json' } });
      wx.alerts = (a.features || []).map(x => ({ id: x.id, event: x.properties.event, severity: x.properties.severity, headline: x.properties.headline, ends: x.properties.ends || x.properties.expires, sender: x.properties.senderName }));
      wx.nws = true;
    } catch { wx.alerts = []; wx.nws = false; }
  } else { wx.alerts = []; wx.nws = false; }

  if (!wx.dd) {
    try {
      const end = new Date(); end.setDate(end.getDate() - 6); const start = new Date(end); start.setDate(start.getDate() - 364);
      const a = await j(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${ymd(start)}&end_date=${ymd(end)}&daily=temperature_2m_mean&temperature_unit=fahrenheit&timezone=auto`);
      const days = a.daily.time.map((t, i) => ({ date: new Date(t + 'T12:00'), tmean: a.daily.temperature_2m_mean[i] })).filter(d => d.tmean != null);
      wx.dd = summarizeDD(days); wx.dd.live = true;
    } catch { wx.dd = synthDD(); }
  }
  const P = pressureFromAltitude(wx.elevationFt);
  wx.cur.psy = psy(wx.cur.t, wx.cur.rh, P); wx.P = P;
  wx.sun = sunPosition(new Date(), lat, lon);
  wx.updated = new Date(); inflight = false; emit();
}
export function startWeather() { refresh(); clearInterval(timer); timer = setInterval(refresh, 10 * 60 * 1000); }
