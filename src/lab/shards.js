// lab/shards.js
// Shard particles + the vacuum cleaner.
// Shards erupt from the object, fly toward the side walls, bounce, and fall to
// the ground (hand-rolled physics - no libs). Once shards rest on the ground a
// vacuum slides in, sucks them up one at a time (rate set by its tier) and each
// collected shard pays out coins.
import { Container } from '@pixi/display';
import { Sprite } from '@pixi/sprite';
import { VACUUM_TEX, SHARD, whenReady } from './assets.js';

const GRAVITY = 0.0011; // px / ms^2
const RESTITUTION = 0.5; // wall bounciness
const COL_W = 12; // width of a stacking column (px)
const VAC_H_MIN = 23; // displayed cleaner height at local level 0
const VAC_H_MAX = 43; // displayed cleaner height at local level 9
const VAC_LINGER_MS = 800; // pause on the last shard's spot before heading home

export class Shards {
  // onCollect(worth) is called once per shard the vacuum picks up.
  constructor(dims, onCollect) {
    this.dims = dims;
    this.onCollect = onCollect;
    this.container = new Container();

    this.layer = new Container();
    this.container.addChild(this.layer);
    this.shards = [];
    // Free list of idle shard sprites. We only ever release what we spawned and
    // live shards are capped (600), so this stays bounded. Recycling avoids a
    // per-shard Sprite + GPU-resource churn during the endless idle loop.
    this.pool = [];

    // Stacking: a height-map of column surface heights. A landing shard sits on
    // top of whatever is already in its column instead of all piling at groundY,
    // so shards visually heap on top of each other (no real physics needed).
    this.cols = Math.max(1, Math.ceil(dims.width / COL_W));
    this.stacks = new Array(this.cols).fill(dims.groundY);
    // Per-column list of resting shards, bottom -> top. Lets us drop the shards
    // above one that gets sucked up so the pile collapses instead of floating.
    this.columns = Array.from({ length: this.cols }, () => []);

    // Vacuum cleaners: up to 3 little sliding boxes on the ground, each its own
    // colour. They appear one at a time as the Vacuum upgrade is levelled, and
    // each strolls independently sucking up resting shards.
    this.vacuums = []; // { g, color, interval, suckTimer, targetCol }
  }

  // Build a vacuum-cleaner sprite for cleaner index `i` (its own artwork). The
  // art faces left; it rests on the ground (anchored bottom-centre).
  _makeVacuum(i) {
    const g = new Sprite(VACUUM_TEX[i] || VACUUM_TEX[0]);
    g.anchor.set(0.5, 1);
    g.y = this.dims.groundY;
    g.visible = false;
    this.container.addChild(g);
    return g;
  }

  // Size a cleaner's sprite from its local level (0..9): small at first, growing
  // toward VAC_H_MAX as it is upgraded. `scaleMag` is kept so the facing flip
  // (negative scale.x) can be applied without losing the magnitude.
  _scaleVacuum(v) {
    const tex = v.g.texture;
    if (!tex.height) return;
    const t = Math.min(Math.max(v.level, 0), 9) / 9;
    const h = VAC_H_MIN + (VAC_H_MAX - VAC_H_MIN) * t;
    v.scaleMag = h / tex.height;
    v.g.scale.set(v.g.scale.x < 0 ? -v.scaleMag : v.scaleMag, v.scaleMag);
  }

  // Sync the active cleaners to `configs` (one entry per cleaner, in order):
  // each has { interval, color, level }. Spawns new cleaners as the count grows
  // and updates collection intervals + sprite sizes in place.
  setVacuums(configs) {
    while (this.vacuums.length < configs.length) {
      const i = this.vacuums.length;
      const g = this._makeVacuum(i);
      g.x = -60 - 60 * i; // stagger entrances off-screen to the left
      const v = { g, color: configs[i].color, interval: configs[i].interval, level: configs[i].level || 0, scaleMag: 1, suckTimer: 0, targetCol: -1, homeDir: 0, homeDelay: 0 };
      this.vacuums.push(v);
      // Size now if the texture is ready, otherwise once it loads.
      whenReady(g.texture, () => this._scaleVacuum(v));
    }
    while (this.vacuums.length > configs.length) {
      const v = this.vacuums.pop();
      this.container.removeChild(v.g);
    }
    for (let i = 0; i < this.vacuums.length; i++) {
      const v = this.vacuums[i];
      const levelChanged = v.level !== configs[i].level;
      v.interval = configs[i].interval;
      v.level = configs[i].level || 0;
      if (levelChanged) this._scaleVacuum(v);
    }
  }

