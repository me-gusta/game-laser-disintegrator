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
  // Small fresh-start cushion so the very first buy is a short save, not instant
  // (keeps the "slow & weighty" feel). Returning players are unaffected:
  // loadGame() overwrites coins from the save when one exists.
  coins: 10,
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
// Objects unlock one-by-one in order: an object becomes available only once the
// previous one has been fully MAXED (level == MAX_LEVEL). You cannot buy a new
// object while the previous one still has upgrades left.
export function objectUnlocked(idx) {
  return idx === 0 || state.objects[idx - 1] >= P.MAX_LEVEL;
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

// Restore every gameplay field to its fresh-start value in place (keeping the
// same `state` object identity so the scene/UI references and subscribers stay
// live), then notify. Clearing the save is the caller's job (see dev.reset).
export function resetState() {
  state.coins = 10;
  state.laserTier = 0;
  state.laserThickness = 1;
  state.laserPower = 1;
  state.laserBeams = 1;
  state.clickLevel = 0;
  state.shardLevel = 0;
  state.vacuumTier = 0;
  state.objectTier = 0;
  state.objects = [1, 0, 0, 0, 0];
  notify();
}

// Pick the next object to disintegrate: ALWAYS the last (highest-index) unlocked
// shape — i.e. the newest one the player has bought. Because a new object can
// only be unlocked after the previous one is maxed, this is also the only object
// still being worked on, so it is the single thing that spawns in the lab.
export function pickSpawn() {
  let idx = 0;
  for (let i = 0; i < SHAPES.length; i++) {
    if (state.objects[i] > 0) idx = i;
  }
  return { tier: state.objectTier, idx, level: Math.max(1, state.objects[idx]) };
}
