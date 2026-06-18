// lab/laser.js
// The laser emitter at the top of the lab and the beam(s) that strike down onto
// the object. Look is driven entirely by progression.laserVisual(...), which
// returns a colour, a glow strength and an explicit list of beams (each with its
// own x-offset, width and intensity - small beams are simply narrower/dimmer).
import { Container } from '@pixi/display';
import { Graphics } from '@pixi/graphics';
import { Sprite } from '@pixi/sprite';
import { BLEND_MODES } from '@pixi/constants';
import { GlowFilter } from '@pixi/filter-glow';
import { LASER_TEX, whenReady } from './assets.js';

const EMITTER_H = 82; //  displayed height of an emitter (gun) sprite, in px
const MUZZLE_Y = 74; //   y where the beams emerge (just below the gun's barrel)
const AIM_HALF = 40; //   beams (and their guns) angle inward to land within ±this
//                        of the object center, so a wide fan still strikes it.

export class Laser {
  constructor(dims) {
    this.dims = dims;
    this.cx = dims.center.x;
    this.container = new Container();

    // Beams live in their own container (anchored at the lab's center x) so we
    // can glow them as a group and draw each beam around a local x of 0.
    this.beamLayer = new Container();
    this.beamLayer.x = this.cx;
    this.glow = new GlowFilter({ distance: 18, outerStrength: 2, innerStrength: 0.6, color: 0xff3b46, quality: 0.3 });
    this.beamLayer.filters = [this.glow];
    this.container.addChild(this.beamLayer);

    // One emitter (gun) sprite PER beam, in their own layer (also anchored at the
    // lab's center x so a gun's local x is just its beam's dx). Each gun sits at
    // the mouth of its beam and is rotated to point straight down it — so when
    // many beams fan out and won't fit side by side, their guns angle inward with
    // them. Rebuilt to match the beam list whenever the laser config changes.
    this.emitterLayer = new Container();
    this.emitterLayer.x = this.cx;
    this.container.addChild(this.emitterLayer);
    this.emitters = [];

    // Glowing muzzle lenses (one per beam) drawn on top of the gun, recoloured
    // to the tier each rebuild.
    this.lens = new Graphics();
    this.container.addChild(this.lens);

    // Impact flare at the point the beam meets the object. Lives in its OWN
    // container (added to the scene ABOVE the target by the scene) so it reads
    // as a hot spot on the object's surface — while the beams themselves are
    // layered BEHIND the target and plunge into it. Additive blend = bright bloom.
    this.impact = new Container();
    this.flareG = new Graphics();
    this.flareG.blendMode = BLEND_MODES.ADD;
    this.impact.addChild(this.flareG);

    this.time = 0;
    this.visual = null;
    this.targetY = dims.center.y; // beam terminus (scene sets it inside the object)
    this._drawnBottom = -1; //    targetY the beam geometry was last drawn for
    //                            (geometry is only rebuilt when the terminus moves)
    this.fire = 1; // firing intensity 0..1; eased toward 1 while an object is present,
    //               toward 0 when there's nothing to disintegrate (gun powers down).
  }

  // Rebuild the static parts (emitter sprite, lenses, beam graphics) for a new
  // laser config.
  setVisual(visual) {
    this.visual = visual;
    this.glow.color = visual.color;
    this.glow.outerStrength = visual.glow;

    // Build one gun per beam, each scaled to a fixed display height and parked at
    // its beam's mouth (its dx). The per-frame rotation/recoil is applied later in
    // layoutGuns(); here we just (re)create the right number of sprites.
    const tex = LASER_TEX[visual.tier] || LASER_TEX[0];
    this.emitterLayer.removeChildren();
    this.emitters = visual.beams.map((b) => {
      const gun = new Sprite(tex);
      gun.anchor.set(0.5, 0.5);
      gun._dx = b.dx; // its beam's x-offset (rest position / muzzle x)
      whenReady(tex, (w, h) => gun.scale.set(EMITTER_H / h));
      this.emitterLayer.addChild(gun);
      return gun;
    });

    // A glowing lens at each beam's mouth, sized to that beam.
    this.lens.clear();
    for (const b of visual.beams) {
      this.lens
        .beginFill(visual.color, 0.95)
        .drawCircle(this.cx + b.dx, MUZZLE_Y, Math.max(2.5, b.width * 0.4))
        .endFill();
    }

    this.drawFlare(visual.color, visual.power);
    this.rebuildBeams();
  }

