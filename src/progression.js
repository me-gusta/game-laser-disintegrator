// progression.js
// ---------------------------------------------------------------------------
// ALL incremental-game math lives here: baseline numbers + exponential curves.
// Nothing in here touches Pixi or the DOM - it is pure functions so the balance
// can be tuned in one place. Costs/values grow as base * growth^level.
// ---------------------------------------------------------------------------

// Baseline tuning knobs. Tweak these to rebalance the whole game.
// The shared per-tier multiplier `M`. It scales laser DPS, object durability AND
// object coin-reward all by the same factor each tier, which keeps the game
// self-similar: tier-N laser is to tier-N objects exactly as tier-0 laser is to
// tier-0 objects. The within-tier upgrade range (R) is ~24 for both laser and
// objects, so M/R ~= 8 is the single dial controlling BOTH the cross-tier
// "gate" (a maxed tier-N laser is ~8x too slow on tier-(N+1) objects) AND the
// no-drop spike (a fresh tier-(N+1) laser is ~8x stronger than a maxed tier-N
// one). They cannot be separated while each tier still starts at a snappy kill.
const TIER_MULT = 190;

export const BASE = {
  // --- Laser ---------------------------------------------------------------
  // Passive DPS = base x tier^t x power^(p-1) x thickness^(k-1) x beamSum.
  // Each of thickness / power / beams has 5 levels; maxing all 3 unlocks the
  // next colour tier (which resets the three stats to level 1).
  // Within-tier range R_laser = 1.32^4 * 1.12^4 * 5 ~= 23.9. This is INTENTIONALLY
  // ~2x the object within-tier range (R_obj ~= 12): a fresh laser is weak (so
  // early-game clicking is the fast path) but a fully-upgraded laser overtakes
  // and shreds even maxed objects. Start TTK ~3s, maxed-vs-maxed TTK ~1.5s.
  laserDps: 2, //            DPS with tier 0, all stats at level 1
  laserTierMult: TIER_MULT, // DPS multiplier per colour tier (= M)
  laserPowerMult: 1.32, //   DPS multiplier per power level
  laserThickMult: 1.12, //   DPS multiplier per thickness level
  laserBaseWidth: 6, //      beam core width at thickness 1 ...
  laserWidthPerLevel: 3.4, //... + this per thickness level
  laserThickCost: 20, //     thickness upgrade anchor cost
  laserPowerCost: 28, //     power upgrade anchor cost
  laserBeamsCost: 55, //     beams upgrade anchor cost
  laserStatGrowth: 2.25, //  cost multiplier per stat level
  laserTierCostMult: TIER_MULT, // stat-cost multiplier per tier (tracks income)
  laserNextTierCost: 600, // cost of the first NEXT TIER button
  laserNextTierGrowth: TIER_MULT, // x per tier (tracks income)

  // --- Click power (instant damage per screen click) ---
  clickDmg: 2, //            damage of a click at level 0 (early-game driver)
  clickDmgGrowth: 1.5,
  clickCost: 8,
  clickCostGrowth: 1.7,

  // --- Shard value (base coins per collected shard) ---
  shardValue: 1,
  shardValueGrowth: 1.4,
  shardCost: 12,
  shardCostGrowth: 1.7,

  // --- Vacuum (30 levels = 3 cleaners x 10; ms between collecting one shard) ---
  vacuumTiers: 30, //        total upgrade levels across all cleaners
  vacuumInterval: 450, //    a cleaner at local level 0: ~2.2 shards/sec
  vacuumIntervalMin: 45, //  a cleaner at local level 9: ~22 shards/sec
  vacuumCost: 25,
  vacuumCostGrowth: 1.7,

  // --- Objects (7 tiers x 5 shapes) ---
  // Within-tier range R_obj = 1.53^4 * 1.22^4 ~= 12, deliberately ~half of
  // R_laser so the laser ramps faster than objects within a tier (see laserDps).
  objDurability: 6, //          base max durability (tier0 shape0 level1)
  objDurabilityIndex: 1.53, //  x per shape index (circle..hexagon)
  objDurabilityTier: TIER_MULT, // x per tier (= M)
  objDurabilityUpgrade: 1.22, // x per object level beyond 1
  shardCountFirst: 15, //       shards from the very first object (circle, tier 0)
  shardCountLast: 100, //       shards from the very last object (hexagon, last tier)
  shardCountSpread: 0.3, //     ± random fraction around the progressive base
  objRewardTier: TIER_MULT, //  coin-worth multiplier per tier (= M)
  objRewardIndex: 1.6, //       coin-worth multiplier per shape index
  objRewardUpgrade: 1.6, //     coin-worth multiplier per object level (income lever)
  objUnlockCost: 18, //         unlock cost anchor
  objUpgradeCost: 10, //        upgrade cost anchor
  objCostTier: TIER_MULT, //    cost multiplier per tier (tracks income)
  objCostShape: 1.7, //         cost multiplier per shape index
  objUpgradeGrowth: 1.7, //     cost multiplier per object level
  objMaxLevel: 5, //            levels per object before it is "maxed"
  objNextTierCost: 800, //      cost of the first objects NEXT TIER button
  objNextTierGrowth: TIER_MULT, // x per tier (tracks income)
};

