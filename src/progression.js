// progression.js
// ---------------------------------------------------------------------------
// ALL incremental-game math lives here: baseline numbers + exponential curves.
// Nothing in here touches Pixi or the DOM - it is pure functions so the balance
// can be tuned in one place. Costs/values grow as base * growth^level.
// ---------------------------------------------------------------------------

// Baseline tuning knobs. Tweak these to rebalance the whole game.
export const BASE = {
  // --- Laser ---------------------------------------------------------------
  // Passive DPS = base x tier^t x power^(p-1) x thickness^(k-1) x beamSum.
  // Each of thickness / power / beams has 5 levels; maxing all 3 unlocks the
  // next colour tier (which resets the three stats to level 1).
  laserDps: 0.5, //          DPS with tier 0, all stats at level 1
  laserTierMult: 8, //       DPS multiplier per colour tier
  laserPowerMult: 1.7, //    DPS multiplier per power level
  laserThickMult: 1.35, //   DPS multiplier per thickness level
  laserBaseWidth: 6, //      beam core width at thickness 1 ...
  laserWidthPerLevel: 3.4, //... + this per thickness level
  laserThickCost: 20, //     thickness upgrade anchor cost
  laserPowerCost: 28, //     power upgrade anchor cost
  laserBeamsCost: 55, //     beams upgrade anchor cost
  laserStatGrowth: 2.25, //  cost multiplier per stat level
  laserTierCostMult: 7, //   cost multiplier per tier
  laserNextTierCost: 600, // cost of the first NEXT TIER button
  laserNextTierGrowth: 9, // x per tier

  // --- Click power (instant damage per screen click) ---
  clickDmg: 1, //            damage of a click at level 0
  clickDmgGrowth: 1.5,
  clickCost: 8,
  clickCostGrowth: 1.7,

  // --- Shard value (base coins per collected shard) ---
  shardValue: 1,
  shardValueGrowth: 1.4,
  shardCost: 12,
  shardCostGrowth: 1.7,

  // --- Vacuum (10 tiers: ms between collecting one shard) ---
  vacuumTiers: 10,
  vacuumInterval: 450, //    tier 0: ~2.2 shards/sec
  vacuumIntervalMin: 45, //  tier 9: ~22 shards/sec
  vacuumCost: 25,
  vacuumCostGrowth: 1.85,

  // --- Objects (4 tiers x 5 shapes) ---
  objDurability: 6, //          base max durability (tier0 shape0 level1)
  objDurabilityIndex: 1.7, //   x per shape index (circle..hexagon)
  objDurabilityTier: 6, //      x per tier (white..purple)
  objDurabilityUpgrade: 1.3, // x per object level beyond 1
  shardCountFirst: 15, //       shards from the very first object (circle, tier 0)
  shardCountLast: 100, //       shards from the very last object (hexagon, tier 3)
  shardCountSpread: 0.3, //     ± random fraction around the progressive base
  objRewardTier: 4, //          coin-worth multiplier per tier
  objRewardIndex: 1.6, //       coin-worth multiplier per shape index
  objUnlockCost: 18, //         unlock cost anchor
  objUnlockGrowth: 1.85, //     x per global object position
  objUpgradeCost: 10, //        upgrade cost anchor
  objUpgradeGrowth: 1.7, //     x per object level
  objMaxLevel: 5, //            levels per object before it is "maxed"
  objNextTierCost: 800, //      cost of the first objects NEXT TIER button
  objNextTierGrowth: 12, //     x per tier
};

export const MAX_LEVEL = 5; // shared cap for laser stats and object levels
export const TIER_COUNT = 4; // colour tiers for both laser and objects

// Generic helper: geometric cost/value curve.
const curve = (base, growth, level) => base * Math.pow(growth, level);

// ----------------------------- Laser ---------------------------------------
export const LASER_TIER_COLORS = [0xff3b46, 0x3aa0ff, 0x57e08a, 0xb44bff]; // red, blue, green, purple
export const LASER_TIER_NAMES = ['Red', 'Blue', 'Green', 'Purple'];

// Beam layout per beam-level (1..5): X = full beam, x = small beam (half size /
// half power). Patterns: X, xXx, XXX, xXXXx, XXXXX.
const BEAM_LAYOUTS = [
  [{ pos: 0, small: false }],
  [{ pos: -1, small: true }, { pos: 0, small: false }, { pos: 1, small: true }],
  [{ pos: -1, small: false }, { pos: 0, small: false }, { pos: 1, small: false }],
  [{ pos: -2, small: true }, { pos: -1, small: false }, { pos: 0, small: false }, { pos: 1, small: false }, { pos: 2, small: true }],
  [{ pos: -2, small: false }, { pos: -1, small: false }, { pos: 0, small: false }, { pos: 1, small: false }, { pos: 2, small: false }],
];
export const BEAM_PATTERNS = ['X', 'xXx', 'XXX', 'xXXXx', 'XXXXX'];

// Effective beam count (small beams count as half): 1, 2, 3, 4, 5.
export const beamSum = (beams) => BEAM_LAYOUTS[beams - 1].reduce((s, b) => s + (b.small ? 0.5 : 1), 0);