  // Erupt `count` shards from (x,y). `worth` is the *base* coin value; each
  // shard's actual worth scales with its size (bigger chunk -> more coins).
  // When `everywhere` is false the shards are flung hard to the left and right
  // (never straight down the center); when true they spray in every direction.
  burst(x, y, count, color, worth, everywhere = false) {
    for (let i = 0; i < count; i++) {
      // Size factor biased toward small bits with the occasional big chunk.
      const sizeF = 0.6 + Math.random() * Math.random() * 2.0;
      const s = 2.5 + sizeF * 3; // half-extent of the diamond
      const shardWorth = Math.max(1, Math.round(worth * sizeF));

      const g = this._acquire(color, s);
      g.x = x;
      g.y = y;

      let vx;
      let vy;
      if (everywhere) {
        // Full radial spray - shards land all over, including the center.
        vx = (Math.random() - 0.5) * 0.9;
        vy = -(0.05 + Math.random() * 0.45);
      } else {
        // Hard left/right only, with a minimum speed so nothing dribbles down
        // the middle.
        const dir = i % 2 === 0 ? 1 : -1;
        vx = dir * (0.28 + Math.random() * 0.3);
        vy = -(0.15 + Math.random() * 0.25);
      }

      this.shards.push({
        g,
        vx,
        vy,
        size: s,
        worth: shardWorth,
        resting: false,
        col: -1,
        consumed: 0,
        spin: (Math.random() - 0.5) * 0.01,
      });
    }
    // Cap live shards so the scene never thrashes.
    while (this.shards.length > 600) {
      this._remove(this.shards[0]);
    }
  }

  // Borrow a shard sprite from the pool (or make one), tinted to `color` and
  // scaled so its half-extent is `s` px. The shared SHARD texture is white, so the
  // tint colours it and every shard batches into one draw call.
  _acquire(color, s) {
    const g = this.pool.pop() || new Sprite(SHARD);
    g.anchor.set(0.5);
    g.tint = color;
    g.alpha = 0.95;
    g.rotation = 0;
    g.visible = true;
    const half = g.texture.width / 2 || 1;
    g.scale.set(s / half);
    this.layer.addChild(g);
    return g;
  }

  // Detach a spent shard sprite and return it to the pool (kept alive + hidden).
  _release(g) {
    this.layer.removeChild(g);
    g.visible = false;
    this.pool.push(g);
  }

  _colAt(x) {
    const c = Math.floor(x / COL_W);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  // Remove a shard from the scene. If it was buried in a pile, drop every shard
  // resting above it down by its height so the pile collapses to fill the gap
  // instead of leaving a floating crust.
  _remove(shard) {
    const i = this.shards.indexOf(shard);
    if (i >= 0) this.shards.splice(i, 1);
    if (shard.resting && shard.col >= 0) {
      const colArr = this.columns[shard.col];
      const ci = colArr.indexOf(shard);
      if (ci >= 0) {
        colArr.splice(ci, 1);
        // Everything that was stacked above slides down into the gap.
        for (let k = ci; k < colArr.length; k++) colArr[k].g.y += shard.consumed;
        this.stacks[shard.col] = Math.min(this.dims.groundY, this.stacks[shard.col] + shard.consumed);
      }
    }
    this._release(shard.g);
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
      // Land on top of whatever is already piled in this column.
      let col = this._colAt(s.g.x);
      if (s.g.y >= this.stacks[col] - s.size) {
        // Angle of repose: instead of stacking straight up into a thin tower,
        // roll downhill into a lower neighbouring column until the local slope
        // is gentle enough. (Surface is a y value - larger y = shorter pile.)
        const step = s.size * 1.2; // height drop tolerated before a shard rolls
        for (let it = 0; it < 24; it++) {
          const here = this.stacks[col];
          const lo = col > 0 ? this.stacks[col - 1] : -Infinity;
          const ro = col < this.cols - 1 ? this.stacks[col + 1] : -Infinity;
          let target = col;
          let targetY = here;
          if (lo > targetY) { targetY = lo; target = col - 1; }
          if (ro > targetY) { targetY = ro; target = col + 1; }
          if (target === col || targetY - here <= step) break;
          col = target;
        }

        const surface = this.stacks[col];
        const cx = col * COL_W + COL_W / 2;
        // Settle with a little random scatter in x, y and rotation so the heap
        // looks like loose debris instead of a rigid grid.
        s.g.x = cx + (Math.random() - 0.5) * COL_W * 0.9;
        s.g.y = surface - s.size + (Math.random() - 0.5) * 3;
        s.g.rotation += (Math.random() - 0.5) * 0.6;
        s.resting = true;
        s.vx = 0;
        s.vy = 0;
        s.col = col;
        // Raise the column, overlapping the previous shard heavily so the heap
        // packs densely rather than building a thin tower.
        s.consumed = s.size;
        this.stacks[col] = surface - s.consumed;
        this.columns[col].push(s); // top of this column's stack
      }
    }

    for (const v of this.vacuums) this.updateVacuum(v, deltaMS);
  }

