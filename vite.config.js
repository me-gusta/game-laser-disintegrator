import { defineConfig } from 'vite';

// CrazyGames serves each game from a CDN sub-path, not a domain root, so every
// asset URL must be RELATIVE. `base: './'` makes Vite emit the bundled
// JS/CSS/asset references in index.html as `./assets/...` instead of `/assets/...`.
// (Runtime string paths to /public files — images, sound_fx, bg_music — are made
// relative at their source in assets.js / audio.js / index.html.)
export default defineConfig({
  base: './',
});
