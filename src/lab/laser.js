// lab/laser.js
// The laser emitter at the top of the lab and the beam(s) that strike down onto
// the object. Look is driven entirely by progression.laserVisual(...), which
// returns a colour, a glow strength and an explicit list of beams (each with its
// own x-offset, width and intensity - small beams are simply narrower/dimmer).
import { Container } from '@pixi/display';
import { Graphics } from '@pixi/graphics';
import { Sprite } from '@pixi/sprite';
import { Texture } from '@pixi/core';
import { BLEND_MODES } from '@pixi/constants';
import { GlowFilter } from '@pixi/filter-glow';
import { LASER_TEX, whenReady } from './assets.js';

const EMITTER_H = 110; // displayed height of the emitter (gun) sprite, in px
const MUZZLE_Y = 100; //  y where the beams emerge (just below the gun's barrel)

export class Laser {
  constructor(dims) {
    this.dims = dims;
    this.cx = dims.center.x;
    this.container = new Container();

    // Emitter (gun) sprite at the very top, centered, pointing down. Swapped to
    // the matching art whenever the laser colour tier changes.
    this.emitter = new Sprite(Texture.EMPTY);
    this.emitter.anchor.set(0.5, 0.5);
    this.emitter.position.set(this.cx, EMITTER_H / 2 + 2);
    this.container.addChild(this.emitter);

    // Beams live in their own container (anchored at the lab's center x) so we
    // can glow them as a group and draw each beam around a local x of 0.
    this.beamLayer = new Container();
    this.beamLayer.x = this.cx;
    this.glow = new GlowFilter({ distance: 18, outerStrength: 2, innerStrength: 0.6, color: 0xff3b46, quality: 0.3 });
    this.beamLayer.filters = [this.glow];
    this.container.addChild(this.beamLayer);

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
  }

  // Rebuild the static parts (emitter sprite, lenses, beam graphics) for a new
  // laser config.
  setVisual(visual) {
    this.visual = visual;
    this.glow.color = visual.color;
    this.glow.outerStrength = visual.glow;

    // Swap to this tier's gun sprite and scale it to a fixed display height.
    const tex = LASER_TEX[visual.tier] || LASER_TEX[0];
    this.emitter.texture = tex;
    whenReady(tex, (w, h) => this.emitter.scale.set(EMITTER_H / h));

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
    this.drawBeams(1);
  }

  drawBeams(flicker) {
    const top = MUZZLE_Y;
    const bottom = this.targetY;
    const color = this.visual.color;
    // Beams whose emitter sits outside this half-width angle inward so they
    // actually strike the object instead of glowing straight past its sides.
    const AIM_HALF = 40;
    for (const g of this.beams) {
      const s = g._spec;
      const half = s.width / 2;
      const I = s.intensity * flicker;

      // Top at the emitter (s.dx), bottom converged toward the object center.
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

      g.position.set(s.dx, top);
      g.rotation = Math.atan2(s.dx - botX, bottom - top); // tilt toward center
    }
  }

  // Called every frame. `bottomY` is where the beam terminates (the scene puts
  // it INSIDE the object so the object occludes the tip); `contactY` is the
  // object's top surface, where the impact flare sits.
  update(deltaMS, bottomY, contactY) {
    this.time += deltaMS;
    this.targetY = bottomY;
    const flicker = 0.85 + 0.15 * Math.sin(this.time * 0.02);
    if (this.beams) this.drawBeams(flicker);

    // Park the flare on the contact point and make it shimmer: a fast pulse in
    // size + alpha and a slow spin of the spikes.
    this.impact.position.set(this.cx, contactY);
    const pulse = 1 + 0.16 * Math.sin(this.time * 0.03);
    this.flareG.scale.set(pulse * flicker);
    this.flareG.alpha = 0.8 + 0.2 * Math.sin(this.time * 0.05);
    this.flareG.rotation += deltaMS * 0.003;
  }
}
