// state.js
// ---------------------------------------------------------------------------
// The single source of truth for the game. Holds coins + upgrade levels + the
// object grid, exposes buy actions, and notifies subscribers on change.
// Pixi scene reads from here every frame; the jQuery UI subscribes to onChange.
// ---------------------------------------------------------------------------
import * as P from './progression.js';

export const SHAPES = ['circle', 'rectangle', 'triangle', 'pentagon', 'hexagon'];
export const TIERS = [
  { name: 'White', color: 0xffffff },
  { name: 'Light Blue', color: 0xbfe3ff },
  { name: 'Light Green', color: 0xc4f5c4 },
  { name: 'Light Orange', color: 0xffd9a8 },
  { name: 'Light Pink', color: 0xffc4e2 },
  { name: 'Black', color: 0x2a2a2a }, // charcoal so it reads against the dark lab bg
  { name: 'Light Purple', color: 0xe2c4ff },
];

export const state = {
  coins: 0,
  // Laser: one colour tier + three 5-level stats. Maxing all three unlocks the
  // next tier (which resets the stats to 1 and changes colour).
  laserTier: 0,
  laserThickness: 1,
  laserPower: 1,
  laserBeams: 1,
  clickLevel: 0,
  shardLevel: 0,
  vacuumTier: 0,
  // Objects: one colour tier + a single set of 5 shapes (levels, 0 = locked).
  // The first shape starts unlocked; each next unlocks when the previous is
  // maxed. Maxing the whole set unlocks the next tier (same set, new colour).
  objectTier: 0,
  objects: [1, 0, 0, 0, 0], // level per shape index
  _subs: [],
};

// --- pub/sub ---------------------------------------------------------------
export function onChange(fn) {
  state._subs.push(fn);
}
function notify() {
  state._subs.forEach((fn) => fn(state));
}

function spend(cost) {
  if (state.coins < cost) return false;
  state.coins -= cost;
  return true;
}

// --- earning ---------------------------------------------------------------
export function addCoins(amount) {
  state.coins += amount;
  notify();
}

// --- laser ----------------------------------------------------------------
function buyLaserStat(key, cost) {
  if (state[key] >= P.MAX_LEVEL) return false;
  if (!spend(cost(state.laserTier, state[key]))) return false;
  state[key]++;
  notify();
  return true;
}
export const buyLaserThickness = () => buyLaserStat('laserThickness', P.laserThicknessCost);
export const buyLaserPower = () => buyLaserStat('laserPower', P.laserPowerCost);
export const buyLaserBeams = () => buyLaserStat('laserBeams', P.laserBeamsCost);

export function laserMaxed() {
  return state.laserThickness >= P.MAX_LEVEL && state.laserPower >= P.MAX_LEVEL && state.laserBeams >= P.MAX_LEVEL;
}

export function buyLaserNextTier() {
  if (!laserMaxed() || state.laserTier >= P.TIER_COUNT - 1) return false;
  if (!spend(P.laserNextTierCost(state.laserTier))) return false;
  state.laserTier++;
  state.laserThickness = 1;
  state.laserPower = 1;
  state.laserBeams = 1;
  notify();
  return true;
}

export function buyClick() {
  if (!spend(P.clickCost(state.clickLevel))) return false;
  state.clickLevel++;
  notify();
  return true;
}
export function buyShard() {
  if (!spend(P.shardCost(state.shardLevel))) return false;
  state.shardLevel++;
  notify();
  return true;
}
export function buyVacuum() {
  if (state.vacuumTier >= P.BASE.vacuumTiers - 1) return false;
  if (!spend(P.vacuumCost(state.vacuumTier))) return false;
  state.vacuumTier++;
  notify();
  return true;
}

// --- objects ---------------------------------------------------------------
// Objects unlock one-by-one in order: an object becomes available once the
// previous one has been unlocked (bought at all). There is no restriction on
// upgrading already-unlocked objects.
export function objectUnlocked(idx) {
  return idx === 0 || state.objects[idx - 1] >= 1;
}

export function buyObject(idx) {
  if (!objectUnlocked(idx)) return false;
  const level = state.objects[idx];
  if (level >= P.MAX_LEVEL) return false;
  if (level === 0) {
    if (!spend(P.objectUnlockCost(state.objectTier, idx))) return false;
  } else {
    if (!spend(P.objectUpgradeCost(state.objectTier, idx, level))) return false;
  }
  state.objects[idx]++;
  notify();
  return true;
}

// The whole set is "maxed" when every shape is at the level cap.
export function objectTierMaxed() {
  return state.objects.every((l) => l >= P.MAX_LEVEL);
}

export function buyObjectNextTier() {
  if (!objectTierMaxed() || state.objectTier >= P.TIER_COUNT - 1) return false;
  if (!spend(P.objectNextTierCost(state.objectTier))) return false;
  state.objectTier++;
  state.objects = [1, 0, 0, 0, 0]; // same shapes, fresh at the new colour tier
  notify();
  return true;
}

// --- dev helpers (no cost) -------------------------------------------------
// Max every stat of the current laser tier, then jump to the next colour tier
// (fresh stats), mirroring the real progression but bypassing coin cost.
export function devNextLaserTier() {
  state.laserThickness = P.MAX_LEVEL;
  state.laserPower = P.MAX_LEVEL;
  state.laserBeams = P.MAX_LEVEL;
  if (state.laserTier < P.TIER_COUNT - 1) {
    state.laserTier++;
    state.laserThickness = 1;
    state.laserPower = 1;
    state.laserBeams = 1;
  }
  notify();
  return state.laserTier;
}

// Max every object of the current tier, then jump to the next colour tier.
export function devNextObjectTier() {
  state.objects = state.objects.map(() => P.MAX_LEVEL);
  if (state.objectTier < P.TIER_COUNT - 1) {
    state.objectTier++;
    state.objects = [1, 0, 0, 0, 0];
  }
  notify();
  return state.objectTier;
}

// Pick the next object to disintegrate: a progressive-random choice among the
// unlocked shapes in the current set, weighted so more advanced shapes (higher
// index) show up more often while earlier ones still appear.
export function pickSpawn() {
  const pool = [];
  let total = 0;
  for (let idx = 0; idx < SHAPES.length; idx++) {
    if (state.objects[idx] > 0) {
      const weight = idx + 1; // progressive bias toward later shapes
      pool.push({ idx, weight });
      total += weight;
    }
  }
  const pickIdx = (() => {
    if (pool.length === 0) return 0; // safety: always have the starter shape
    let r = Math.random() * total;
    for (const p of pool) {
      r -= p.weight;
      if (r <= 0) return p.idx;
    }
    return pool[pool.length - 1].idx;
  })();
  return { tier: state.objectTier, idx: pickIdx, level: Math.max(1, state.objects[pickIdx]) };
}
