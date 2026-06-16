// lab/floaters.js
// Floating damage numbers that rise from the object and fade out. Black fill,
// white stroke, Impact font - the classic "hit number" look.
import { Container } from '@pixi/display';
import { Text, TextStyle } from '@pixi/text';
import { fmt } from '../format.js';

const STYLE = new TextStyle({
  fontFamily: 'Impact, "Arial Black", Haettenschweiler, sans-serif',
  fontSize: 30,
  fontWeight: 'bold',
  fill: 0x000000, //        black fill
  stroke: 0xffffff, //      white outline
  strokeThickness: 4,
  lineJoin: 'round',
});

const MAX_LIVE = 40; // safety cap so rapid clicking can't pile up text

export class Floaters {
  constructor() {
    this.container = new Container();
    this.items = [];
  }

  // Spawn a number that floats up from (x, y).
  pop(amount, x, y) {
    if (this.items.length >= MAX_LIVE) {
      const old = this.items.shift();
      this.container.removeChild(old.t);
      old.t.destroy();
    }
    const t = new Text(fmt(amount), STYLE);
    t.anchor.set(0.5);
    t.x = x + (Math.random() - 0.5) * 34;
    t.y = y;
    t.scale.set(0.85 + Math.random() * 0.25);
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
