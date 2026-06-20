import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

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

// Pack the finished build into ./crazygames.zip at the project root, ready to
// drag straight into the CrazyGames upload form. CrazyGames requires index.html
// at the ROOT of the zip (not nested in a dist/ folder), so we zip the CONTENTS
// of the output dir (`zip ... .` run with cwd = outDir) rather than the dir
// itself. Runs in closeBundle, after all assets are on disk.
function crazygamesZipPlugin() {
  let outDir;
  return {
    name: 'crazygames-zip',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const zipPath = resolve(outDir, '..', 'crazygames.zip');
      // Remove a stale archive first — `zip` would otherwise merge into it,
      // leaving deleted assets behind.
      rmSync(zipPath, { force: true });
      // -r recurse, -X drop extra file attributes, -q quiet. cwd = outDir so the
      // archive's top level is index.html + assets/, exactly as CrazyGames wants.
      execFileSync('zip', ['-r', '-X', '-q', zipPath, '.'], { cwd: outDir });
      this.info?.(`packed ${zipPath}`);
    },
  };
}

export default defineConfig({
  base: './',
  define: {
    __CRAZYGAMES__: true,
    __DEV_MODE__: false,
  },
  plugins: [crazygamesSdkPlugin(), crazygamesZipPlugin()],
});
