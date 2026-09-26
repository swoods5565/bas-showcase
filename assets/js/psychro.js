// Psychrometrics, IP units (°F, lb/lb, Btu/lb, psia)
// Saturation pressure: Hyland–Wexler correlations as published in ASHRAE Handbook—Fundamentals (Ch.1, Eq. 5 & 6)
export const P_STD = 14.696;

export function pws(tF) {
  const T = tF + 459.67;
  if (tF >= 32) {
    const C8 = -1.0440397e4, C9 = -1.1294650e1, C10 = -2.7022355e-2, C11 = 1.2890360e-5, C12 = -2.4780681e-9, C13 = 6.5459673;
    return Math.exp(C8 / T + C9 + C10 * T + C11 * T * T + C12 * T ** 3 + C13 * Math.log(T));
  }
  const C1 = -1.0214165e4, C2 = -4.8932428, C3 = -5.3765794e-3, C4 = 1.9202377e-7, C5 = 3.5575832e-10, C6 = -9.0344688e-14, C7 = 4.1635019;
  return Math.exp(C1 / T + C2 + C3 * T + C4 * T * T + C5 * T ** 3 + C6 * T ** 4 + C7 * Math.log(T));
}
export const pressureFromAltitude = (ft) => 14.696 * Math.pow(1 - 6.8754e-6 * ft, 5.2559);
export function wFromRH(t, rh, P = P_STD) { const pw = (rh / 100) * pws(t); return 0.621945 * pw / (P - pw); }
export function wSat(t, P = P_STD) { return wFromRH(t, 100, P); }
export function rhFromW(t, w, P = P_STD) { const pw = w * P / (0.621945 + w); return Math.min(100, 100 * pw / pws(t)); }
export const enthalpy = (t, w) => 0.240 * t + w * (1061 + 0.444 * t);
export function tFromHW(h, w) { return (h - 1061 * w) / (0.240 + 0.444 * w); }
function bisect(f, lo, hi, n = 60) { let a = lo, b = hi, fa = f(a); for (let i = 0; i < n; i++) { const m = (a + b) / 2, fm = f(m); if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else b = m; } return (a + b) / 2; }
export function dewPoint(t, w, P = P_STD) { if (w <= 0) return -80; return bisect(td => wSat(td, P) - w, -80, t + 0.001); }
export function wetBulb(t, w, P = P_STD) {
  return bisect(twb => {
    const ws = wSat(twb, P);
    const wCalc = twb >= 32
      ? ((1093 - 0.556 * twb) * ws - 0.240 * (t - twb)) / (1093 + 0.444 * t - twb)
      : ((1220 - 0.04 * twb) * ws - 0.240 * (t - twb)) / (1220 + 0.444 * t - 0.48 * twb);
    return wCalc - w;
  }, -40, t);
}
export function state(t, rh, P = P_STD) {
  const w = wFromRH(t, rh, P);
  return { t, rh, w, gr: w * 7000, h: enthalpy(t, w), dp: dewPoint(t, w, P), wb: wetBulb(t, w, P) };
}
export function stateTW(t, w, P = P_STD) { return { t, w, gr: w * 7000, rh: rhFromW(t, w, P), h: enthalpy(t, w), dp: dewPoint(t, w, P), wb: wetBulb(t, w, P) }; }
