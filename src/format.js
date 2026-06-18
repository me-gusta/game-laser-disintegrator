// format.js
// Compact number formatting for big idle numbers, shared by the UI and the
// in-canvas floating damage text.

// Formatting for the main coin counter. The full number is shown with
// comma-grouped digits all the way through the millions (up to 999,999,999).
// Only once it reaches a billion do we clamp: divide down by 1000s until the
// mantissa fits "__,___" (at most 5 digits) and tack on a unit letter, e.g.
// 1,234,000,000 -> "1,234M", 12,300,000,000,000 -> "12,300B".
export function fmtCoins(n) {
  let x = Math.max(0, Math.floor(n));
  if (x < 1e9) return x.toLocaleString('en-US'); // thousands & millions: unclamped
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  let u = 0;
  // Keep dividing until the mantissa is under 100,000 (fits "__,___").
  while (x >= 1e5 && u < units.length - 1) {
    x = Math.floor(x / 1000);
    u++;
  }
  return x.toLocaleString('en-US') + units[u];
}

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
