import { defineConfig } from 'vite';

// CrazyGames PRODUCTION config (`npm run build` → `vite build --config this`).
// Differs from the dev config (vite.config.js) in two ways:
//   1. compile-time constants flip the platform to the real SDK and strip dev
//      affordances (__CRAZYGAMES__ true, __DEV_MODE__ false). With the constant
//      true, platform.js never references the mock and Rollup tree-shakes
//      mock-sdk.js out of the bundle entirely.
//   2. the CrazyGames SDK <script> is injected into index.html's <head>. It's a
//      classic (non-module) script, so it runs before our deferred module entry
//      — `window.CrazyGames.SDK` is ready by the time platform.init() runs.
// `base: './'` matters for the same CDN-sub-path reason as the dev config.

function crazygamesSdkPlugin() {
  return {
    name: 'crazygames-sdk',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { src: 'https://sdk.crazygames.com/crazygames-sdk-v3.js' },
          injectTo: 'head',
        },
      ];
    },
  };
}

export default defineConfig({
  base: './',
  define: {
    __CRAZYGAMES__: true,
    __DEV_MODE__: false,
  },
  plugins: [crazygamesSdkPlugin()],
});
