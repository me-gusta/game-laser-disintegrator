// lab/laser.js
// The laser emitter at the top of the lab and the beam(s) that strike down onto
// the object. Look is driven entirely by progression.laserVisual(...), which
// returns a colour, a glow strength and an explicit list of beams (each with its
// own x-offset, width and intensity - small beams are simply narrower/dimmer).
import { Container } from '@pixi/display';
import { Graphics } from '@pixi/graphics';
import { Sprite } from '@pixi/sprite';
import { Texture } from '@pixi/core';
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

    this.time = 0;
    this.visual = null;
    this.targetY = dims.center.y; // updated by the scene to the object's top
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

    this.rebuildBeams();
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

  // Called every frame: gentle flicker + keep beams reaching the object.
  update(deltaMS, targetY) {
    this.time += deltaMS;
    this.targetY = targetY;
    const flicker = 0.85 + 0.15 * Math.sin(this.time * 0.02);
    if (this.beams) this.drawBeams(flicker);
  }
}