  // Pick a new pile for cleaner `v` to wander toward: a random non-empty column,
  // biased to ones nearby so it meanders locally instead of zipping across the
  // screen, and preferring somewhere other than where it sits so it keeps moving.
  _pickTarget(v) {
    let cands = [];
    for (let c = 0; c < this.cols; c++) if (this.columns[c].length) cands.push(c);
    if (cands.length === 0) {
      v.targetCol = -1;
      return;
    }
    // Coordinate with the other cleaners: avoid piles they're already heading
    // for so two cleaners split the work instead of dogpiling one shard. Only
    // when every pile is already claimed do we fall back to the full list.
    const claimed = new Set();
    for (const o of this.vacuums) if (o !== v && o.targetCol >= 0) claimed.add(o.targetCol);
    const free = cands.filter((c) => !claimed.has(c));
    if (free.length) cands = free;

    const near = cands.filter((c) => Math.abs(c * COL_W + COL_W / 2 - v.g.x) < 170);
    let pool = near.length ? near : cands;
    if (pool.length > 1) {
      const curCol = this._colAt(v.g.x);
      const elsewhere = pool.filter((c) => Math.abs(c - curCol) > 1);
      if (elsewhere.length) pool = elsewhere;
    }
    v.targetCol = pool[Math.floor(Math.random() * pool.length)];
  }

  updateVacuum(v, deltaMS) {
    // (Re)choose a target whenever ours is gone or emptied (possibly by another
    // cleaner this frame).
    if (v.targetCol < 0 || this.columns[v.targetCol].length === 0) this._pickTarget(v);

    if (v.targetCol < 0) {
      // Just cleared the last shard: linger on the spot for a beat instead of
      // bolting home, so the cleaner reads as "finishing up" rather than fleeing.
      // (A fresh pile during the linger re-acquires below, cancelling the exit.)
      if (v.homeDir === 0 && v.homeDelay > 0) {
        v.homeDelay -= deltaMS;
        v.g.visible = true;
        return; // hold position while the linger runs down
      }
      // Nothing left - glide off the NEAREST edge and hide. Pick the edge once
      // per home-trip (from where we stand) and commit to it, so crossing the
      // centre mid-exit can't flip us around. Face the way we travel so the art
      // never moonwalks home (default art faces left).
      if (v.homeDir === 0) v.homeDir = v.g.x < this.dims.width / 2 ? -1 : 1;
      if (v.scaleMag) v.g.scale.x = v.homeDir < 0 ? v.scaleMag : -v.scaleMag;
      v.g.x += v.homeDir * 0.3 * deltaMS;
      v.g.visible = v.homeDir < 0 ? v.g.x > -50 : v.g.x < this.dims.width + 50;
      return;
    }

    v.homeDir = 0; // re-acquired a pile; clear the committed exit edge
    v.homeDelay = VAC_LINGER_MS; // keep the linger topped up for when shards run out
    v.g.visible = true;
    // Stroll toward the target pile at a deliberate pace, then suck a shard off
    // its TOP. Top-down removal keeps piles collapsing cleanly (no floating).
    const targetX = v.targetCol * COL_W + COL_W / 2;
    const dx = targetX - v.g.x;
    const speed = 0.5;
    v.g.x += Math.max(-speed * deltaMS, Math.min(speed * deltaMS, dx));
    // Face the way we travel (art faces left by default; flip to face right).
    if (v.scaleMag) {
      if (dx > 1) v.g.scale.x = -v.scaleMag;
      else if (dx < -1) v.g.scale.x = v.scaleMag;
    }

    v.suckTimer += deltaMS;
    if (Math.abs(dx) < COL_W && v.suckTimer >= v.interval) {
      v.suckTimer = 0;
      const colArr = this.columns[v.targetCol];
      if (colArr.length) this.collect(colArr[colArr.length - 1]); // top of the pile
      this._pickTarget(v); // wander on to another nearby pile
    }
  }

  collect(shard) {
    const { x, y } = shard.g; // capture before _remove detaches the sprite
    this._remove(shard);
    this.onCollect(shard.worth, x, y);
  }
}
