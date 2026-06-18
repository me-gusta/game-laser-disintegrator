// lab/scene.js
// The "lab" - assembles the laser, the target object and the shard/vacuum
// system, and owns the damage -> destruction -> shatter -> respawn loop.
import { Container } from '@pixi/display';
import { Graphics } from '@pixi/graphics';
import { Sprite } from '@pixi/sprite';
import * as P from '../progression.js';
import { state, addCoins, pickSpawn, TIERS } from '../state.js';
import { BACKGROUND, whenReady } from './assets.js';
import { Laser } from './laser.js';
import { Target } from './target.js';
import { Shards } from './shards.js';
import { Floaters } from './floaters.js';

const SNAP_THRESHOLDS = [0.72, 0.46, 0.22]; // 3 destruction tiers

export class Scene {
  constructor(width, height, renderer) {
    this.renderer = renderer;
    this.dims = {
      width,
      height,
      groundY: height - 48,
      center: { x: width / 2, y: height * 0.6 },
    };
    this.container = new Container();

    // Lab background: a solid dark fill as an instant fallback, with the photo
    // backdrop sprite "cover"-fitted over it (fills the width, crops the excess
    // height) once its texture loads.
    const bg = new Graphics();
    bg.beginFill(0x0d0f17).drawRect(0, 0, width, height).endFill();
    this.container.addChild(bg);

    const bgSprite = new Sprite(BACKGROUND);
    bgSprite.anchor.set(0.5);
    bgSprite.position.set(width / 2, height / 2);
    whenReady(BACKGROUND, (w, h) => {
      const s = Math.max(width / w, height / h);
      bgSprite.scale.set(s);
    });
    this.container.addChild(bgSprite);

    // Ground strip the vacuum cleaners ride along (and shards pile on), drawn
    // over the backdrop but beneath the gameplay layers added below.
    const { groundY } = this.dims;
    const ground = new Graphics();
    ground.beginFill(0x161a26).drawRect(0, groundY, width, height - groundY).endFill();
    ground.lineStyle(2, 0x2b3142, 1).moveTo(0, groundY).lineTo(width, groundY);
    this.container.addChild(ground);

    this.laser = new Laser(this.dims);
    this.target = new Target(this.dims, renderer);
    this.floaters = new Floaters();
    // Each shard the vacuum collects pays out coins and pops a dark-yellow "+N"
    // coin number at the shard's spot (same float/fade as damage numbers).
    this.shards = new Shards(this.dims, (worth, x, y) => {
      addCoins(worth);
      this.floaters.popCoin(worth, x, y);
    });

    // Z-order: beams (laser.container) sit BEHIND the target so the object
    // occludes the beam tip — the beam plunges into it instead of hanging in
    // the air. The impact flare (laser.impact) sits ABOVE the target as a hot
    // spot on the surface.
    this.container.addChild(
      this.shards.container,
      this.laser.container,
      this.target.container,
      this.laser.impact,
      this.floaters.container
    );

    this.lastLaserSig = ''; // tracks laser stats so we only rebuild beams on change
    this._vacTier = -1; //   tracks vacuumTier so we only rebuild cleaner configs on change
    this.cur = { tier: 0, idx: 0, level: 1 }; // object currently being disintegrated
    this.alive = false;
    this.respawnTimer = 0;
    this._laserAccum = 0; // laser damage accumulated between floating-number pops
    this.spawnNext();
  }

  currentWorth() {
    return P.shardValue(state.shardLevel) * P.objectReward(this.cur.tier, this.cur.idx, this.cur.level);
  }

  // Spawn the next object: a progressive-random pick from the current tier.
  spawnNext() {
    const o = pickSpawn();
    this.cur = { tier: o.tier, idx: o.idx, level: o.level };
    this.maxDur = P.objectDurability(o.tier, o.idx, o.level);
    this.dur = this.maxDur;
    this.snaps = 0;

    // Randomized progressive shard budget, split across the 3 snaps + shatter.
    const total = P.rollShardCount(o.tier, o.idx);
    this.snapShards = Math.max(2, Math.round(total * 0.18));
    this.shatterShards = Math.max(3, total - this.snapShards * 3);

    this.target.spawn(o.tier, o.idx, TIERS[o.tier].color, o.level);
    this.target.container.visible = true;
    this.target.container.alpha = 1;
    this.alive = true;
  }

