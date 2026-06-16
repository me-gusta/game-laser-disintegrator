// lab/target.js
// The object being disintegrated. It is a simple geometric shape that hovers
// above the ground. As durability drops we punch growing circular "holes" into
// it (an inverse circle-mask built from Graphics.beginHole) to show it being
// eaten away from random sides. 3 destruction tiers before it shatters.
import { Container } from '@pixi/display';
import { Graphics } from '@pixi/graphics';
import { SHAPES } from '../state.js';

const R = 54; // base radius of the shape
const LAB_BG = 0x0d0f17; // lab background; craters are painted in it to "eat" the shape

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

    this.holes = [];
    this.bob = 0;
    this.shape = 'circle';
    this.color = 0xffffff;
  }

  // Reset for a freshly spawned object.
  spawn(shape, color) {
    this.shape = shape;
    this.color = color;
    this.holes = [];
    this.shapeG.clear();
    drawShape(this.shapeG, shape, color);
    this.redrawDamage();
    this.container.scale.set(1);
    this.container.alpha = 1;
  }

  // Paint each crater in the background color so the shape looks eaten away.
  redrawDamage() {
    const g = this.damageG;
    g.clear();
    for (const h of this.holes) {
      g.beginFill(LAB_BG, 1).drawCircle(h.x, h.y, h.r).endFill();
    }
  }

  // Punch a new destruction crater. `tier` is 1..3 (controls crater size).
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