export function laserDps(tier, power, thickness, beams) {
  return (
    BASE.laserDps *
    Math.pow(BASE.laserTierMult, tier) *
    Math.pow(BASE.laserPowerMult, power - 1) *
    Math.pow(BASE.laserThickMult, thickness - 1) *
    beamSum(beams)
  );
}

// Everything the Laser display needs: colour, glow and an explicit list of beams.
export function laserVisual(tier, power, thickness, beams) {
  const color = LASER_TIER_COLORS[tier];
  const coreWidth = BASE.laserBaseWidth + thickness * BASE.laserWidthPerLevel;
  const spacing = coreWidth * 1.6 + 7;
  const brightness = 0.5 + 0.1 * power; // power 1..5 -> 0.6..1.0
  const beamList = BEAM_LAYOUTS[beams - 1].map((b) => ({
    dx: b.pos * spacing,
    width: b.small ? coreWidth * 0.5 : coreWidth,
    intensity: b.small ? brightness * 0.5 : brightness,
  }));
  return { color, glow: 1.0 + power * 0.8, beams: beamList };
}

// Per-stat upgrade costs (grow with the stat level and the colour tier).
const laserStatCost = (anchor, tier, level) =>
  Math.ceil(anchor * Math.pow(BASE.laserStatGrowth, level - 1) * Math.pow(BASE.laserTierCostMult, tier));
export const laserThicknessCost = (tier, level) => laserStatCost(BASE.laserThickCost, tier, level);
export const laserPowerCost = (tier, level) => laserStatCost(BASE.laserPowerCost, tier, level);
export const laserBeamsCost = (tier, level) => laserStatCost(BASE.laserBeamsCost, tier, level);
export const laserNextTierCost = (tier) => Math.ceil(curve(BASE.laserNextTierCost, BASE.laserNextTierGrowth, tier));

// ----------------------------- Click ---------------------------------------
export const clickDamage = (level) => curve(BASE.clickDmg, BASE.clickDmgGrowth, level);
export const clickCost = (level) => Math.ceil(curve(BASE.clickCost, BASE.clickCostGrowth, level));

// -------------------------- Shard value ------------------------------------
export const shardValue = (level) => curve(BASE.shardValue, BASE.shardValueGrowth, level);
export const shardCost = (level) => Math.ceil(curve(BASE.shardCost, BASE.shardCostGrowth, level));

// ----------------------------- Vacuum --------------------------------------
// Interval (ms) between collecting one shard. Decreases exponentially toward a
// floor across the 10 tiers, so the last tiers feel dramatically faster.
export function vacuumInterval(tier) {
  const t = Math.min(tier, BASE.vacuumTiers - 1) / (BASE.vacuumTiers - 1); // 0..1
  return BASE.vacuumInterval * Math.pow(BASE.vacuumIntervalMin / BASE.vacuumInterval, t);
}
export const vacuumCost = (tier) => Math.ceil(curve(BASE.vacuumCost, BASE.vacuumCostGrowth, tier));

// ----------------------------- Objects -------------------------------------
// A global "position" for cost scaling so later objects always cost more.
const objPosition = (tier, idx) => tier * 5 + idx;

// Max durability of an object at a given level (level >= 1 means unlocked).
export function objectDurability(tier, idx, level) {
  const lvl = Math.max(level, 1);
  return (
    BASE.objDurability *
    Math.pow(BASE.objDurabilityIndex, idx) *
    Math.pow(BASE.objDurabilityTier, tier) *
    Math.pow(BASE.objDurabilityUpgrade, lvl - 1)
  );
}

const MAX_OBJ_POS = 19; // 4 tiers x 5 shapes - 1

// Progressive baseline shard count: ~shardCountFirst for the first object rising
// smoothly to ~shardCountLast for the last, across all 20 objects.
export function objectShardBase(tier, idx) {
  const f = objPosition(tier, idx) / MAX_OBJ_POS; // 0..1
  return BASE.shardCountFirst * Math.pow(BASE.shardCountLast / BASE.shardCountFirst, f);
}

// A randomized progressive shard count for one destroyed object. `rand` is 0..1.
export function rollShardCount(tier, idx, rand = Math.random()) {
  const base = objectShardBase(tier, idx);
  const factor = 1 - BASE.shardCountSpread + 2 * BASE.shardCountSpread * rand;
  return Math.max(4, Math.round(base * factor));
}

// Coin worth multiplier applied to shardValue for shards from this object.
export function objectReward(tier, idx) {
  return Math.pow(BASE.objRewardTier, tier) * Math.pow(BASE.objRewardIndex, idx);
}

export const objectUnlockCost = (tier, idx) =>
  Math.ceil(curve(BASE.objUnlockCost, BASE.objUnlockGrowth, objPosition(tier, idx)));

export function objectUpgradeCost(tier, idx, level) {
  return Math.ceil(
    BASE.objUpgradeCost *
      Math.pow(BASE.objUnlockGrowth, objPosition(tier, idx)) *
      Math.pow(BASE.objUpgradeGrowth, level - 1)
  );
}

export const objectNextTierCost = (tier) =>
  Math.ceil(curve(BASE.objNextTierCost, BASE.objNextTierGrowth, tier));
