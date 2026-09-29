// ============================================================================
// Meridian Center — BACnet-style point database + physics-lite simulation
//  • Every value is a BACnet-like object with a 16-level priority array
//    (program logic writes @16, operator commands @8), status flags, OOS.
//  • Sequences are patterned on ASHRAE Guideline 36 (trim & respond resets,
//    dual-maximum VAV logic, economizer high limit per ASHRAE 90.1).
//  • Outdoor air comes from the live weather feed.
// ============================================================================
import { ZONES, SPACE, BUILDING, FACE_AZ } from './building.js';
import { wx, sunPosition } from './weather.js';
import { wFromRH, wSat, enthalpy, rhFromW, stateTW, P_STD } from './psychro.js';
import { clamp, lag, map, noise, lerp, store } from './util.js';

export const TYPES = { AI: 'analog-input', AO: 'analog-output', AV: 'analog-value', BI: 'binary-input', BO: 'binary-output', BV: 'binary-value', MSV: 'multi-state-value' };
export const PRIORITY_NAMES = { 1: 'Manual life safety', 2: 'Automatic life safety', 5: 'Critical equipment control', 6: 'Minimum on/off', 8: 'Manual operator', 16: 'Program / default' };
export const ALARM_CLASS = {
  life: { name: 'Life Safety', nc: 1, prio: 1, color: 'alarm' },
  critical: { name: 'Critical', nc: 2, prio: 32, color: 'alarm' },
  high: { name: 'High', nc: 3, prio: 64, color: 'alarm' },
  medium: { name: 'Medium', nc: 4, prio: 128, color: 'warn' },
  low: { name: 'Maintenance', nc: 5, prio: 192, color: 'warn' },
};

export const DEVICES = {
  BLDG: { inst: 1000, name: 'MT-SUPERVISORY', model: 'Building supervisory controller', net: 'BACnet/IP · 10.20.1.10:47808 (UDP 0xBAC0)' },
  'AHU-1': { inst: 1100, name: 'MT-AHU-1', model: 'Programmable equipment controller', net: 'BACnet/IP · 10.20.1.21:47808' },
  CHW: { inst: 1200, name: 'MT-CHW-PLANT', model: 'Programmable plant controller', net: 'BACnet/IP · 10.20.1.22:47808' },
  HW: { inst: 1300, name: 'MT-HW-PLANT', model: 'Programmable plant controller', net: 'BACnet/IP · 10.20.1.23:47808' },
  MTR: { inst: 1400, name: 'MT-METERS', model: 'Energy meter gateway (Modbus TCP → BACnet)', net: 'BACnet/IP · 10.20.1.24:47808' },
};
ZONES.forEach(z => { DEVICES[z.id] = { inst: z.device, name: 'MT-' + z.id, model: `VAV controller w/ integral actuator · ${z.size}" inlet`, net: `BACnet MS/TP · net ${z.mstp.net} · MAC ${z.mstp.mac} · 76.8 kbps` }; });

export const pts = new Map();
const instCounter = {};
const listeners = { tick: new Set(), alarm: new Set(), cmd: new Set() };
export const on = (ev, fn) => { listeners[ev].add(fn); return () => listeners[ev].delete(fn); };
const emit = (ev, d) => listeners[ev].forEach(f => { try { f(d); } catch (e) { console.error(e); } });

