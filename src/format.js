// format.js
// Compact number formatting for big idle numbers, shared by the UI and the
// in-canvas floating damage text.

// Unit suffixes, hoisted to module scope so the hot formatters don't allocate a
// fresh array on every call (fmt() runs dozens of times per frame from the UI
// refresh + once per floating number).
const FMT_UNITS = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

// The main coin counter shares the same compact "__._K/M/B" style as every other
// figure (shop costs, DPS, etc.) so the whole UI reads consistently — e.g.
// 3,200,000 -> "3.2M". Kept as a named export for the wallet/offline-reward call
// sites; it just floors to a whole coin before delegating to fmt.
export function fmtCoins(n) {
  return fmt(Math.max(0, Math.floor(n)));
}

// Decimals only ever appear below 1 (e.g. "0.2"); anything >= 1 reads as a whole
// number. 1..999 shows the floored integer ("5"), and the suffixed range keeps a
// single significant decimal but drops a bare ".0" ("3.2M", but "5K" not "5.0K").
export function fmt(n) {
  if (n < 1) return String(Math.round(n * 10) / 10); // sub-1: one decimal
  if (n < 1000) return String(Math.floor(n)); // whole numbers, no decimals
  let u = -1;
  let x = n;
  while (x >= 1000 && u < FMT_UNITS.length - 1) {
    x /= 1000;
    u++;
  }
  return x.toFixed(1).replace(/\.0$/, '') + FMT_UNITS[u];
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