  // A screen click -> burst of click damage with an immediate floating number.
  // The number erupts from the hole the bite just opened (near its rim), falling
  // back to the object's top while the object is still pristine and hole-less.
  click() {
    if (!this.alive) return;
    const d = P.clickDamage(state.clickLevel, state.objectTier);
    this.damage(d);
    const c = P.LASER_TIER_COLORS[state.laserTier];
    const h = this.target.lastHole;
    if (h) this.floaters.pop(d, h.x, h.y, c);
    else this.floaters.pop(d, this.target.container.x, this.target.container.y - 10, c);
  }

  damage(amount) {
    if (!this.alive) return;
    this.dur -= amount;
    // Snap through any destruction tiers we just crossed (a big hit can cross
    // several at once).
    while (this.snaps < 3 && this.dur <= this.maxDur * SNAP_THRESHOLDS[this.snaps]) {
      const p = this.target.addDestruction(this.snaps + 1);
      this.shards.burst(p.x, p.y, this.snapShards, this.target.color, this.currentWorth());
      this.snaps++;
    }
    if (this.dur <= 0) this.shatter();
  }

  shatter() {
    this.alive = false;
    const c = this.target.container;
    this.shards.burst(c.x, c.y, this.shatterShards, this.target.color, this.currentWorth(), true);
    this.target.container.alpha = 0;
    this.respawnTimer = 800; // breathe between kills so each shatter lands
  }

  update(deltaMS) {
    // Only clamp catastrophic jumps (e.g. returning to a backgrounded tab) so a
    // single frame can't insta-destroy the object; normal/throttled frames keep
    // their real elapsed time so coin/damage rates stay wall-clock accurate.
    const dt = Math.min(deltaMS, 250);

    // Sync laser cosmetics whenever any laser stat changes.
    const sig = `${state.laserTier}/${state.laserPower}/${state.laserThickness}/${state.laserBeams}`;
    if (sig !== this.lastLaserSig) {
      this.lastLaserSig = sig;
      this.laser.setVisual(P.laserVisual(state.laserTier, state.laserPower, state.laserThickness, state.laserBeams));
    }

    this.target.update(dt);
    // Beam terminus: deep inside the object body when pristine, retracting back
    // toward the surface as durability falls — so as the object erodes away the
    // tip always stays behind remaining material / under the impact flare and
    // never hangs in open space. The flare sits on the top surface.
    const t = this.target;
    const surface = t.topY() + 6;
    const deep = t.container.y + t.halfH * 0.35;
    const frac = this.maxDur ? Math.max(0, Math.min(1, this.dur / this.maxDur)) : 1;
    this.laser.update(dt, surface + (deep - surface) * frac, surface, this.alive);

    if (this.alive) {
      // Laser deals damage every frame; accumulate it and emit the running total
      // as a floating number the moment a fresh erosion hole appears — so digits
      // erupt from the holes themselves rather than the object's centre.
      const ld =
        P.laserDps(state.laserTier, state.laserPower, state.laserThickness, state.laserBeams) * (dt / 1000);
      this._laserAccum += ld;
      this.damage(ld);
      // Drive the continuous on-screen erosion from the live durability fraction;
      // setDamage returns the world-space centres of any holes punched this frame.
      if (this.alive) {
        const holes = this.target.setDamage(this.dur / this.maxDur);
        if (holes.length && this._laserAccum > 0) {
          const h = holes[holes.length - 1]; // the freshest hole
          this.floaters.pop(this._laserAccum, h.x, h.y, P.LASER_TIER_COLORS[state.laserTier]);
          this._laserAccum = 0;
        }
      }
    } else {
      // After a shatter, wait briefly then spawn a fresh random object.
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.spawnNext();
    }

    // The cleaner roster only changes when the Vacuum upgrade is bought; rebuild
    // (and the array+objects vacuumCleaners allocates) only then, not every frame.
    if (state.vacuumTier !== this._vacTier) {
      this._vacTier = state.vacuumTier;
      this.shards.setVacuums(P.vacuumCleaners(state.vacuumTier));
    }
    this.shards.update(dt);
    this.floaters.update(dt);
  }
}
