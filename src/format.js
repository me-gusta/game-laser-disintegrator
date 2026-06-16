// format.js
// Compact number formatting for big idle numbers, shared by the UI and the
// in-canvas floating damage text.
export function fmt(n) {
  if (n < 1000) return String(Math.round(n * 10) / 10).replace(/\.0$/, '');
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  let u = -1;
  let x = n;
  while (x >= 1000 && u < units.length - 1) {
    x /= 1000;
    u++;
  }
  return x.toFixed(2) + units[u];
}

// Human-readable away-time, e.g. "12h 0m", "5m 30s", "45s". Shows at most the
// two most significant non-zero units.
export function fmtDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