function def(dev, key, type, desc, units = '', o = {}) {
  const id = `${dev}.${key}`; const k = dev + type; instCounter[k] = (instCounter[k] || 0) + 1;
  const commandable = o.cmd ?? ['AO', 'AV', 'BO', 'BV', 'MSV'].includes(type);
  const p = {
    id, dev, key, type, inst: o.inst ?? instCounter[k], desc, units, dec: o.dec ?? 1, states: o.states,
    commandable, pa: commandable ? Array(16).fill(null) : null, rd: o.rd ?? 0, raw: o.v ?? 0,
    oos: false, oosV: null, fault: false, inAlarm: false, hist: [], cov: o.cov ?? (type[0] === 'A' ? 0.2 : 1),
    min: o.min, max: o.max, cat: o.cat || '', alarm: o.alarm || null, _t: 0,
  };
  if (commandable && o.v != null) p.pa[15] = o.v;
  pts.set(id, p); return p;
}
export function pv(id) {
  const p = typeof id === 'string' ? pts.get(id) : id; if (!p) return NaN;
  if (p.commandable) { for (let i = 0; i < 16; i++) if (p.pa[i] != null) return p.pa[i]; return p.rd; }
  return p.oos ? p.oosV : p.raw;
}
export function activePriority(p) { if (!p.commandable) return null; for (let i = 0; i < 16; i++) if (p.pa[i] != null) return i + 1; return null; }
export const isOverridden = (p) => p.commandable && p.pa.slice(0, 15).some(v => v != null);
function logic(id, v) { const p = pts.get(id); if (!p) return; if (p.commandable) p.pa[15] = v; else p.raw = v; }
export function write(id, v, prio = 8) {
  const p = pts.get(id); if (!p?.commandable) return false;
  p.pa[prio - 1] = v; emit('cmd', { p, v, prio, action: 'write' }); tick(0); return true;
}
export function relinquish(id, prio = 8) { const p = pts.get(id); if (!p?.commandable) return; p.pa[prio - 1] = null; emit('cmd', { p, prio, action: 'relinquish' }); tick(0); }
export function setOOS(id, on, v) { const p = pts.get(id); if (!p || p.commandable) return; p.oos = on; p.oosV = on ? (v ?? p.raw) : null; emit('cmd', { p, action: on ? 'oos' : 'in-service' }); tick(0); }
export function fmtPV(p, v = pv(p)) {
  if (p.states) return p.states[Math.round(v)] ?? String(v);
  if (typeof v !== 'number' || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-US', { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec });
}
export const objectId = (p) => `${TYPES[p.type]},${p.inst}`;

// --- Point definitions --------------------------------------------------------
const ONOFF = ['Off', 'On'], NORMAL = ['Normal', 'Alarm'], ENDIS = ['Disabled', 'Enabled'];
const F = '°F', PCT = '%', CFM = 'cfm', INWC = 'in. w.c.';
// Building / outdoor
def('BLDG', 'OCC-MODE', 'MSV', 'Building occupancy mode', '', { states: [null, 'Occupied', 'Unoccupied', 'Warm-up', 'Cool-down'], v: 1, rd: 2 });
def('BLDG', 'OAT', 'AI', 'Outdoor air temperature', F, { cat: 'Outdoor' });
def('BLDG', 'OA-RH', 'AI', 'Outdoor air relative humidity', PCT, { dec: 0, cat: 'Outdoor' });
def('BLDG', 'OA-DP', 'AV', 'Outdoor air dew point (calc)', F, { cmd: false });
def('BLDG', 'OA-WB', 'AV', 'Outdoor air wet bulb (calc)', F, { cmd: false });
def('BLDG', 'OA-H', 'AV', 'Outdoor air enthalpy (calc)', 'Btu/lb', { cmd: false });
def('BLDG', 'DEMAND-LIM', 'AV', 'Electric demand limit setpoint', 'kW', { v: 340, dec: 0 });

// AHU-1 (VAV, return fan, airside economizer, preheat + CHW coil)
const A = 'AHU-1';
def(A, 'SF-SS', 'BO', 'Supply fan start/stop', '', { states: ONOFF, v: 1 });
def(A, 'SF-STS', 'BI', 'Supply fan status (CT)', '', { states: ONOFF });
def(A, 'SF-SPD', 'AO', 'Supply fan VFD speed', PCT, { dec: 0 });
def(A, 'SF-KW', 'AI', 'Supply fan VFD power', 'kW');
def(A, 'RF-SPD', 'AO', 'Return fan VFD speed', PCT, { dec: 0 });
def(A, 'RF-KW', 'AI', 'Return fan VFD power', 'kW');
def(A, 'OAD', 'AO', 'Outdoor air damper', PCT, { dec: 0 });
def(A, 'RAD', 'AO', 'Return air damper', PCT, { dec: 0 });
def(A, 'EAD', 'AO', 'Exhaust/relief air damper', PCT, { dec: 0 });
def(A, 'MAT', 'AI', 'Mixed air temperature (averaging)', F);
def(A, 'RAT', 'AI', 'Return air temperature', F);
def(A, 'RA-RH', 'AI', 'Return air humidity', PCT, { dec: 0 });
def(A, 'SAT', 'AI', 'Supply air temperature', F, { alarm: { cls: 'high', delay: 600, test: (v) => pv('AHU-1.SF-STS') && v > pv('AHU-1.SAT-SP') + 5, msg: 'Supply air temp > setpoint + 5 °F' } });
def(A, 'SAT-SP', 'AV', 'Supply air temp setpoint (T&R reset)', F);
def(A, 'SA-RH', 'AI', 'Supply air humidity', PCT, { dec: 0 });
def(A, 'DSP', 'AI', 'Duct static pressure (2/3 down)', INWC, { dec: 2, alarm: { cls: 'high', delay: 300, test: (v) => pv('AHU-1.SF-STS') && v < pv('AHU-1.DSP-SP') - .3, msg: 'Duct static below setpoint' } });
def(A, 'DSP-SP', 'AV', 'Duct static setpoint (T&R reset)', INWC, { dec: 2 });
def(A, 'SA-CFM', 'AI', 'Supply airflow (fan array)', CFM, { dec: 0 });
def(A, 'OA-CFM', 'AI', 'Outdoor airflow (AFMS)', CFM, { dec: 0 });
def(A, 'OA-MIN', 'AV', 'Minimum OA setpoint (62.1 Vot)', CFM, { dec: 0 });
def(A, 'PHV', 'AO', 'Preheat coil valve (HW)', PCT, { dec: 0 });
def(A, 'CCV', 'AO', 'Cooling coil valve (CHW)', PCT, { dec: 0 });
def(A, 'FILT-DP', 'AI', 'Final filter differential pressure', INWC, { dec: 2, alarm: { cls: 'low', delay: 60, test: (v) => v > 1.0, msg: 'Filter ΔP high — replace filters' } });
def(A, 'ECON-EN', 'BV', 'Economizer enable', '', { states: ENDIS, cmd: false });
def(A, 'ECON-HL', 'AV', 'Economizer high-limit (90.1 fixed DB)', F, { v: 70, dec: 0 });
def(A, 'FRZ', 'BI', 'Freezestat (low limit)', '', { states: NORMAL, alarm: { cls: 'critical', delay: 0, test: v => v === 1, msg: 'Freezestat trip — AHU shut down' } });
def(A, 'SMK', 'BI', 'Supply duct smoke detector', '', { states: NORMAL, alarm: { cls: 'life', delay: 0, test: v => v === 1, msg: 'Duct smoke detected — fan shutdown' } });
def(A, 'CLG-REQ', 'AV', 'Cooling SAT reset requests', '', { dec: 0, cmd: false });
def(A, 'SP-REQ', 'AV', 'Static pressure reset requests', '', { dec: 0, cmd: false });

// VAV boxes (G36 §5.6 single-duct VAV with reheat, dual maximum)
for (const z of ZONES) {
  const d = z.id;
  def(d, 'ZN-T', 'AI', `${z.name} space temperature`, F, { alarm: { cls: 'medium', delay: 900, test: (v) => pv('BLDG.OCC-MODE') === 1 && (v > pv(d + '.ZN-CSP') + 3.5 || v < pv(d + '.ZN-HSP') - 3.5), msg: 'Space temperature out of range' } });
  def(d, 'ZN-CSP', 'AV', 'Active cooling setpoint', F, { v: 74 });
  def(d, 'ZN-HSP', 'AV', 'Active heating setpoint', F, { v: 70 });
  def(d, 'CO2', 'AI', `${z.name} CO₂`, 'ppm', { dec: 0, alarm: { cls: 'medium', delay: 600, test: v => v > 1100, msg: 'CO₂ above 1100 ppm' } });
  def(d, 'OCC', 'BI', 'Occupancy sensor', '', { states: ['Unoccupied', 'Occupied'] });
  def(d, 'CFM', 'AI', 'Discharge airflow', CFM, { dec: 0, alarm: { cls: 'high', delay: 300, test: (v) => pv('AHU-1.SF-STS') && pv(d + '.CFM-SP') > 150 && v < pv(d + '.CFM-SP') * .6, msg: 'Airflow below setpoint' } });
  def(d, 'CFM-SP', 'AV', 'Active airflow setpoint', CFM, { dec: 0 });
  def(d, 'DMPR', 'AO', 'Damper position', PCT, { dec: 0 });
  def(d, 'HWV', 'AO', 'Reheat valve', PCT, { dec: 0 });
  def(d, 'DAT', 'AI', 'Discharge air temperature', F);
  def(d, 'CLG-LOOP', 'AV', 'Cooling loop output', PCT, { dec: 0, cmd: false });
  def(d, 'HTG-LOOP', 'AV', 'Heating loop output', PCT, { dec: 0, cmd: false });
  def(d, 'MODE', 'MSV', 'Zone control state', '', { states: [null, 'Cooling', 'Deadband', 'Heating', 'Unoccupied'], cmd: false, v: 2 });
  def(d, 'CFM-MAX', 'AV', 'Cooling maximum airflow', CFM, { v: z.cfmMax, dec: 0 });
  def(d, 'CFM-MIN', 'AV', 'Minimum airflow (62.1 Vbz / Zd)', CFM, { v: z.cfmMin, dec: 0 });
  def(d, 'CFM-HMAX', 'AV', 'Heating maximum airflow', CFM, { v: z.cfmHtgMax, dec: 0 });
}

// Chilled-water plant (2 × 125-ton water-cooled chillers, variable primary)
const C = 'CHW';
for (const n of [1, 2]) {
  def(C, `CH-${n}-SS`, 'BO', `Chiller ${n} enable`, '', { states: ONOFF });
  def(C, `CH-${n}-STS`, 'BI', `Chiller ${n} run status`, '', { states: ONOFF });
  def(C, `CH-${n}-KW`, 'AI', `Chiller ${n} power`, 'kW');
  def(C, `CH-${n}-PLR`, 'AI', `Chiller ${n} % load (RLA)`, PCT, { dec: 0 });
  def(C, `CHWP-${n}-SPD`, 'AO', `CHW pump ${n} VFD speed`, PCT, { dec: 0 });
  def(C, `CWP-${n}-SS`, 'BO', `Condenser pump ${n}`, '', { states: ONOFF });
  def(C, `CT-${n}-SPD`, 'AO', `Cooling tower ${n} fan VFD`, PCT, { dec: 0 });
}
def(C, 'PLANT-EN', 'BV', 'Chiller plant enable', '', { states: ENDIS });
def(C, 'CHWST', 'AI', 'CHW supply temperature', F, { alarm: { cls: 'high', delay: 600, test: v => pv('CHW.PLANT-EN') && v > pv('CHW.CHWST-SP') + 4, msg: 'CHW supply temp high' } });
def(C, 'CHWRT', 'AI', 'CHW return temperature', F);
def(C, 'CHWST-SP', 'AV', 'CHW supply temp setpoint', F, { v: 44 });
def(C, 'CHW-GPM', 'AI', 'CHW flow', 'gpm', { dec: 0 });
def(C, 'CHW-DT', 'AV', 'CHW ΔT', '°F', { cmd: false, alarm: { cls: 'medium', delay: 900, test: v => pv('CHW.PLANT-EN') && pv('CHW.TONS') > 40 && v < 8, msg: 'Low ΔT syndrome (<8 °F)' } });
def(C, 'CHW-DP', 'AI', 'CHW differential pressure', 'psid');
def(C, 'CHW-DP-SP', 'AV', 'CHW DP setpoint', 'psid', { v: 12 });
def(C, 'TONS', 'AI', 'Plant load', 'tons');
def(C, 'KW-TON', 'AV', 'Plant efficiency', 'kW/ton', { dec: 2, cmd: false });
def(C, 'CWST', 'AI', 'Condenser water supply temp', F);
def(C, 'CWRT', 'AI', 'Condenser water return temp', F);
def(C, 'CWST-SP', 'AV', 'CW supply temp setpoint', F);
def(C, 'CW-GPM', 'AI', 'Condenser water flow', 'gpm', { dec: 0 });
def(C, 'MU-GPM', 'AI', 'Tower makeup water', 'gpm', { dec: 1 });

// Heating hot-water plant (2 × 1,500 MBH condensing boilers)
const H = 'HW';
for (const n of [1, 2]) {
  def(H, `B-${n}-SS`, 'BO', `Boiler ${n} enable`, '', { states: ONOFF });
  def(H, `B-${n}-FIRE`, 'AI', `Boiler ${n} firing rate`, PCT, { dec: 0 });
  def(H, `B-${n}-EFF`, 'AI', `Boiler ${n} combustion efficiency`, PCT, { dec: 1 });
  def(H, `HWP-${n}-SPD`, 'AO', `HW pump ${n} VFD speed`, PCT, { dec: 0 });
}
def(H, 'PLANT-EN', 'BV', 'Boiler plant enable', '', { states: ENDIS });
def(H, 'HWST', 'AI', 'HW supply temperature', F, { alarm: { cls: 'high', delay: 600, test: v => pv('HW.PLANT-EN') && v < pv('HW.HWST-SP') - 15, msg: 'HW supply temp low' } });
def(H, 'HWRT', 'AI', 'HW return temperature', F);
def(H, 'HWST-SP', 'AV', 'HW supply setpoint (OA reset)', F);
def(H, 'HW-GPM', 'AI', 'HW flow', 'gpm', { dec: 0 });
def(H, 'MBH', 'AI', 'Plant heating load', 'MBH', { dec: 0 });
def(H, 'GAS-CFH', 'AI', 'Boiler gas flow', 'CFH', { dec: 0 });

// Meters
const M = 'MTR';
def(M, 'KW', 'AI', 'Main electric demand', 'kW', { dec: 1, alarm: { cls: 'medium', delay: 120, test: v => v > pv('BLDG.DEMAND-LIM'), msg: 'Electric demand above limit' } });
def(M, 'KWH', 'AI', 'Electric energy today', 'kWh', { dec: 0 });
def(M, 'KW-PEAK', 'AI', 'Peak demand today (15-min)', 'kW', { dec: 1 });
def(M, 'KW-LTG', 'AI', 'Lighting panels', 'kW');
def(M, 'KW-PLUG', 'AI', 'Receptacle / plug panels', 'kW');
def(M, 'KW-FANS', 'AI', 'AHU fan VFDs', 'kW');
def(M, 'KW-CHW', 'AI', 'Chiller plant', 'kW');
def(M, 'KW-OTHER', 'AI', 'Elevators, pumps & misc.', 'kW');
def(M, 'GAS-THM', 'AI', 'Natural gas today', 'therms', { dec: 1 });
def(M, 'GAS-RATE', 'AI', 'Natural gas rate', 'therms/h', { dec: 2 });
def(M, 'WTR-GPM', 'AI', 'Domestic + makeup water', 'gpm');
def(M, 'WTR-GAL', 'AI', 'Water today', 'gal', { dec: 0 });

// --- Simulation clock ---------------------------------------------------------
function demoStart() {
  const d = new Date(); const hr = d.getHours() + d.getMinutes() / 60;
  const wk = d.getDay() > 0 && d.getDay() < 6;
  const [a, b] = wk ? [6.5, 18.5] : [8.5, 15.5];
  if (hr < a || hr > b) { d.setHours(10, 30, 0, 0); return { t: d, shifted: true }; }
  return { t: d, shifted: false };
}
const st = demoStart();
export const sim = {
  t: st.t, shifted: st.shifted, speed: store('speed') || 1, running: true, zones: {}, faults: { 'VAV-2-04': 'Damper actuator stuck at 15 %' },
  alarms: new Map(), events: [], plant: {}, day: st.t.getDate(), energy: { kwh: 0, thm: 0, gal: 0, peak: 0, dem: [] },
};
export function setSpeed(x) { sim.speed = x; store('speed', x); }
export function clearFault(id) { delete sim.faults[id]; emit('cmd', { action: 'fault-cleared', id }); tick(0); }

export function schedule(t) {
  const hr = t.getHours() + t.getMinutes() / 60, wk = t.getDay() > 0 && t.getDay() < 6;
  const [a, b] = wk ? [6, 19] : [8, 16];
  return { occ: hr >= a && hr < b, pre: hr >= a - 1 && hr < a, wk, hr, open: a, close: b };
}
function occFraction(type, s, key) {
  if (!s.occ || type === 'data') return 0;
  const h = s.hr, base = s.wk ? 1 : .25;
  let f = h < 9 ? map(h, s.open, 9, .1, .9) : h < 12 ? .9 : h < 13 ? .7 : h < 16.5 ? .88 : map(h, 16.5, s.close, .88, .1);
  if (type === 'cafe') f = (h > 11.3 && h < 13.5 ? 1 : h > 7 && h < 9.5 ? .45 : .15);
  if (type === 'conf') f = (noise(key, sim.t.getTime() / 36e5, 1.3) > -.1 ? .75 : 0) * (h > 8 && h < 17 ? 1 : 0);
  if (type === 'fitness') f = (h < 8.5 || (h > 11.5 && h < 13) || h > 16.5) ? .6 : .12;
  if (type === 'lobby') f = f * .6 + (Math.abs(h - 8.2) < .5 || Math.abs(h - 17.2) < .5 ? .4 : 0);
  return clamp(f * base * (1 + noise(key + 'o', sim.t.getTime() / 6e5, 2) * .08), 0, 1);
}

// --- Model state ----------------------------------------------------------------
const Z = sim.zones;
ZONES.forEach((z, i) => { Z[z.id] = { z, tz: 72 + noise(z.id, 1, 1) * 1.2, cfm: z.cfmMin, dat: 58, co2: 520, occ: 0, load: 0, reheat: 0, people: 0 }; });
const S = sim.plant = { dsp: 1.0, dspSp: 1.0, satT: 57, sat: 56, mat: 60, rat: 74, wra: .0085, wsa: .0080, wma: .008, spd: 60, oaFrac: .2, ccBtu: 0, phBtu: 0, tr: 0, chwst: 44.5, chwrt: 55, cwst: 78, hwst: 140, hwrt: 120, csup: 600, filt: .62, ch2: false, b2: false, chwEn: false, hwEn: false, oat: 70 };
const DESIGN_CFM = BUILDING.designCfm, SF_KW = 42, RF_KW = 14, CH_CAP = 125, B_CAP = 1500000;

function outdoor() {
  const c = wx.cur; let t = c ? c.t : 72, rh = c ? c.rh : 55;
  // Interpolate hourly forecast to the simulated time when the demo clock is shifted
  if (wx.hourly?.length && (sim.shifted || sim.speed > 1)) {
    const tm = sim.t.getTime(); const H = wx.hourly;
    for (let i = 0; i < H.length - 1; i++) if (tm >= H[i].time && tm < H[i + 1].time) { const f = (tm - H[i].time) / (H[i + 1].time - H[i].time); t = lerp(H[i].t, H[i + 1].t, f); rh = lerp(H[i].rh, H[i + 1].rh, f); break; }
  }
  return { t, rh };
}
function ghiAt() {
  const sp = sunPosition(sim.t, wx.loc.lat, wx.loc.lon);
  const cloud = wx.cur ? wx.cur.cloud : 40;
  const clear = Math.max(0, 1050 * Math.sin(sp.alt * Math.PI / 180) ** 1.15);
  return { ghi: clear * (1 - .7 * (cloud / 100) ** 2.5), sp };
}

// --- Main tick -------------------------------------------------------------------
let trAcc = 0, histAcc = 0;
export function tick(dt = sim.speed) {
  if (dt > 0) sim.t = new Date(sim.t.getTime() + dt * 1000);
  const s = schedule(sim.t), P = wx.P || P_STD;
  if (sim.t.getDate() !== sim.day) { sim.day = sim.t.getDate(); sim.energy = { kwh: 0, thm: 0, gal: 0, peak: 0, dem: [] }; }
  // Outdoor
  const oa = outdoor(); const oat = oa.t + noise('oatn', sim.t.getTime() / 6e4, 3) * .15; S.oat = oat;
  const woa = wFromRH(oat, oa.rh, P), hoa = enthalpy(oat, woa), oaSt = stateTW(oat, woa, P);
  logic('BLDG.OAT', oat); logic('BLDG.OA-RH', oa.rh); logic('BLDG.OA-DP', oaSt.dp); logic('BLDG.OA-WB', oaSt.wb); logic('BLDG.OA-H', hoa);
  const { ghi, sp: sun } = ghiAt(); sim.ghi = ghi; sim.sun = sun;
  // Occupancy mode
  const avgT = ZONES.reduce((a, z) => a + Z[z.id].tz, 0) / ZONES.length;
  logic('BLDG.OCC-MODE', s.occ ? 1 : s.pre ? (avgT < 68 ? 3 : avgT > 77 ? 4 : 1) : 2);
  const mode = pv('BLDG.OCC-MODE'); const occMode = mode !== 2;

  // ---- AHU-1 enable & safeties
  logic('AHU-1.SF-SS', occMode ? 1 : 0);
  logic('AHU-1.FRZ', 0); logic('AHU-1.SMK', 0);
  const safetyTrip = pv('AHU-1.FRZ') === 1 || pv('AHU-1.SMK') === 1;
  const fanOn = pv('AHU-1.SF-SS') === 1 && !safetyTrip;
  logic('AHU-1.SF-STS', fanOn ? 1 : 0);
  const SAT = S.sat, HWST = S.hwst;

  // ---- Zones
  let sumCfm = 0, sumVbz = 0, latent = 0, reheatBtu = 0, clgReq = 0, spReq = 0, ltgW = 0, plugW = 0, people = 0;
  for (const z of ZONES) {
    const zs = Z[z.id], d = z.id, sp = SPACE[z.type];
    const occ = occFraction(z.type, s, z.id); zs.occ = occ;
    const attend = ['office', 'support'].includes(z.type) ? .62 : 1; // hybrid-work attendance
    const ppl = z.people * occ * attend; zs.people = ppl; people += ppl;
    const lw = z.area * sp.ltg * (s.occ ? .15 + .85 * Math.min(1, occ * 1.3) : .06);
    const pw = z.area * sp.plug * (z.type === 'data' ? 1 : s.occ ? .35 + .65 * occ : .22);
    ltgW += lw; plugW += pw;
    let load = ppl * 250 + (lw + pw) * 3.412; latent += ppl * 200;
    if (z.face) {
      const glass = z.facadeLen * BUILDING.floorHeight * .42;
      const inc = Math.max(0, Math.cos(sun.alt * Math.PI / 180) * Math.cos((sun.az - FACE_AZ[z.face]) * Math.PI / 180));
      load += glass * ghi * .317 * .36 * (.28 + .9 * inc);
      load += z.facadeLen * BUILDING.floorHeight * .32 * (oat - zs.tz);
    }
    if (z.roof) load += z.area * .045 * (oat + 12 * (ghi / 900) - zs.tz);
    zs.load = load;
    // Setpoints (occupied 70/74, unoccupied setback 60/85)
    logic(d + '.ZN-CSP', occMode ? 74 : 85); logic(d + '.ZN-HSP', occMode ? 70 : 60);
    const csp = pv(d + '.ZN-CSP'), hsp = pv(d + '.ZN-HSP');
    const cMax = pv(d + '.CFM-MAX'), cMin0 = pv(d + '.CFM-MIN'), hMax = pv(d + '.CFM-HMAX');
    // G36 zone CO2 (DCV) loop: raise the zone minimum toward cooling max between 700 and 1000 ppm
    const dcv = z.type === 'data' ? 0 : map(zs.co2, 700, 1000, 0, 1); zs.dcv = dcv;
    const cMin = lerp(cMin0, Math.max(cMin0, cMax * .9), dcv);
    let cfmT, datT, clg = 0, htg = 0, md;
    const DATMAX = Math.min(90, hsp + 20);
    if (!fanOn) { cfmT = 0; datT = zs.tz; md = 4; }
    else {
      const req = load / (1.08 * Math.max(3, csp - SAT));
      if (req >= cMin) { cfmT = Math.min(req, cMax); datT = SAT + .8; clg = map(req, cMin, cMax, 0, 100); md = 1; }
      else {
        const tfloat = SAT + .8 + load / (1.08 * cMin);
        if (tfloat >= hsp + .3) { cfmT = cMin; datT = SAT + .8; md = 2; }
        else {
          const datReq = hsp + .3 - load / (1.08 * cMin);
          if (datReq <= DATMAX) { cfmT = cMin; datT = datReq; htg = map(datReq, SAT, DATMAX, 0, 50); }
          else { datT = DATMAX; cfmT = clamp(-load / (1.08 * (DATMAX - hsp)), cMin, hMax); htg = 50 + map(cfmT, cMin, hMax, 0, 50); }
          md = 3;
        }
      }
    }
    // Feedback: a PI loop saturates when the space is already outside its setpoints
    if (fanOn && zs.tz > csp + 1) { cfmT = cMax; datT = SAT + .8; clg = 100; htg = 0; md = 1; }
    else if (fanOn && zs.tz < hsp - 1) { cfmT = hMax; datT = DATMAX; htg = 100; clg = 0; md = 3; }
    logic(d + '.CFM-SP', Math.round(cfmT));
    // Reheat valve: coil capacity scales with HWST and airflow
    const coilCap = 48 * clamp((HWST - SAT) / 85, 0, 1.3) * clamp(cMin / Math.max(cfmT, 1), .45, 1);
    logic(d + '.HWV', md === 3 ? clamp((datT - SAT - .8) / Math.max(coilCap, 1) * 100, 0, 100) : 0);
    const cfmCmd = pv(d + '.CFM-SP');
    const fault = sim.faults[d];
    // Damper position needed to deliver the flow at current duct static (orifice relationship)
    const dmprT = fanOn ? clamp(100 * (cfmCmd / cMax) * Math.sqrt(1.0 / Math.max(S.dsp, .25)) * .78, 4, 100) : 0;
    logic(d + '.DMPR', dmprT);
    const dm = pv(d + '.DMPR');
    // Delivered flow follows commanded damper (so operator overrides of DMPR act physically)
    let cfmTgt = fanOn ? Math.min(cMax * 1.3, cMax * (dm / 100) / .78 * Math.sqrt(Math.max(S.dsp, .05) / 1.0)) : 0;
    if (fault && fanOn) cfmTgt = cMax * .15 / .78 * Math.sqrt(S.dsp);
    zs.cfm = lag(zs.cfm, cfmTgt, dt || 1, 12);
    const cfm = zs.cfm + (fanOn ? noise(d + 'f', sim.t.getTime() / 4e3, 1) * 6 : 0);
    const dat = fanOn ? SAT + .8 + pv(d + '.HWV') / 100 * coilCap : zs.tz;
    zs.dat = lag(zs.dat, dat, dt || 1, 45);
    zs.reheat = fanOn ? 1.08 * cfm * Math.max(0, zs.dat - SAT - .8) : 0; reheatBtu += zs.reheat;
    // Space temperature: steady-state heat balance approached with thermal mass lag
    // Kc couples the zone to its neighbours / thermal mass (Btu/h·°F)
    const Kc = z.area * .5, ma = fanOn ? 1.08 * Math.max(cfm, 0) : 0;
    let tT = fanOn ? (ma * zs.dat + load + Kc * avgT) / (ma + Kc) : clamp(71 + (oat - 70) * .22 + load / 3000, 55, 90);
    tT = clamp(tT, 50, 92);
    zs.tz = lag(zs.tz, tT, dt || 1, fanOn ? 420 : 3600);
    const tz = zs.tz + noise(d + 't', sim.t.getTime() / 9e4, 1) * .12;
    logic(d + '.ZN-T', tz); logic(d + '.CFM', Math.max(0, cfm)); logic(d + '.DAT', zs.dat);
    logic(d + '.CLG-LOOP', clg); logic(d + '.HTG-LOOP', htg); logic(d + '.MODE', md);
    logic(d + '.OCC', occ > .08 ? 1 : 0);
    // CO2 mass balance: G = 0.0105 cfm CO2 per person (sedentary)
    // Zone CO2 = supply CO2 (recirculated blend) + generation / zone airflow
    const co2T = fanOn ? S.csup + ppl * .0105e6 / Math.max(cfm, 30) : zs.co2 + ppl * 40;
    zs.co2 = lag(zs.co2, clamp(co2T, 420, 2400), dt || 1, 900);
    logic(d + '.CO2', zs.co2 + noise(d + 'c', sim.t.getTime() / 3e4, 1) * 6);
    // Reset requests (G36): cooling loop > 95 %, damper > 95 %
    if (clg > 95 || zs.tz > csp + 2) clgReq++;
    if (pv(d + '.DMPR') > 95) spReq++;
    sumCfm += Math.max(0, cfm); sumVbz += (z.type === 'data' ? 0 : SPACE[z.type].oaRp * ppl + SPACE[z.type].oaRa * z.area);
  }
  logic('AHU-1.CLG-REQ', clgReq); logic('AHU-1.SP-REQ', spReq);

  // ---- Trim & Respond (every 2 min simulated)
  trAcc += dt;
  while (trAcc >= 120) {
    trAcc -= 120;
    // Static pressure: SP0 1.0, Tmin .5, Tmax 1.5, ignore 2, trim -0.04, respond +0.06, max +0.15
    S.dspSp = clamp(S.dspSp + (spReq > 2 ? Math.min(.15, .06 * (spReq - 2)) : -.04), .5, 1.5);
    // SAT: T between 55 and 65 °F, trim +0.2, respond -0.3, max -1.0, ignore 2
    S.satT = clamp(S.satT + (clgReq > 2 ? -Math.min(1, .3 * (clgReq - 2)) : .2), 55, 65);
  }
  logic('AHU-1.DSP-SP', S.dspSp);
  let hwReq = 0; for (const z of ZONES) if (pv(z.id + '.HWV') > 50) hwReq++;
  const satSp = oat >= 70 ? 55 : oat <= 60 ? S.satT : lerp(S.satT, 55, (oat - 60) / 10);
  logic('AHU-1.SAT-SP', satSp);
  const satsp = pv('AHU-1.SAT-SP');

  // ---- Fans
  S.dsp = fanOn ? lag(S.dsp, pv('AHU-1.DSP-SP') + noise('dsp', sim.t.getTime() / 5e3, 1) * .02, dt || 1, 15) : lag(S.dsp, 0, dt || 1, 8);
  const flowRatio = sumCfm / DESIGN_CFM;
  logic('AHU-1.SF-SPD', fanOn ? clamp(100 * Math.sqrt(flowRatio ** 2 * .75 + .25 * flowRatio ** 2 * S.dsp / 1.5 + .02), 15, 100) : 0);
  const spd = pv('AHU-1.SF-SPD'); S.spd = spd;
  logic('AHU-1.DSP', S.dsp);
  logic('AHU-1.SF-KW', fanOn ? SF_KW * (spd / 100) ** 2.7 + .4 : 0);
  logic('AHU-1.RF-SPD', fanOn ? spd * .86 : 0);
  logic('AHU-1.RF-KW', fanOn ? RF_KW * (pv('AHU-1.RF-SPD') / 100) ** 2.7 + .2 : 0);
  logic('AHU-1.SA-CFM', sumCfm);

  // ---- Return air
  const rat = fanOn ? ZONES.reduce((a, z) => a + Z[z.id].tz * Z[z.id].cfm, 0) / Math.max(sumCfm, 1) + 1.1 : lag(S.rat, avgT, dt || 1, 300);
  S.rat = lag(S.rat, rat, dt || 1, 60);
  S.wra = fanOn ? S.wsa + latent / (4840 * Math.max(sumCfm, 500)) : lag(S.wra, woa, dt || 1, 1800);
  logic('AHU-1.RAT', S.rat); logic('AHU-1.RA-RH', rhFromW(S.rat, S.wra, P));

  // ---- Economizer (ASHRAE 90.1 fixed dry-bulb high limit, per climate zone)
  const hl = wx.climate?.highLimit ?? 70; logic('AHU-1.ECON-HL', hl);
  const econ = fanOn && oat < pv('AHU-1.ECON-HL') && oat < S.rat;
  logic('AHU-1.ECON-EN', econ ? 1 : 0);
  logic('AHU-1.OA-MIN', sumVbz / .8);
  const minFrac = fanOn ? clamp(pv('AHU-1.OA-MIN') / Math.max(sumCfm, 1), .08, 1) : 0;
  let frac = minFrac;
  if (econ) { const matT = satsp - 1.2; frac = Math.abs(oat - S.rat) > .5 ? clamp((matT - S.rat) / (oat - S.rat), minFrac, 1) : 1; }
  logic('AHU-1.OAD', fanOn ? clamp(frac * 100 * (frac < .99 ? 1.05 : 1), 0, 100) : 0);
  logic('AHU-1.RAD', fanOn ? 100 - pv('AHU-1.OAD') * .95 : 100);
  logic('AHU-1.EAD', fanOn ? clamp(pv('AHU-1.OAD') * .92 - 4, 0, 100) : 0);
  const fr = fanOn ? clamp(pv('AHU-1.OAD') / 100 / (frac < .99 ? 1.05 : 1), 0, 1) : 0;
  S.oaFrac = lag(S.oaFrac, fr, dt || 1, 20);
  logic('AHU-1.OA-CFM', sumCfm * S.oaFrac);
  const cra = ZONES.reduce((a, z) => a + Z[z.id].co2 * Z[z.id].cfm, 0) / Math.max(sumCfm, 1);
  S.csup = fanOn ? S.oaFrac * 420 + (1 - S.oaFrac) * cra : 420;
  const matSS = S.oaFrac * oat + (1 - S.oaFrac) * S.rat;
  S.mat = lag(S.mat, fanOn ? matSS : S.rat, dt || 1, 25);
  S.wma = S.oaFrac * woa + (1 - S.oaFrac) * S.wra;
  logic('AHU-1.MAT', S.mat + noise('mat', sim.t.getTime() / 7e3, 1) * .15);

  // ---- Coils
  const phTarget = satsp - 1.2;
  logic('AHU-1.PHV', fanOn && S.mat < phTarget - .3 ? clamp((phTarget - S.mat) / 40 * 100 * (140 / Math.max(HWST, 100)), 0, 100) : (oat < 35 && !fanOn ? 15 : 0));
  const afterPH = fanOn ? S.mat + pv('AHU-1.PHV') / 100 * 40 * (Math.max(HWST, 100) / 140) : S.mat;
  S.phBtu = fanOn ? 1.08 * sumCfm * Math.max(0, afterPH - S.mat) : 0;
  const coilFloor = S.chwst + 3.5;
  const ccNeed = fanOn && afterPH > phTarget + .2 ? clamp((afterPH - phTarget) / Math.max(afterPH - coilFloor, 1) * 100, 0, 100) : 0;
  logic('AHU-1.CCV', ccNeed);
  const lat = afterPH - pv('AHU-1.CCV') / 100 * Math.max(0, afterPH - coilFloor);
  const wla = Math.min(S.wma, wSat(lat, P) * .96);
  S.ccBtu = fanOn ? Math.max(0, 4.5 * sumCfm * (enthalpy(afterPH, S.wma) - enthalpy(lat, wla))) : 0;
  S.wsa = fanOn ? wla : lag(S.wsa, S.wra, dt || 1, 600);
  const satTarget = fanOn ? lat + 1.2 : lag(S.sat, S.rat, dt || 1, 200);
  S.sat = lag(S.sat, satTarget, dt || 1, 30);
  logic('AHU-1.SAT', S.sat + noise('sat', sim.t.getTime() / 6e3, 1) * .12);
  logic('AHU-1.SA-RH', rhFromW(S.sat, S.wsa, P));
  S.filt = .62 + noise('filt', sim.t.getTime() / 864e5, 1) * .03;
  logic('AHU-1.FILT-DP', fanOn ? S.filt * (spd / 80) ** 2 : 0);

  // ---- Chilled water plant
  const coilTons = S.ccBtu / 12000;
  const baseTons = s.occ ? 6 : 3; // misc. fan-coils, elevator machine room
  const wantPlant = oat > 50 && (coilTons > 4 || (oat > 58 && fanOn));
  logic('CHW.PLANT-EN', wantPlant ? 1 : 0);
  const plantEn = pv('CHW.PLANT-EN') === 1;
  const load = plantEn ? coilTons + baseTons : 0;
  if (load > CH_CAP * .9) S.ch2 = true; else if (load < CH_CAP * .7) S.ch2 = false;
  logic('CHW.CH-1-SS', plantEn ? 1 : 0); logic('CHW.CH-2-SS', plantEn && S.ch2 ? 1 : 0);
  const nCh = pv('CHW.CH-1-SS') + pv('CHW.CH-2-SS');
  logic('CHW.CH-1-STS', pv('CHW.CH-1-SS')); logic('CHW.CH-2-STS', pv('CHW.CH-2-SS'));
  const cap = nCh * CH_CAP;
  const plr = cap ? clamp(load / cap, 0, 1.1) : 0;
  const wb = oaSt.wb;
  logic('CHW.CHWST-SP', 44 + (1 - clamp(plr, 0, 1)) * 2.5);
  const chwTarget = nCh ? pv('CHW.CHWST-SP') + Math.max(0, (load - cap) / Math.max(cap, 1) * 25) : Math.max(58, Math.min(70, S.rat - 6));
  S.chwst = lag(S.chwst, chwTarget, dt || 1, nCh ? 90 : 900);
  const gpm = nCh ? Math.max(nCh * 110, load * 24 / 13.5) : 0;
  const dT = nCh ? load * 24 / gpm : 0;
  S.chwrt = lag(S.chwrt, S.chwst + dT, dt || 1, 60);
  logic('CHW.CHWST', S.chwst + noise('chw', sim.t.getTime() / 8e3, 1) * .1); logic('CHW.CHWRT', S.chwrt);
  logic('CHW.CHW-GPM', gpm + (gpm ? noise('gpm', sim.t.getTime() / 5e3, 1) * 3 : 0)); logic('CHW.CHW-DT', S.chwrt - S.chwst);
  logic('CHW.TONS', load);
  const pspd = nCh ? clamp(28 + 72 * gpm / (nCh * 320), 28, 100) : 0;
  logic('CHW.CHWP-1-SPD', pv('CHW.CH-1-STS') ? pspd : 0); logic('CHW.CHWP-2-SPD', pv('CHW.CH-2-STS') ? pspd : 0);
  logic('CHW.CHW-DP', nCh ? pv('CHW.CHW-DP-SP') + noise('dp', sim.t.getTime() / 6e3, 1) * .3 : 0);
  logic('CHW.CWST-SP', Math.max(65, wb + 7));
  const tf = nCh ? clamp(100 * plr * (1 + (wb - 62) / 22), 18, 100) : 0;
  logic('CHW.CT-1-SPD', pv('CHW.CH-1-STS') ? tf : 0); logic('CHW.CT-2-SPD', pv('CHW.CH-2-STS') ? tf : 0);
  const cwTarget = nCh ? Math.max(pv('CHW.CWST-SP'), wb + 4 + 9 * plr * (1.1 - tf / 100 * .5)) : Math.max(oat, 50);
  S.cwst = lag(S.cwst, cwTarget, dt || 1, nCh ? 120 : 1800);
  const kwt = nCh ? .5 + .26 * (1 - clamp(plr, .1, 1)) ** 2 + .011 * (S.cwst - 85) : 0;
  const chKW = kwt * load;
  const cwgpm = nCh * 375;
  logic('CHW.CW-GPM', cwgpm); logic('CHW.CWP-1-SS', pv('CHW.CH-1-STS')); logic('CHW.CWP-2-SS', pv('CHW.CH-2-STS'));
  logic('CHW.CWST', S.cwst); logic('CHW.CWRT', nCh ? S.cwst + load * 12000 * (1 + kwt * 3412 / 12000) / (500 * cwgpm) : S.cwst);
  [1, 2].forEach(n => { const on = pv(`CHW.CH-${n}-STS`); logic(`CHW.CH-${n}-KW`, on ? chKW / nCh : 0); logic(`CHW.CH-${n}-PLR`, on ? plr * 100 : 0); });
  const pumpKW = nCh * (7.5 * (pspd / 100) ** 2.7 + 5.5) + nCh * 7.5 * (tf / 100) ** 2.7;
  const chwKW = chKW + pumpKW;
  logic('CHW.KW-TON', load > 1 ? chwKW / load : 0);
  logic('CHW.MU-GPM', load * .03);

  // ---- Heating hot water plant
  const heatBtu = reheatBtu + S.phBtu + (s.occ ? 60000 : 20000);
  const wantHW = oat < 65 || hwReq >= 2; // lockout above 65 °F OA unless ≥2 zones request reheat
  logic('HW.PLANT-EN', wantHW ? 1 : 0);
  const hwEn = pv('HW.PLANT-EN') === 1;
  logic('HW.HWST-SP', clamp(map(oat, 10, 60, 160, 120), 120, 160));
  const firing1 = heatBtu / .93 / B_CAP;
  if (firing1 > .9) S.b2 = true; else if (firing1 < .6) S.b2 = false;
  logic('HW.B-1-SS', hwEn ? 1 : 0); logic('HW.B-2-SS', hwEn && S.b2 ? 1 : 0);
  const nB = pv('HW.B-1-SS') + pv('HW.B-2-SS');
  const hwTarget = nB ? pv('HW.HWST-SP') - Math.max(0, (heatBtu / .93 - nB * B_CAP) / 1e4) : Math.max(75, S.rat);
  S.hwst = lag(S.hwst, hwTarget, dt || 1, nB ? 150 : 2400);
  const hgpm = nB ? Math.max(60, heatBtu / (500 * 22)) : 0;
  S.hwrt = lag(S.hwrt, nB ? S.hwst - heatBtu / (500 * Math.max(hgpm, 1)) : S.hwst - 2, dt || 1, 90);
  const eff = clamp(.985 - .0026 * (S.hwrt - 80), .855, .96);
  const gasBtu = nB ? heatBtu / eff : 0;
  logic('HW.HWST', S.hwst); logic('HW.HWRT', S.hwrt); logic('HW.HW-GPM', hgpm); logic('HW.MBH', nB ? heatBtu / 1000 : 0);
  [1, 2].forEach(n => { const on = pv(`HW.B-${n}-SS`); logic(`HW.B-${n}-FIRE`, on ? clamp(gasBtu / nB / B_CAP * 100, 20, 100) : 0); logic(`HW.B-${n}-EFF`, on ? eff * 100 : 0); logic(`HW.HWP-${n}-SPD`, on ? clamp(30 + 70 * hgpm / 260, 30, 100) : 0); });
  logic('HW.GAS-CFH', gasBtu / 1030);
  const hwpKW = nB * 5.5 * (pv('HW.HWP-1-SPD') / 100) ** 2.7;

  // ---- Meters
  const fansKW = pv('AHU-1.SF-KW') + pv('AHU-1.RF-KW');
  const otherKW = 7 + 9 * (s.occ ? .6 : .1) + hwpKW + (s.occ ? 4 : 1.5);
  const kw = ltgW / 1000 + plugW / 1000 + fansKW + chwKW + otherKW;
  logic('MTR.KW-LTG', ltgW / 1000); logic('MTR.KW-PLUG', plugW / 1000); logic('MTR.KW-FANS', fansKW); logic('MTR.KW-CHW', chwKW); logic('MTR.KW-OTHER', otherKW);
  logic('MTR.KW', kw + noise('kw', sim.t.getTime() / 4e3, 1) * 1.2);
  const hrs = (dt || 0) / 3600, E = sim.energy;
  E.kwh += kw * hrs; E.thm += (gasBtu + (s.occ ? 45000 : 12000)) / 1e5 * hrs;
  const wgpm = load * .03 + people * .012 + .3; E.gal += wgpm * 60 * hrs;
  E.dem.push([sim.t.getTime(), kw]); const cut = sim.t.getTime() - 15 * 6e4; while (E.dem.length && E.dem[0][0] < cut) E.dem.shift();
  const dem15 = E.dem.reduce((a, x) => a + x[1], 0) / E.dem.length; E.peak = Math.max(E.peak, dem15);
  logic('MTR.KWH', E.kwh); logic('MTR.KW-PEAK', E.peak); logic('MTR.GAS-THM', E.thm); logic('MTR.GAS-RATE', (gasBtu + (s.occ ? 45000 : 12000)) / 1e5);
  logic('MTR.WTR-GPM', wgpm); logic('MTR.WTR-GAL', E.gal);

  // ---- Faults & reliability flags
  for (const p of pts.values()) p.fault = false;
  for (const id of Object.keys(sim.faults)) { const p = pts.get(id + '.DMPR'); if (p) p.fault = true; }

  // ---- History & alarms
  histAcc += dt;
  if (histAcc >= Math.max(1, sim.speed) || dt === 0) {
    histAcc = 0;
    const tm = sim.t.getTime();
    for (const p of pts.values()) { const v = +pv(p); if (dt > 0) { p.hist.push([tm, v]); if (p.hist.length > 720) p.hist.shift(); } }
  }
  evalAlarms(dt);
  emit('tick', sim);
}

// --- Alarm engine (BACnet intrinsic-reporting style) ---------------------------------
function evalAlarms(dt) {
  const now = sim.t;
  for (const p of pts.values()) {
    if (!p.alarm) continue;
    const bad = !!p.alarm.test(pv(p));
    p._t = bad ? p._t + dt : 0;
    const key = p.id;
    const cur = sim.alarms.get(key);
    if (bad && p._t >= p.alarm.delay && (!cur || cur.state === 'Normal')) {
      const a = { id: key, point: p.id, dev: p.dev, msg: p.alarm.msg, cls: p.alarm.cls, t: new Date(now), value: fmtPV(p) + (p.units ? ' ' + p.units : ''), state: 'Active', acked: false, from: 'normal', to: 'offnormal' };
      sim.alarms.set(key, a); sim.events.unshift({ ...a, kind: 'TO-OFFNORMAL' }); p.inAlarm = true; emit('alarm', a);
    } else if (!bad && cur && cur.state === 'Active') {
      cur.state = 'Normal'; cur.rtn = new Date(now); p.inAlarm = false; sim.events.unshift({ ...cur, kind: 'TO-NORMAL', t: new Date(now) });
      if (cur.acked) sim.alarms.delete(key);
      emit('alarm', cur);
    }
  }
  // Weather alerts from NWS surface as life-safety notifications
  for (const w of wx.alerts || []) {
    const key = 'NWS:' + w.id;
    if (!sim.alarms.has(key) && !sim._nwsSeen?.has(key)) {
      sim._nwsSeen = sim._nwsSeen || new Set(); sim._nwsSeen.add(key);
      const a = { id: key, point: 'NWS', dev: 'NOAA/NWS', msg: w.event + ' — ' + (w.headline || ''), cls: w.severity === 'Extreme' || w.severity === 'Severe' ? 'life' : 'medium', t: new Date(), value: w.severity, state: 'Active', acked: false, external: true };
      sim.alarms.set(key, a); sim.events.unshift({ ...a, kind: 'NOTIFICATION' }); emit('alarm', a);
    }
  }
  if (sim.events.length > 300) sim.events.length = 300;
}
export function ackAlarm(key) { const a = sim.alarms.get(key); if (!a) return; a.acked = true; a.ackT = new Date(); sim.events.unshift({ ...a, kind: 'ACKNOWLEDGED', t: new Date(sim.t) }); if (a.state === 'Normal') sim.alarms.delete(key); emit('alarm', a); }
export const unacked = () => [...sim.alarms.values()].filter(a => !a.acked).length;

// --- Boot: warm the model up so trends and alarms exist on first paint ------------------------
export function warmup() {
  const target = sim.t.getTime();
  sim.t = new Date(target - 60 * 60 * 1000);
  // settle: 20 steps of 60 s without history, then 30 min at 5 s
  for (let i = 0; i < 30; i++) tick(60);
  for (const p of pts.values()) p.hist = [];
  // seed "today" accumulators with a plausible profile-to-date
  const s = schedule(sim.t); const kw = pv('MTR.KW');
  const hrsOcc = Math.max(0, Math.min(s.hr, s.close) - s.open), hrsUn = s.hr - hrsOcc;
  sim.energy.kwh = kw * .92 * hrsOcc + kw * .38 * hrsUn;
  sim.energy.thm = pv('MTR.GAS-RATE') * s.hr * .9;
  sim.energy.gal = pv('MTR.WTR-GPM') * 60 * s.hr * .7;
  sim.energy.peak = Math.max(sim.energy.peak, kw * 1.04);
  for (let i = 0; i < 360; i++) tick(5);
  tick(0);
}
let timer = null;
export function startSim() { clearInterval(timer); timer = setInterval(() => { if (sim.running && !document.hidden) tick(sim.speed); }, 1000); }

// Point search helper for the command palette
export function searchPoints(q, limit = 40) {
  const t = q.toLowerCase().split(/\s+/).filter(Boolean); const out = [];
  for (const p of pts.values()) { const hay = (p.id + ' ' + p.desc).toLowerCase(); if (t.every(x => hay.includes(x))) { out.push(p); if (out.length >= limit) break; } }
  return out;
}
