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
