// lab/shards.js
// Shard particles + the vacuum cleaner.
// Shards erupt from the object, fly toward the side walls, bounce, and fall to
// the ground (hand-rolled physics - no libs). Once shards rest on the ground a
// vacuum slides in, sucks them up one at a time (rate set by its tier) and each
// collected shard pays out coins.
import { Container } from '@pixi/display';
import { Graphics } from '@pixi/graphics';

const GRAVITY = 0.0011; // px / ms^2
const RESTITUTION = 0.5; // wall bounciness

export class Shards {
  // onCollect(worth) is called once per shard the vacuum picks up.
  constructor(dims, onCollect) {
    this.dims = dims;
    this.onCollect = onCollect;
    this.container = new Container();

    this.layer = new Container();
    this.container.addChild(this.layer);
    this.shards = [];

    // Vacuum cleaner: a little sliding box on the ground.
    this.vacuum = new Graphics();
    this.vacuum
      .beginFill(0x3a3f52)
      .lineStyle(2, 0x6cf2ff, 0.9)
      .drawRoundedRect(-26, -22, 52, 22, 4)
      .endFill();
    this.vacuum.beginFill(0x6cf2ff, 0.25).drawPolygon([26, -20, 44, -8, 26, -2]).endFill(); // nozzle
    this.vacuum.y = dims.groundY;
    this.vacuum.x = -60;
    this.vacuum.visible = false;
    this.container.addChild(this.vacuum);

    this.vacuumInterval = 850;
    this._suckTimer = 0;
  }

  setVacuumInterval(ms) {
    this.vacuumInterval = ms;
  }

  // Erupt `count` shards from (x,y), split left/right, each worth `worth` coins.
  burst(x, y, count, color, worth) {
    for (let i = 0; i < count; i++) {
      const g = new Graphics();
      const s = 3 + Math.random() * 3;
      g.beginFill(color, 0.95).drawPolygon([0, -s, s, 0, 0, s, -s, 0]).endFill();
      g.x = x;
      g.y = y;
      const dir = i % 2 === 0 ? 1 : -1; // alternate sides
      this.layer.addChild(g);
      this.shards.push({
        g,
        vx: dir * (0.18 + Math.random() * 0.22),
        vy: -(0.15 + Math.random() * 0.25),
        worth,
        resting: false,
        spin: (Math.random() - 0.5) * 0.01,
      });
    }
    // Cap live shards so the scene never thrashes.
    while (this.shards.length > 600) {
      const old = this.shards.shift();
      this.layer.removeChild(old.g);
    }
  }

  restingCount() {
    let n = 0;
    for (const s of this.shards) if (s.resting) n++;
    return n;
  }

  update(deltaMS) {
    const { width, groundY } = this.dims;
    for (const s of this.shards) {
      if (s.resting) continue;
      s.vy += GRAVITY * deltaMS;
      s.g.x += s.vx * deltaMS;
      s.g.y += s.vy * deltaMS;
      s.g.rotation += s.spin * deltaMS;

      // Bounce off side walls.
      if (s.g.x < 6) {
        s.g.x = 6;
        s.vx = Math.abs(s.vx) * RESTITUTION;
      } else if (s.g.x > width - 6) {
        s.g.x = width - 6;
        s.vx = -Math.abs(s.vx) * RESTITUTION;
      }
      // Land on the ground.
      if (s.g.y >= groundY - 4) {
        s.g.y = groundY - 4 - Math.random() * 6;
        s.resting = true;
        s.vx = 0;
        s.vy = 0;
      }
    }

    this.updateVacuum(deltaMS);
  }

  updateVacuum(deltaMS) {
    const resting = this.shards.filter((s) => s.resting);
    if (resting.length === 0) {
      // Glide off-screen and hide.
      this.vacuum.visible = this.vacuum.x > -50;
      if (this.vacuum.visible) this.vacuum.x -= 0.3 * deltaMS;
      return;
    }

    this.vacuum.visible = true;
    // Target the nearest resting shard.
    let target = resting[0];
    for (const s of resting) {
      if (Math.abs(s.g.x - this.vacuum.x) < Math.abs(target.g.x - this.vacuum.x)) target = s;
    }
    // Slide fast toward the nearest shard so that travel time is negligible and
    // the suck interval (the upgradeable stat) is what actually gates income.
    const dx = target.g.x - this.vacuum.x;
    const speed = 1.1;
    this.vacuum.x += Math.max(-speed * deltaMS, Math.min(speed * deltaMS, dx));

    // Suck up shards at the tier-defined rate when over a shard.
    this._suckTimer += deltaMS;
    if (Math.abs(dx) < 32 && this._suckTimer >= this.vacuumInterval) {
      this._suckTimer = 0;
      this.collect(target);
    }
  }

  collect(shard) {
    const i = this.shards.indexOf(shard);
    if (i >= 0) this.shards.splice(i, 1);
    this.layer.removeChild(shard.g);
    this.onCollect(shard.worth);
  }
}
