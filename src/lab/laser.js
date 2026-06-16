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

    // Emitter housing, sized to span the beam spread.
    const widest = Math.max(...visual.beams.map((b) => b.dx)) + 22;
    this.emitter.clear();
    this.emitter
      .beginFill(0x2a2d3a)
      .lineStyle(2, visual.color, 0.85)
      .drawRoundedRect(this.cx - widest, 8, widest * 2, 24, 6)
      .endFill();
    this.emitter.beginFill(visual.color, 0.95).drawCircle(this.cx, 32, 6).endFill();

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
    const top = 34;
    const bottom = this.targetY;
    const color = this.visual.color;
    for (const g of this.beams) {
      const s = g._spec;
      const half = s.width / 2;
      const I = s.intensity * flicker;
      g.clear();
      // Soft outer glow body.
      g.beginFill(color, 0.18 * I)
        .drawRoundedRect(-s.width + s.dx, top, s.width * 2, bottom - top, half)
        .endFill();
      // Coloured beam.
      g.beginFill(color, 0.85 * I)
        .drawRoundedRect(-half + s.dx, top, s.width, bottom - top, half)
        .endFill();
      // Bright white core.
      g.beginFill(0xffffff, 0.5 * I)
        .drawRoundedRect(-half * 0.5 + s.dx, top, half, bottom - top, half * 0.5)
        .endFill();
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
