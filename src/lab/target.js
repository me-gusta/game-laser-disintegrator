// lab/target.js
// The object being disintegrated. It is a simple geometric shape that hovers
// above the ground. As durability drops we punch growing circular "holes" into
// it (painted in the lab background colour) to show it being eaten away. Holes
// accumulate CONTINUOUSLY as durability falls, plus three bigger "snap" craters
// at the 72/46/22% thresholds (each with a shard burst).
import { Container } from '@pixi/display';
import { Graphics } from '@pixi/graphics';
import { SHAPES } from '../state.js';

const R = 54; // base radius of the shape
const LAB_BG = 0x0d0f17; // lab background; craters are painted in it to "eat" the shape
const MAX_EROSION = 22; // fine holes punched by the time the object is destroyed

// Vertices for a regular polygon with `n` sides, pointing up.
function polygon(n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    pts.push(Math.cos(a) * R, Math.sin(a) * R);
  }
  return pts;
}

function drawShape(g, shape, color) {
  g.beginFill(color, 0.95).lineStyle(3, 0xffffff, 0.35);
  switch (shape) {
    case 'circle':
      g.drawCircle(0, 0, R);
      break;
    case 'rectangle':
      g.drawRoundedRect(-R, -R * 0.78, R * 2, R * 1.56, 8);
      break;
    case 'triangle':
      g.drawPolygon(polygon(3));
      break;
    case 'pentagon':
      g.drawPolygon(polygon(5));
      break;
    case 'hexagon':
      g.drawPolygon(polygon(6));
      break;
  }
  g.endFill();
}

export class Target {
  constructor(dims) {
    this.dims = dims;
    this.R = R;
    this.container = new Container();
    this.container.x = dims.center.x;
    this.baseY = dims.center.y;

    this.shapeG = new Graphics();
    this.damageG = new Graphics(); // craters painted over the shape in the bg color
    this.container.addChild(this.shapeG, this.damageG);

    this.holes = []; //    big "snap" craters
    this.erosion = []; //  many fine erosion craters (grow with damage)
    this.bob = 0;
    this.frac = 1; //         current durability fraction (1 = pristine)
    this.lastDrawnFrac = 1; // throttles redraws to ~1.5% steps
    this.shape = 'circle';
    this.color = 0xffffff;
  }

  // Reset for a freshly spawned object.
  spawn(shape, color) {
    this.shape = shape;
    this.color = color;
    this.holes = [];
    this.erosion = [];
    this.frac = 1;
    this.lastDrawnFrac = 1;
    drawShape(this.shapeG.clear(), shape, color);
    this.redrawDamage();
    this.container.scale.set(1);
    this.container.alpha = 1;
  }

  // Continuous erosion driven by durability fraction (1 -> 0), called each frame
  // by the scene. Throttled so we only repaint every ~1.5% of progress. As damage
  // grows we punch more small holes into the shape.
  setDamage(frac) {
    this.frac = Math.max(0, Math.min(1, frac));
    if (Math.abs(this.frac - this.lastDrawnFrac) < 0.015) return;
    this.lastDrawnFrac = this.frac;
    const dmg = 1 - this.frac;
    const target = Math.floor(dmg * MAX_EROSION);
    while (this.erosion.length < target) {
      const angle = (Math.random() - 0.5) * Math.PI * 2;
      const dist = R * (0.25 + Math.random() * 0.6);
      this.erosion.push({
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        r: R * (0.12 + Math.random() * 0.14),
      });
    }
    this.redrawDamage();
  }

  // Paint each crater in the background color so the shape looks eaten away.
  redrawDamage() {
    const g = this.damageG;
    g.clear();
    for (const h of this.erosion) {
      g.beginFill(LAB_BG, 1).drawCircle(h.x, h.y, h.r).endFill();
    }
    for (const h of this.holes) {
      g.beginFill(LAB_BG, 1).drawCircle(h.x, h.y, h.r).endFill();
    }
  }

  // Punch a new (bigger) destruction crater. `tier` is 1..3 (controls size).
  // Returns the world-space point where shards should erupt from.
  addDestruction(tier) {
    // Random point biased to the rim so the bite reads from a side.
    const angle = (Math.random() - 0.5) * Math.PI * 2;
    const dist = R * (0.4 + Math.random() * 0.5);
    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist;
    const r = R * (0.32 + tier * 0.13);
    this.holes.push({ x, y, r });
    this.redrawDamage();
    return { x: this.container.x + x, y: this.container.y + y };
  }

  update(deltaMS) {
    // Gentle hover.
    this.bob += deltaMS * 0.003;
    this.container.y = this.baseY + Math.sin(this.bob) * 6;
  }

  topY() {
    return this.container.y - R;
  }

  // Index of this shape (for progression lookups elsewhere if needed).
  static shapeIndex(name) {
    return SHAPES.indexOf(name);
  }
}
