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
  fontSize: 34,
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
    // Free list of idle Text objects. Pops are frequent (one per collected shard
    // plus per damage hole), so we reuse Text instances instead of allocating a
    // fresh canvas + GPU texture per pop and destroying it on expiry. Bounded by
    // MAX_LIVE since we only ever release what we spawned.
    this.pool = [];
  }

  // Borrow a Text from the pool (or make one), set to show `str` in `style`.
  _acquire(str, style) {
    const t = this.pool.pop();
    if (!t) return new Text(str, style);
    t.text = str; //   reuses the Text's existing canvas/texture in place
    t.style = style;
    t.visible = true;
    return t;
  }

  // Return a spent Text to the pool (kept alive, just detached + hidden).
  _release(t) {
    this.container.removeChild(t);
    t.visible = false;
    this.pool.push(t);
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

  // Style for coin pickups: dark-yellow ink on the shared white outline. Built
  // once and cached.
  coinStyle() {
    if (!this._coinStyle) this._coinStyle = new TextStyle({ ...BASE, fill: 0xc9a227 });
    return this._coinStyle;
  }

  // Spawn a damage number (laser/click) that floats up from near (x, y) —
  // typically a hole's centre. `color` is the current laser colour; the fill is
  // a saturated version of it.
  pop(amount, x, y, color = 0xffffff) {
    this._spawn(fmt(amount), this.styleFor(color), x, y, amount);
  }

  // Spawn a coin number (a vacuum picking up a shard) at the shard's position.
  // Same look/motion as a damage number but dark-yellow and prefixed with "+".
  popCoin(amount, x, y) {
    this._spawn(`+${fmt(amount)}`, this.coinStyle(), x, y, amount, 0.8);
  }

  // Acquire a pooled Text showing `str`/`style`, place it near (x, y) and start
  // its float/fade. The number is nudged a short random distance off-centre so it
  // reads as erupting from around the spot rather than dead centre, and so
  // stacked pops scatter. `sizeMul` scales the whole number down (coins read a
  // touch smaller than hits).
  _spawn(str, style, x, y, amount, sizeMul = 1) {
    if (this.items.length >= MAX_LIVE) {
      const old = this.items.shift();
      this._release(old.t);
    }
    const t = this._acquire(str, style);
    t.anchor.set(0.5);
    t.alpha = 1; // reset (a reused Text may have faded out on its last life)
    const a = Math.random() * Math.PI * 2;
    const off = 8 + Math.random() * 16; // 8..24px from the centre
    t.x = x + Math.cos(a) * off;
    t.y = y + Math.sin(a) * off;
    // Size scales with the amount, but stays readable even for the small single-
    // digit values of early game: numbers start near full size and reach full
    // size by ~40. A small random jitter keeps equal pops from looking stamped.
    const grow = 0.85 + 0.15 * Math.min(1, Math.max(0, amount) / 40); // 0.85..1.0
    t.scale.set(sizeMul * grow * (0.92 + Math.random() * 0.16));
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
        this._release(it.t);
        this.items.splice(i, 1);
      }
    }
  }
}
