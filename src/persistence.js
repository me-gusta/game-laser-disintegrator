// persistence.js
// ---------------------------------------------------------------------------
// Saves the game state to localStorage and restores it on boot. Every save
// stamps a `savedAt` wall-clock time so main.js can work out how long the
// player was away and grant offline progression (see progression.offlineCoins).
//
// We persist on every way out of the page — closing/reloading the tab
// (beforeunload), bfcache/mobile navigation (pagehide), and the tab being
// hidden i.e. switched away or the screen locked (visibilitychange) — plus a
// periodic autosave as a backstop so an abrupt kill loses at most a few seconds.
// ---------------------------------------------------------------------------
import { state } from './state.js';

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
];

export function saveGame() {
  try {
    const data = { v: 1, savedAt: Date.now() };
    for (const k of SAVE_KEYS) data[k] = state[k];
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Private mode / quota / disabled storage — saving is best-effort.
  }
}

// Drop the persisted save entirely (used by dev.reset). The periodic autosave
// will write a fresh one from the reset state on its next tick.
export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Best-effort, same as saveGame.
  }
}

// Restore the saved state into `state` in place. Returns { savedAt } (ms epoch)
// for the loaded save, or null when there is nothing valid to restore.
export function loadGame() {
  let data;
  try {
    const raw = localStorage.getItem(KEY);
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
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      state[k] = v;
    }
  }

  return { savedAt: typeof data.savedAt === 'number' ? data.savedAt : null };
}

// Register all the "leaving" triggers plus a periodic backstop. Call once.
export function installAutosave() {
  window.addEventListener('beforeunload', saveGame);
  window.addEventListener('pagehide', saveGame);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveGame();
  });
  setInterval(saveGame, AUTOSAVE_MS);
}
