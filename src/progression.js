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

// Per-tier COST multiplier — deliberately LARGER than the income/power tier
// multiplier (TIER_MULT). This is the key to "explosive leap but re-armed wall":
// crossing a tier multiplies income by ~TIER_MULT, but the next tier's costs by
// this larger factor, so each new tier's prices are higher *relative to your
// entry income* and you must rebuild within the tier (active + idle) instead of
// cascading straight through. Ratio COST_TIER_MULT/TIER_MULT ≈ the within-tier
// income growth, so tier time stays roughly constant (gently rising). Tuned by
// the pacing sim: K/R ≈ 8 (1500/190) re-arms the wall without exponential stall.
const COST_TIER_MULT = 1500;

export const BASE = {
  // --- Laser ---------------------------------------------------------------
  // Passive DPS = base x tier^t x power^(p-1) x thickness^(k-1) x beamFactor.
  // Each of thickness / power / beams has 5 levels; maxing all 3 unlocks the
  // next colour tier (which resets the three stats to level 1).
  //
  // DESIGN ("flat grind, explosive leap"): the within-tier laser range is kept
  // SMALL (R_laser ~= 3-4x) on purpose. A fresh tier-0 laser kills the starter
  // object in ~9-10s, and a fully-upgraded tier laser still takes ~3s — so the
  // disintegration on screen is ALWAYS the main event, never trivialised. The
  // big power jump lives in the x190 tier crossing, not in within-tier upgrades.
  laserDps: 4.5, //          DPS with tier 0, all stats at level 1 (=> ~10s start TTK)
  laserTierMult: TIER_MULT, // DPS multiplier per colour tier (= M)
  laserPowerMult: 1.11, //   DPS multiplier per power level (small: keep TTK watchable)
  laserThickMult: 1.06, //   DPS multiplier per thickness level (small)
  laserBeamMult: 0.2, //     DPS added per beam level beyond 1 (1.0..1.8x over 5
  //                         levels): beams stay a big VISUAL payoff without a 5x
  //                         DPS swing that would trivialise the kill.
  laserBaseWidth: 6, //      beam core width at thickness 1 ...
  laserWidthPerLevel: 3.4, //... + this per thickness level
  laserThickCost: 18, //     thickness upgrade anchor cost
  laserPowerCost: 24, //     power upgrade anchor cost
  laserBeamsCost: 42, //     beams upgrade anchor cost
  laserStatGrowth: 2.0, //   cost multiplier per stat level (rises faster than the
  //                         flat within-tier income, so each buy takes longer to
  //                         afford -> deceleration -> lean on idle for next tier)
  laserTierCostMult: COST_TIER_MULT, // stat-cost multiplier per tier (> income mult: re-arms the wall)
  laserNextTierCost: 900, // first NEXT TIER button: a multi-minute idle-funded save
  laserNextTierGrowth: COST_TIER_MULT, // x per tier (> income mult, so the leap is earned each time)

  // --- Click power (instant damage per screen click) ---
  // Kept SMALL vs object durability (~3% of a fresh object): clicking ASSISTS a
  // kill, it never trivialises the ~9s TTK (clicks apply straight to dur).
  clickDmg: 1.2, //          damage of a click at level 0
  clickDmgGrowth: 1.4,
  clickCost: 9,
  clickCostGrowth: 1.8,

  // --- Shard value (base coins per collected shard) ---
  // Gentle value growth vs steep cost growth -> a slow lever that self-limits
  // (no uncapped 1.4^n runaway).
  shardValue: 1,
  shardValueGrowth: 1.18,
  shardCost: 12,
  shardCostGrowth: 1.7,

  // --- Vacuum (30 levels = 3 cleaners x 10; ms between collecting one shard) ---
  vacuumTiers: 30, //        total upgrade levels across all cleaners
  vacuumInterval: 300, //    a cleaner at local level 0: ~3.3 shards/sec (headroom
  //                         over the slow shard production at long TTK)
  vacuumIntervalMin: 45, //  a cleaner at local level 9: ~22 shards/sec
  vacuumCost: 24,
  vacuumCostGrowth: 1.7,

  // --- Objects (7 tiers x 5 shapes) ---
  objDurability: 45, //         base max durability (tier0 shape0 level1) => ~10s TTK
  objDurabilityIndex: 1.25, //  x per shape index (circle..hexagon): later shapes
  //                            are tankier but not absurdly so (keeps TTK in band)
  objDurabilityTier: TIER_MULT, // x per tier (= M)
  objDurabilityUpgrade: 1.15, // x per object level beyond 1 (gentle: TTK stays watchable)
  shardCountFirst: 10, //       shards from the very first object (circle, tier 0)
  shardCountLast: 100, //       shards from the very last object (hexagon, last tier)
  shardCountSpread: 0.3, //     ± random fraction around the progressive base
  objRewardTier: TIER_MULT, //  coin-worth multiplier per tier (= M)
  objRewardIndex: 1.0, //       coin-worth FLAT across shapes (later shapes already
  //                            give more via higher shard COUNT, objectShardBase)
  objRewardUpgrade: 1.06, //    coin-worth barely rises per object level — within-tier
  //                            income stays nearly flat so the leap is the tier crossing
  objUnlockCost: 18, //         unlock cost anchor
  objUpgradeCost: 11, //        upgrade cost anchor
  objCostTier: COST_TIER_MULT, // cost multiplier per tier (> income mult: re-arms the wall)
  objCostShape: 1.7, //         cost multiplier per shape index
  objUpgradeGrowth: 1.8, //     cost multiplier per object level (rises faster than
  //                            the flat reward growth -> decelerating buys)
  objMaxLevel: 5, //            levels per object before it is "maxed"
  objNextTierCost: 1200, //     first objects NEXT TIER button: a multi-minute idle save
  objNextTierGrowth: COST_TIER_MULT, // x per tier (> income mult, so the leap is earned each time)
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

// Effective beam count (small beams count as half): 1, 2, 3, 4, 5. Used for the
// visual readout / semantics.
export const beamSum = (beams) => BEAM_LAYOUTS[beams - 1].reduce((s, b) => s + (b.small ? 0.5 : 1), 0);

// Gentle DPS factor for the beam level: 1.0 at level 1 rising to ~1.8 at level 5
// (1 + (beams-1) * laserBeamMult). Beams stay a strong VISUAL upgrade (more/wider
// beams) without a 5x DPS swing that would make the kill trivial.
export const beamDpsFactor = (beams) => 1 + (beams - 1) * BASE.laserBeamMult;

export function laserDps(tier, power, thickness, beams) {
  return (
    BASE.laserDps *
    Math.pow(BASE.laserTierMult, tier) *
    Math.pow(BASE.laserPowerMult, power - 1) *
    Math.pow(BASE.laserThickMult, thickness - 1) *
    beamDpsFactor(beams)
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
  maxSeconds: 24 * 60 * 60, // cap the credited away-time at 24 hours (overnight returns)
  efficiency: 1.0, //         away-time earns 100% of live passive income. Idle is the
  //                          long-haul engine: active play decelerates into the wall,
  //                          and the multi-hour idle is what carries you to the next tier.
  welcomeSeconds: 120, //     small front-loaded bonus so a short stint still pops
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

  // Sums across the unlocked shapes. pickSpawn() now cycles through them equally
  // (one kill each per cycle), so every unlocked shape carries equal weight.
  let wCoins = 0; // Σ coins-per-kill
  let wShards = 0; // Σ shards-per-kill
  let wTime = 0; //  Σ cycle-time (seconds)
  for (let idx = 0; idx < s.objects.length; idx++) {
    if (s.objects[idx] <= 0) continue; // locked shapes never spawn
    const level = Math.max(1, s.objects[idx]);
    const weight = 1;
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
  // Elapsed earnings (at >100% efficiency) plus a flat front-loaded "welcome
  // back" bundle so the return always reads as a jackpot, not a trickle.
  const coins = Math.floor(ratePerSec * (seconds * OFFLINE.efficiency + OFFLINE.welcomeSeconds));
  return { coins, seconds, capped: elapsedSeconds > OFFLINE.maxSeconds };
}