export const MAX_LEVEL = 5; // shared cap for laser stats and object levels
export const TIER_COUNT = 7; // colour tiers for both laser and objects

// Generic helper: geometric cost/value curve.
const curve = (base, growth, level) => base * Math.pow(growth, level);

// ----------------------------- Laser ---------------------------------------
// red, blue, green, orange, pink, white, purple
export const LASER_TIER_COLORS = [0xff3b46, 0x3aa0ff, 0x57e08a, 0xffa53a, 0xff6fd0, 0xffffff, 0xb44bff];
export const LASER_TIER_NAMES = ['Red', 'Blue', 'Green', 'Orange', 'Pink', 'White', 'Purple'];

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
// The single "Vacuum" upgrade has 30 levels backed by up to 3 cleaners (white,
// blue, green), one spawning every 10 levels. Levels 1-10 grow the white
// cleaner, 11-20 the blue, 21-30 the green; the player just sees one upgrade and
// a cumulative shards/sec. Each cleaner collects at a rate set by its OWN local
// level (0..9), not the global tier.
const VACUUM_LEVELS_PER_CLEANER = 10;
export const VACUUM_CLEANER_COLORS = [0xffffff, 0x3aa0ff, 0x57e08a]; // white, blue, green

// Interval (ms) between collecting one shard for a cleaner at the given local
// level (0..9). Decreases exponentially toward a floor so high levels feel fast.
export function vacuumInterval(localLevel) {
  const span = VACUUM_LEVELS_PER_CLEANER - 1; // 9
  const t = Math.min(Math.max(localLevel, 0), span) / span; // 0..1
  return BASE.vacuumInterval * Math.pow(BASE.vacuumIntervalMin / BASE.vacuumInterval, t);
}

// Active cleaners for a given global vacuum tier (0..29): one per started block
// of 10 levels. Each entry carries its draw colour and current collection
// interval (from its local level within its own 10-level block).
export function vacuumCleaners(tier) {
  const count = Math.min(Math.floor(tier / VACUUM_LEVELS_PER_CLEANER) + 1, VACUUM_CLEANER_COLORS.length);
  const out = [];
  for (let c = 0; c < count; c++) {
    const localLevel = Math.min(tier - c * VACUUM_LEVELS_PER_CLEANER, VACUUM_LEVELS_PER_CLEANER - 1);
    out.push({ interval: vacuumInterval(localLevel), color: VACUUM_CLEANER_COLORS[c] });
  }
  return out;
}

// Cumulative shards/sec across all active cleaners (for the UI readout).
export const vacuumTotalRate = (tier) =>
  vacuumCleaners(tier).reduce((s, v) => s + 1000 / v.interval, 0);

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

const MAX_OBJ_POS = TIER_COUNT * 5 - 1; // last object's global position

// Progressive baseline shard count: ~shardCountFirst for the first object rising
// smoothly to ~shardCountLast for the last, across all objects. This is shard
// *count* only (tier-independent); coin worth scales separately via objectReward.
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

// Coin worth multiplier applied to shardValue for shards from this object. Now
// scales with object *level* too, so upgrading an object yields more coins (its
// durability rises slower than its reward -> net income per level goes up).
export function objectReward(tier, idx, level = 1) {
  return (
    Math.pow(BASE.objRewardTier, tier) *
    Math.pow(BASE.objRewardIndex, idx) *
    Math.pow(BASE.objRewardUpgrade, Math.max(level, 1) - 1)
  );
}