  // Static art for the impact flare: a white-hot core, a coloured halo and a
  // ring of spikes. Sized by laser power. Animated (scale/alpha/spin) in update.
  drawFlare(color, power) {
    const g = this.flareG;
    g.clear();
    const base = 11 + power * 3.5; // core radius grows with power
    // Spikes first (under the round bloom).
    const rays = 7;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const len = base * 2.6;
      const wob = base * 0.22;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      const px = -sinA * wob;
      const py = cosA * wob;
      g.beginFill(color, 0.5)
        .drawPolygon([cosA * len, sinA * len, px, py, -px, -py])
        .endFill();
    }
    g.beginFill(color, 0.28).drawCircle(0, 0, base * 1.7).endFill();
    g.beginFill(color, 0.55).drawCircle(0, 0, base * 1.05).endFill();
    g.beginFill(0xffffff, 0.95).drawCircle(0, 0, base * 0.55).endFill();
  }

  rebuildBeams() {
    this.beamLayer.removeChildren();
    this.beams = this.visual.beams.map((spec) => {
      const g = new Graphics();
      g._spec = spec;
      this.beamLayer.addChild(g);
      return g;
    });
    this.drawBeams();
    this.layoutGuns(0, 0, 0); // park the guns at rest before the first frame
  }

  // Rebuild the beam geometry for the CURRENT terminus. Only the per-frame
  // firing/flicker intensity used to live here, forcing a full re-tessellation
  // of three rounded rects per beam every frame; that factor is now applied as a
  // cheap per-beam `alpha` in update() instead, so this only runs when the beam's
  // length actually changes (see the threshold guard in update). Base per-fill
  // alphas bake in the beam's own `intensity`; alpha then scales by flicker*fire.
  drawBeams() {
    const top = MUZZLE_Y;
    const bottom = this.targetY;
    const color = this.visual.color;
    for (const g of this.beams) {
      const s = g._spec;
      const half = s.width / 2;
      const I = s.intensity;

      // Top at the emitter (s.dx), bottom converged toward the object center.
      // Beams whose emitter sits outside ±AIM_HALF angle inward so they actually
      // strike the object instead of glowing straight past its sides.
      const botX = Math.max(-AIM_HALF, Math.min(AIM_HALF, s.dx));
      const len = Math.hypot(botX - s.dx, bottom - top);

      g.clear();
      // Drawn straight (downward), then rotated so its foot lands on the object.
      // Soft outer glow body.
      g.beginFill(color, 0.18 * I).drawRoundedRect(-s.width, 0, s.width * 2, len, half).endFill();
      // Coloured beam.
      g.beginFill(color, 0.85 * I).drawRoundedRect(-half, 0, s.width, len, half).endFill();
      // Bright white core.
      g.beginFill(0xffffff, 0.5 * I).drawRoundedRect(-half * 0.5, 0, half, len, half * 0.5).endFill();

      const theta = Math.atan2(s.dx - botX, bottom - top); // tilt toward center
      g.position.set(s.dx, top);
      g.rotation = theta;
      g._theta = theta; // shared with the matching gun (layoutGuns)
    }
    this._drawnBottom = bottom;
  }

  // Aim each gun straight down its beam and apply the firing recoil. The gun is
  // anchored at its centre, so to keep the muzzle pinned at the beam's mouth
  // (dx, MUZZLE_Y) while it rotates by theta we offset the centre back up the
  // barrel by MD; the recoil `kick` then shoves it a little further back along
  // that same barrel axis (away from the object) plus a small vibration.
  layoutGuns(kick, vibX, vibY) {
    if (!this.emitters || !this.beams) return;
    const MD = MUZZLE_Y - (EMITTER_H / 2 + 2); // centre -> muzzle distance
    for (let i = 0; i < this.emitters.length; i++) {
      const gun = this.emitters[i];
      const beam = this.beams[i];
      const theta = beam ? beam._theta : 0;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      const back = MD + kick; // centre sits this far back up the barrel
      gun.rotation = theta;
      gun.position.set(gun._dx + back * sin + vibX, MUZZLE_Y - back * cos + vibY);
    }
  }

  // Called every frame. `bottomY` is where the beam terminates (the scene puts
  // it INSIDE the object so the object occludes the tip); `contactY` is the
  // object's top surface, where the impact flare sits. `firing` is true while an
  // object is present; when it goes false the whole laser eases off (beams fade,
  // gun stops recoiling, glow dies) instead of cutting out abruptly.
  update(deltaMS, bottomY, contactY, firing = true) {
    this.time += deltaMS;
    this.targetY = bottomY;

    // Ease firing intensity toward the target (≈120ms time constant) so the
    // laser powers up/down gradually.
    const target = firing ? 1 : 0;
    this.fire += (target - this.fire) * Math.min(1, deltaMS / 120);
    if (this.fire < 0.001) this.fire = 0;
    const f = this.fire;

    const flicker = 0.85 + 0.15 * Math.sin(this.time * 0.02);
    if (this.beams) {
      // Rebuild geometry only when the terminus actually moved (the object bobs
      // and erodes slowly, so this is a handful of redraws/sec, not 60). The
      // firing/flicker intensity is applied as a uniform per-beam alpha — the
      // exact product s.intensity * flicker * fire as before, but with the
      // intensity baked into the geometry's fill alpha by drawBeams().
      if (Math.abs(this.targetY - this._drawnBottom) > 1) this.drawBeams();
      const beamAlpha = flicker * f;
      for (const g of this.beams) g.alpha = beamAlpha;
    }

    // Beam group glow + muzzle lens fade out with the firing intensity.
    if (this.visual) this.glow.outerStrength = this.visual.glow * f;
    this.lens.alpha = f * (0.75 + 0.25 * Math.sin(this.time * 0.04));

    // Animate the guns while they fire: a small steady recoil (kicked back along
    // each barrel, away from the beam) plus two out-of-phase vibrations, all
    // scaled by `f` so they settle back to rest as the laser powers down.
    const kick = f * (1.6 + 0.5 * Math.sin(this.time * 0.08));
    const vibX = f * 0.9 * Math.sin(this.time * 0.5);
    const vibY = f * 0.7 * Math.sin(this.time * 0.43 + 1.3);
    this.layoutGuns(kick, vibX, vibY);

    // Park the flare on the contact point and make it shimmer: a fast pulse in
    // size + alpha and a slow spin of the spikes — faded by `f` so it vanishes
    // with the beam when there's nothing to hit.
    this.impact.position.set(this.cx, contactY);
    const pulse = 1 + 0.16 * Math.sin(this.time * 0.03);
    this.flareG.scale.set(pulse * flicker * f);
    this.flareG.alpha = f * (0.8 + 0.2 * Math.sin(this.time * 0.05));
    this.flareG.rotation += deltaMS * 0.003;
  }
}
