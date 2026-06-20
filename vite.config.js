import { defineConfig } from 'vite';

// DEV config (used by `npm run dev` and `npm run preview`). The CrazyGames build
// uses vite.config.crazygames.js instead — see `npm run build`.
//
// CrazyGames serves each game from a CDN sub-path, not a domain root, so every
// asset URL must be RELATIVE. `base: './'` makes Vite emit the bundled
// JS/CSS/asset references in index.html as `./assets/...` instead of `/assets/...`.
// (Runtime string paths to /public files — images, sound_fx, bg_music — are made
// relative at their source in assets.js / audio.js / index.html.)
//
// `define` injects compile-time constants (replacing the old .env files; every
// var here is client-side, so .env bought us nothing):
//   __CRAZYGAMES__  false → platform.js picks the mock SDK, no SDK <script>.
//   __DEV_MODE__    true  → console `dev.*` helpers + in-panel dev tools on.
export default defineConfig({
  base: './',
  define: {
    __CRAZYGAMES__: false,
    __DEV_MODE__: true,
  },
});