// Object costs are decoupled: a per-tier multiplier (tracks income) times a
// gentler per-shape multiplier, so later shapes/tiers cost more in step with
// what they earn rather than via a single runaway position term.
export const objectUnlockCost = (tier, idx) =>
  Math.ceil(BASE.objUnlockCost * Math.pow(BASE.objCostTier, tier) * Math.pow(BASE.objCostShape, idx));

export function objectUpgradeCost(tier, idx, level) {
  return Math.ceil(
    BASE.objUpgradeCost *
      Math.pow(BASE.objCostTier, tier) *
      Math.pow(BASE.objCostShape, idx) *
      Math.pow(BASE.objUpgradeGrowth, level - 1)
  );
}

export const objectNextTierCost = (tier) =>
  Math.ceil(curve(BASE.objNextTierCost, BASE.objNextTierGrowth, tier));

// --------------------------- Offline progression --------------------------
// While the tab is closed/hidden the laser keeps "working" at a reduced rate.
// Tuning knobs for that reward live here with the rest of the balance math.
export const OFFLINE = {
  minSeconds: 60, //          ignore stints shorter than this (no reward)
  maxSeconds: 12 * 60 * 60, // cap the credited away-time at 12 hours
  efficiency: 0.7, //         away-time earns 70% of live passive income
};

// Estimated *passive* (laser-only, no clicking) coins per second for a given
// game state. Models the real income chain: the laser kills the spawned object
// every D/DPS seconds (+ respawn gap), each kill sheds ~objectShardBase shards,
// and the vacuum collects them — but only up to its own shards/sec, since the
// floor saturates (shards.js caps live shards), so a slow vacuum throttles
// income exactly as it does in live play. Objects are averaged over the same
// progressive-weighted pool that pickSpawn() draws from.
const OFFLINE_RESPAWN = 0.55; // seconds between a shatter and the next spawn (scene.respawnTimer)
const OFFLINE_SHARD_WORTH = 1.1; // mean per-shard size multiplier from Shards.burst()

export function passiveCoinsPerSecond(s) {
  const dps = laserDps(s.laserTier, s.laserPower, s.laserThickness, s.laserBeams);
  if (dps <= 0) return 0;
  const sv = shardValue(s.shardLevel);

  // Weighted sums across the unlocked shapes (weight = idx+1, matching pickSpawn).
  let wCoins = 0; // Σ weight · coins-per-kill
  let wShards = 0; // Σ weight · shards-per-kill
  let wTime = 0; //  Σ weight · cycle-time (seconds)
  for (let idx = 0; idx < s.objects.length; idx++) {
    if (s.objects[idx] <= 0) continue; // locked shapes never spawn
    const level = Math.max(1, s.objects[idx]);
    const weight = idx + 1;
    const shards = objectShardBase(s.objectTier, idx);
    const worth = sv * objectReward(s.objectTier, idx, level) * OFFLINE_SHARD_WORTH;
    const cycle = objectDurability(s.objectTier, idx, level) / dps + OFFLINE_RESPAWN;
    wCoins += weight * shards * worth;
    wShards += weight * shards;
    wTime += weight * cycle;
  }
  if (wTime <= 0) return 0;

  const coinProdRate = wCoins / wTime; //  coins/sec the laser *produces*
  const shardProdRate = wShards / wTime; // shards/sec produced
  const vacRate = vacuumTotalRate(s.vacuumTier); // shards/sec the vacuum can collect
  // If the vacuum can't keep up, only a fraction of produced coins is realised.
  const throttle = shardProdRate > 0 ? Math.min(1, vacRate / shardProdRate) : 1;
  return coinProdRate * throttle;
}

// Coins to award for an away stint. Returns the credited amount, the (capped)
// seconds it was based on, and whether the 12h cap clipped the real elapsed time.
export function offlineCoins(elapsedSeconds, ratePerSec) {
  if (!(elapsedSeconds >= OFFLINE.minSeconds) || ratePerSec <= 0) {
    return { coins: 0, seconds: 0, capped: false };
  }
  const seconds = Math.min(elapsedSeconds, OFFLINE.maxSeconds);
  const coins = Math.floor(ratePerSec * seconds * OFFLINE.efficiency);
  return { coins, seconds, capped: elapsedSeconds > OFFLINE.maxSeconds };
}
