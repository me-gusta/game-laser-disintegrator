// platform.js
// ---------------------------------------------------------------------------
// The single seam between the game and the host platform (CrazyGames). Nothing
// else in the codebase touches `window.CrazyGames` directly — they go through
// the `platform` singleton (lifecycle + settings) and the `data` proxy (saves).
//
// Which backend is live is decided ONCE, at build time, by the `__CRAZYGAMES__`
// constant injected via vite `define`:
//   - dev build      → __CRAZYGAMES__ === false → a mock SDK (mock-sdk.js),
//                       lazily imported so it's tree-shaken out of production.
//   - crazygames     → __CRAZYGAMES__ === true  → the real window.CrazyGames.SDK,
//                       loaded by the <script> vite.config.crazygames.js injects.
// Because the choice is a compile-time constant, the unused branch (and the mock
// import) is dropped from the shipped bundle entirely.
// ---------------------------------------------------------------------------

/* global __CRAZYGAMES__ */

// The active data backend (SDK.data once init() runs). Until then the `data`
// proxy below falls back to localStorage so any early read still works.
let activeData = null;

// localStorage-compatible store, indirected so callers can `import { data }` at
// module load and have every call resolve to whatever backend init() selected.
// Methods are bound to their backend so `this` stays correct.
export const data = new Proxy(
  {},
  {
    get(_target, prop) {
      const backend = activeData ?? localStorage;
      const value = backend[prop];
      return typeof value === 'function' ? value.bind(backend) : value;
    },
  }
);

const NO_SETTINGS = { muteAudio: false, disableChat: false };

class PlatformApi {
  constructor() {
    this._sdk = null; //                 raw SDK (mock or real); set in init()
    this._settingsListeners = new Set();
  }

  get isCrazyGames() {
    return __CRAZYGAMES__;
  }

  // Pick the backend, initialise the SDK, then bring up data + settings + the
  // loading lifecycle. Must be awaited before any data access on CrazyGames, so
  // saves read the player's real cross-device data and not stale localStorage.
  async init() {
    if (__CRAZYGAMES__) {
      this._sdk = window.CrazyGames.SDK;
    } else {
      const { installMockSdk } = await import('./mock-sdk.js');
      this._sdk = installMockSdk();
    }

    // The SDK must be initialised before any other SDK call.
    try {
      await this._sdk.init();
    } catch (err) {
      // Best-effort: a failed init shouldn't take the whole game down. The data
      // proxy keeps its localStorage fallback and lifecycle calls become no-ops.
      console.warn('[platform] SDK init failed', err);
    }

    activeData = this._sdk.data;
    this.loadingStart();
    this._sdk.game.addSettingsChangeListener((s) => this._emitSettings(s));
  }

  // --- site settings (muteAudio / disableChat) -----------------------------
  get settings() {
    return this._sdk ? this._sdk.game.settings : NO_SETTINGS;
  }

  // Subscribe to settings changes. Fires once immediately with the current value
  // so callers apply the initial state in the same place they handle updates.
  // Returns an unsubscribe function.
  onSettingsChange(fn) {
    this._settingsListeners.add(fn);
    fn(this.settings);
    return () => this._settingsListeners.delete(fn);
  }
  _emitSettings(s) {
    for (const fn of this._settingsListeners) fn(s);
  }

  // --- lifecycle (all no-op safely before init / when the SDK call is absent) -
  loadingStart() { this._sdk?.game.loadingStart(); }
  loadingStop() { this._sdk?.game.loadingStop(); }
  gameplayStart() { this._sdk?.game.gameplayStart(); }
  gameplayStop() { this._sdk?.game.gameplayStop(); }

  // Dev-only: forward to the mock's settings simulator (undefined on the real
  // SDK, so guard the optional chain).
  _simulateSettings(patch) {
    this._sdk?._setSettings?.(patch);
  }
}

export const platform = new PlatformApi();
