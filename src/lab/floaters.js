// lab/floaters.js
// Floating damage numbers that rise from the object and fade out. The fill is a
// punchier (more saturated) take on the current laser's colour so the numbers
// read as belonging to the beam; the outline stays white for the classic
// "hit number" pop. Impact font.
import { Container } from '@pixi/display';
import { Text, TextStyle } from '@pixi/text';
import { fmt } from '../format.js';

// Shared look for every number. `fill` is overridden per laser-colour below.
const BASE = {
  fontFamily: 'Impact, "Arial Black", Haettenschweiler, sans-serif',
  fontSize: 30,
  fontWeight: 'bold',
  stroke: 0xffffff, //      white outline
  strokeThickness: 4,
  lineJoin: 'round',
};

const MAX_LIVE = 40; // safety cap so rapid clicking can't pile up text

// Take the laser's hue but slam it almost to black: a near-black ink with just
// a faint cast of the beam's colour, so the number reads dark (against its white
// outline) while still hinting at which laser dealt the hit. A greyscale colour
// (e.g. the white laser) has no hue and becomes a plain near-black.
function vivid(rgb) {
  const r = ((rgb >> 16) & 0xff) / 255;
  const g = ((rgb >> 8) & 0xff) / 255;
  const b = (rgb & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    const l0 = (max + min) / 2;
    s = l0 > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  if (s === 0) return 0x0a0a0a; // greyscale: plain near-black
  s = Math.min(1, s * 1.1 + 0.35); // keep the tint perceptible at this darkness
  const l = 0.13; //                very dark — almost black, a little colour
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const to = (v) => Math.round(v * 255);
  return (to(ch(h + 1 / 3)) << 16) | (to(ch(h)) << 8) | to(ch(h - 1 / 3));
}

export class Floaters {
  constructor() {
    this.container = new Container();
    this.items = [];
    this.styles = new Map(); // laser colour -> TextStyle (built once per colour)
  }

  // A TextStyle whose fill is the vivid form of `color`, cached so repeated
  // pops at the same laser tier don't reallocate a style every frame.
  styleFor(color) {
    let st = this.styles.get(color);
    if (!st) {
      st = new TextStyle({ ...BASE, fill: vivid(color) });
      this.styles.set(color, st);
    }
    return st;
  }

  // Spawn a number that floats up from near (x, y) — typically a hole's centre.
  // It's nudged a short random distance off-centre so it reads as erupting from
  // around the hole's rim rather than dead centre, and so stacked hits scatter.
  // `color` is the current laser colour; the fill is a saturated version of it.
  pop(amount, x, y, color = 0xffffff) {
    if (this.items.length >= MAX_LIVE) {
      const old = this.items.shift();
      this.container.removeChild(old.t);
      old.t.destroy();
    }
    const t = new Text(fmt(amount), this.styleFor(color));
    t.anchor.set(0.5);
    const a = Math.random() * Math.PI * 2;
    const off = 8 + Math.random() * 16; // 8..24px from the hole centre
    t.x = x + Math.cos(a) * off;
    t.y = y + Math.sin(a) * off;
    // Size scales with the hit: a sliver of damage pops a tiny number, and it
    // grows linearly to full size at 100+ damage. A small random jitter keeps
    // equal hits from looking stamped-out.
    const grow = 0.6 + 0.4 * Math.min(1, Math.max(0, amount) / 100); // 0.6..1.0
    t.scale.set(grow * (0.92 + Math.random() * 0.16));
    this.container.addChild(t);
    this.items.push({ t, life: 0, ttl: 850, vy: -0.06 - Math.random() * 0.03 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life += dt;
      it.t.y += it.vy * dt;
      const k = it.life / it.ttl;
      it.t.alpha = k < 0.55 ? 1 : Math.max(0, 1 - (k - 0.55) / 0.45);
      if (it.life >= it.ttl) {
        this.container.removeChild(it.t);
        it.t.destroy();
        this.items.splice(i, 1);
      }
    }
  }
}
