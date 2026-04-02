/**
 * UI helper utilities — heatmap colors, hex conversion, date defaults.
 */

/** Default year for filters: current year, or previous year if ≤7 Jan (UX-DR21). */
export function getInitialYear() {
  const now = new Date();
  if (now.getDate() <= 7 && now.getMonth() === 0) return String(now.getFullYear() - 1);
  return String(now.getFullYear());
}

export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}` : "0,0,0";
}

/** Heatmap background color based on delta percentage (UX-DR9).
 *  Opacity range: 0.05 (min) → 0.22 (max) per spec.
 *  Colors: #34C759 (positive/good), #FF453A (negative/bad).
 */
export function hBg(pct, inv, dk, cfg) {
  if (pct == null || Math.abs(pct) < 1) return "transparent";
  const good = inv ? pct < 0 : pct > 0;

  const maxPct = cfg?.maxPct || 100;
  const MIN_OP = cfg?.baseOpacity ?? 0.05;
  const MAX_OP = Math.min((cfg?.baseOpacity ?? 0.05) + (cfg?.opacityRange ?? 0.17), 0.22);
  const colorHex = good ? (cfg?.colorGood || "#34C759") : (cfg?.colorBad || "#FF453A");

  const normalized = Math.min(Math.abs(pct) / maxPct, 1);
  const opacity = MIN_OP + normalized * (MAX_OP - MIN_OP);
  return `rgba(${hexToRgb(colorHex)},${opacity.toFixed(3)})`;
}
