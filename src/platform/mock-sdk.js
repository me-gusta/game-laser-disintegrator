// mock-sdk.js
// ---------------------------------------------------------------------------
// A stand-in for `window.CrazyGames.SDK` used in the dev build (the real SDK
// <script> is only injected by vite.config.crazygames.js). It mirrors the slice
// of the SDK that PlatformApi touches:
//   - data    → the same getItem/setItem/removeItem/clear shape as localStorage,
//               backed by the browser's localStorage so dev saves persist.
//   - game    → settings (muteAudio / disableChat, forceable via URL params),
//               a settings-change listener registry, and the gameplay/loading
//               lifecycle hooks (no-ops that log so you can see them fire).
//   - init()  → resolves immediately.
//
// The whole thing is wrapped in a Proxy so that ANY other SDK module the game
// (or a future feature) reaches for — `SDK.ad`, `SDK.user`, … — resolves to a
// chainable no-op instead of throwing in dev. That keeps the dev build resilient
// to using SDK surface we haven't explicitly mocked yet.
// ---------------------------------------------------------------------------

const tag = '[mock-sdk]';
const log = (...a) => console.debug(tag, ...a);

// A function that is also an object whose every property is another no-op proxy,
// so `SDK.anything.deep().chain` never throws in dev.
function makeNoop() {
  const fn = () => undefined;
  return new Proxy(fn, {
    get: (_t, prop) => (prop === 'then' ? undefined : makeNoop()), // not a thenable
    apply: () => undefined,
  });
}

export function installMockSdk() {
  // localStorage-compatible data module. Methods are plain so PlatformApi's data
  // proxy can bind them like the real SDK.data / localStorage.
  const data = {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
    clear: () => localStorage.clear(),
  };

  // Locally the site-settings can be forced with query params, matching the
  // CrazyGames docs (?muteAudio=true, ?disableChat=true).
  const params = new URLSearchParams(location.search);
  const settings = {
    muteAudio: params.get('muteAudio') === 'true',
    disableChat: params.get('disableChat') === 'true',
  };

  const listeners = new Set();
  const game = {
    settings,
    gameplayStart: () => log('gameplayStart'),
    gameplayStop: () => log('gameplayStop'),
    loadingStart: () => log('loadingStart'),
    loadingStop: () => log('loadingStop'),
    addSettingsChangeListener: (fn) => listeners.add(fn),
    removeSettingsChangeListener: (fn) => listeners.delete(fn),
  };

  const sdk = {
    init: async () => log('init'),
    data,
    game,
    // Dev-only escape hatch: simulate the site changing settings (e.g. the player
    // muting the game from CrazyGames chrome) so the live listener path can be
    // exercised locally — wired onto window.dev in main.js.
    _setSettings(patch) {
      Object.assign(settings, patch);
      for (const fn of listeners) fn(settings);
    },
  };

  const safe = new Proxy(sdk, {
    get: (target, prop) => (prop in target ? target[prop] : makeNoop()),
  });

  window.CrazyGames = { SDK: safe };
  return safe;
}
