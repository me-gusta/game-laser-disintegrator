// persistence.js
// ---------------------------------------------------------------------------
// Saves the game state via the platform storage seam and restores it on boot.
// Every save stamps a `savedAt` wall-clock time so main.js can work out how long
// the player was away and grant offline progression (see progression.offlineCoins).
//
// Storage is `platform`'s `data` module — localStorage in dev, the CrazyGames
// data module in the CrazyGames build — both exposing the same synchronous
// getItem/setItem/removeItem API. We write the WHOLE state under one key, so
// there's no partial-write hazard (the "retrieve before set" caution in the
// CrazyGames docs is about merging into shared data; we own the full blob).
//
// We persist on every way out of the page — closing/reloading the tab and
// bfcache/mobile navigation (pagehide), and the tab being hidden i.e. switched
// away or the screen locked (visibilitychange) — plus a periodic autosave as a
// backstop so an abrupt kill loses at most a few seconds. ('beforeunload' is
// avoided on purpose: it would disable the back/forward cache.)
// ---------------------------------------------------------------------------
import { state } from './state.js';
import { TIER_COUNT, MAX_LEVEL, objectMaxLevel, BASE } from './progression.js';
// Imported as `storage` because saveGame/loadGame already use a local `data`.
import { data as storage } from './platform/platform.js';

// v2: the economy was fundamentally rebalanced (slow-and-weighty curves); v1
// saves hold progress on incompatible scales, so bump the key to discard them.
const KEY = 'laserDisintegrator/save/v2';
const AUTOSAVE_MS = 5000;

// The plain numeric/array fields of `state` worth persisting (everything except
// the pub/sub list and derived data).
const SAVE_KEYS = [
  'coins',
  'laserTier',
  'laserThickness',
  'laserPower',
  'laserBeams',
  'clickLevel',
  'shardLevel',
  'vacuumTier',
  'objectTier',
  'objects',
  'collection',
  'tutorialStep',
];

export function saveGame() {
  try {
    const data = { v: 2, savedAt: Date.now() };
    for (const k of SAVE_KEYS) data[k] = state[k];
    storage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Private mode / quota / disabled storage / CrazyGames dataLimitExceeded —
    // saving is best-effort.
  }
}

// Drop the persisted save entirely (used by dev.reset). The periodic autosave
// will write a fresh one from the reset state on its next tick.
export function clearSave() {
  try {
    storage.removeItem(KEY);
  } catch {
    // Best-effort, same as saveGame.
  }
}

// Restore the saved state into `state` in place. Returns { savedAt } (ms epoch)
// for the loaded save, or null when there is nothing valid to restore.
export function loadGame() {
  let data;
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  for (const k of SAVE_KEYS) {
    const v = data[k];
    if (k === 'objects') {
      if (Array.isArray(v)) {
        for (let i = 0; i < state.objects.length; i++) {
          if (typeof v[i] === 'number') state.objects[i] = v[i];
        }
      }
    } else if (k === 'collection') {
      // Array of { tier, idx, cps } — keep only well-formed entries.
      if (Array.isArray(v)) {
        state.collection = v.filter(
          (e) =>
            e &&
            Number.isFinite(e.tier) &&
            Number.isFinite(e.idx) &&
            Number.isFinite(e.cps)
        );
      }
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      state[k] = v;
    }
  }

  // Legacy saves (written before onboarding existed) carry no tutorial progress —
  // those players are clearly not new, so mark the tutorial done (step 3).
  if (!('tutorialStep' in data)) {
    state.tutorialStep = 3;
  }

  // Clamp every restored field to a valid range so a corrupt or tampered save
  // (e.g. an out-of-range laserTier indexing undefined colour/name art, or a
  // negative balance) can't drop the game into a broken state.
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));
  state.coins = Math.max(0, state.coins) || 0;
  state.laserTier = clamp(state.laserTier, 0, TIER_COUNT - 1);
  state.objectTier = clamp(state.objectTier, 0, TIER_COUNT - 1);
  state.laserThickness = clamp(state.laserThickness, 1, MAX_LEVEL);
  state.laserPower = clamp(state.laserPower, 1, MAX_LEVEL);
  state.laserBeams = clamp(state.laserBeams, 1, MAX_LEVEL);
  state.clickLevel = Math.max(0, Math.round(state.clickLevel));
  state.shardLevel = Math.max(0, Math.round(state.shardLevel));
  state.vacuumTier = clamp(state.vacuumTier, 0, BASE.vacuumTiers - 1);
  const omax = objectMaxLevel(state.objectTier);
  for (let i = 0; i < state.objects.length; i++) {
    state.objects[i] = clamp(state.objects[i], 0, omax);
  }

  return { savedAt: typeof data.savedAt === 'number' ? data.savedAt : null };
}

// Register all the "leaving" triggers plus a periodic backstop. Call once.
// We deliberately do NOT use 'beforeunload' — it makes the page ineligible for
// the browser's back/forward cache (bfcache). 'pagehide' fires on the same
// teardown paths (close/reload/navigation, including bfcache eviction) and
// 'visibilitychange' catches tab-switch / screen-lock, so saving stays covered
// without the bfcache penalty.
export function installAutosave() {
  window.addEventListener('pagehide', saveGame);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveGame();
  });
  setInterval(saveGame, AUTOSAVE_MS);
}
