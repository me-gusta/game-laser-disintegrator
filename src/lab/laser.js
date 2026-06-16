// lab/laser.js
// The laser emitter at the top of the lab and the beam(s) that strike down onto
// the object. Look is driven entirely by progression.laserVisual(...), which
// returns a colour, a glow strength and an explicit list of beams (each with its
// own x-offset, width and intensity - small beams are simply narrower/dimmer).
import { Container } from '@pixi/display';
import { Graphics } from '@pixi/graphics';
import { GlowFilter } from '@pixi/filter-glow';

export class Laser {
  constructor(dims) {
    this.dims = dims;
    this.cx = dims.center.x;
    this.container = new Container();

    // Emitter housing at the very top, centered.
    this.emitter = new Graphics();
    this.container.addChild(this.emitter);

    // Beams live in their own container (anchored at the lab's center x) so we
    // can glow them as a group and draw each beam around a local x of 0.
    this.beamLayer = new Container();
    this.beamLayer.x = this.cx;
    this.glow = new GlowFilter({ distance: 18, outerStrength: 2, innerStrength: 0.6, color: 0xff3b46, quality: 0.3 });
    this.beamLayer.filters = [this.glow];
    this.container.addChild(this.beamLayer);

    this.time = 0;
    this.visual = null;
    this.targetY = dims.center.y; // updated by the scene to the object's top
  }

  // Rebuild the static parts (emitter + beam graphics) for a new laser config.
  setVisual(visual) {
    this.visual = visual;
    this.glow.color = visual.color;
    this.glow.outerStrength = visual.glow;

    // Each beam gets its own gray emitter block, sized to that beam (small
    // beams -> smaller blocks). Blocks grow with thickness as the beams widen.
    this.emitter.clear();
    for (const b of visual.beams) {
      const bx = this.cx + b.dx;
      const bw = b.width * 2 + 8;
      const bh = 18;
      this.emitter
        .beginFill(0x3a3f52)
        .lineStyle(2, visual.color, 0.85)
        .drawRoundedRect(bx - bw / 2, 8, bw, bh, 5)
        .endFill();
      // Glowing emitter lens at the mouth of the block.
      this.emitter.beginFill(visual.color, 0.95).drawCircle(bx, 8 + bh - 3, Math.max(2.5, b.width * 0.32)).endFill();
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
    const top = 28;
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
