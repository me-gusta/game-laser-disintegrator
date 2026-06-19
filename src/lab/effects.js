// lab/effects.js
// Transient "juice" effects drawn over the lab: screen shake, white bloom
// flashes, expanding shockwave rings and a tier-up colour wash. All of it is
// pooled Graphics on a single additive-friendly layer the scene parks on top of
// everything, plus a shake offset the scene applies to its own container each
// frame. Nothing here touches state — the scene just calls these on the moments
// it wants punctuated (snaps, shatter, clicks, tier crossings).
import { Container } from '@pixi/display';
import { Graphics } from '@pixi/graphics';
import { BLEND_MODES } from '@pixi/constants';

// Smooth 0..1 ease-out so blooms/rings decelerate as they expand.
const easeOut = (t) => 1 - (1 - t) * (1 - t);

export class Effects {
  constructor(dims) {
    this.dims = dims;
    this.container = new Container();

    // Full-lab colour wash for the tier-up celebration (drawn at the BOTTOM of
    // this layer so blooms/rings still pop over it). Oversized a touch so the
    // screen-shake offset never bares an uncovered edge.
    this.wash = new Graphics();
    this.wash.visible = false;
    this.container.addChild(this.wash);
    this.washLife = 0;
    this.washTtl = 0;
    this.washColor = 0xffffff;

    // Active bloom/ring effects + a free list of their Graphics (clicks ripple
    // often, so recycle rather than allocate/destroy per pop).
    this.items = [];
    this.pool = [];

    // Decaying screen shake. The scene reads `offset` every frame and applies it
    // to its container's position.
    this.shakeMag = 0;
    this.shakeDur = 0;
    this.shakeTime = 0;
    this.offset = { x: 0, y: 0 };
  }

  _acquire() {
    const g = this.pool.pop() || new Graphics();
    g.blendMode = BLEND_MODES.ADD;
    g.visible = true;
    g.alpha = 1;
    this.container.addChild(g);
    return g;
  }

  _release(g) {
    this.container.removeChild(g);
    g.clear();
    this.pool.push(g);
  }

  // A white-hot bloom that scales up from the point and fades — the "boom" core.
  flash(x, y, color = 0xffffff, maxR = 120, ttl = 300) {
    this.items.push({ kind: 'bloom', g: this._acquire(), x, y, color, maxR, life: 0, ttl });
  }

  // An expanding, fading stroked ring — reads as a shockwave.
  shockwave(x, y, color = 0xffffff, maxR = 160, ttl = 480) {
    this.items.push({ kind: 'ring', g: this._acquire(), x, y, color, maxR, life: 0, ttl });
  }

  // Flood the whole lab with `color`, fading out — the new laser colour washing
  // across the scene on a tier crossing.
  tierWash(color) {
    this.washColor = color;
    this.washLife = 0;
    this.washTtl = 560;
    this.wash.visible = true;
  }

  // Kick off (or strengthen) a screen shake. Larger `mag` = heavier hit.
  shake(mag, durMS = 200) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeDur = Math.max(this.shakeDur, durMS);
    this.shakeTime = 0;
  }

  update(dt) {
    // Bloom / ring effects.
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life += dt;
      const k = Math.min(1, it.life / it.ttl);
      const g = it.g;
      g.clear();
      if (it.kind === 'bloom') {
        const r = it.maxR * easeOut(k);
        const a = 1 - k;
        g.beginFill(it.color, 0.5 * a).drawCircle(0, 0, r).endFill();
        g.beginFill(0xffffff, 0.9 * a).drawCircle(0, 0, r * 0.5).endFill();
      } else {
        const r = it.maxR * easeOut(k);
        const a = 1 - k;
        g.lineStyle(Math.max(1, 6 * (1 - k)), it.color, a).drawCircle(0, 0, r);
      }
      g.position.set(it.x, it.y);
      if (k >= 1) {
        this._release(g);
        this.items.splice(i, 1);
      }
    }

    // Tier-up colour wash (a quick rise then fade).
    if (this.washTtl > 0) {
      this.washLife += dt;
      const k = Math.min(1, this.washLife / this.washTtl);
      // Rise fast (first 20%) then ebb away.
      const a = (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8) * 0.45;
      const { width, height } = this.dims;
      this.wash.clear();
      this.wash.beginFill(this.washColor, Math.max(0, a)).drawRect(-30, -30, width + 60, height + 60).endFill();
      if (k >= 1) {
        this.washTtl = 0;
        this.wash.visible = false;
      }
    }

    // Decaying screen shake -> offset the scene reads each frame.
    if (this.shakeDur > 0) {
      this.shakeTime += dt;
      const k = this.shakeTime / this.shakeDur;
      if (k >= 1) {
        this.shakeMag = 0;
        this.shakeDur = 0;
        this.offset.x = 0;
        this.offset.y = 0;
      } else {
        const m = this.shakeMag * (1 - k); // linear decay of amplitude
        this.offset.x = (Math.random() * 2 - 1) * m;
        this.offset.y = (Math.random() * 2 - 1) * m;
      }
    }
  }
}
