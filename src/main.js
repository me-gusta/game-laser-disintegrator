// main.js
// Bootstraps the Pixi renderer (no @pixi/app in this build, so we drive a
// Renderer + Ticker + stage Container ourselves), mounts the canvas, wires the
// scene, UI and click-to-damage, then runs the loop.
import './style.css';
import { Renderer, BatchRenderer } from '@pixi/core';
import { extensions } from '@pixi/extensions';
import { Container } from '@pixi/display';
import { Ticker } from '@pixi/ticker';
import { Scene } from './lab/scene.js';
import { initUI, showOfflineReward } from './ui.js';
import { state, addCoins, devNextLaserTier, devNextObjectTier, resetState } from './state.js';
import { fmt } from './format.js';
import { passiveCoinsPerSecond, offlineCoins } from './progression.js';
import { loadGame, saveGame, clearSave, installAutosave } from './persistence.js';

// Restore any saved game BEFORE the scene/UI read state, so they build from the
// player's real progress. `loaded.savedAt` tells us how long they were away.
const loaded = loadGame();

// Register the batch renderer used to draw Graphics/Sprites (auto-done by
// @pixi/app normally, but we are wiring core by hand).
extensions.add(BatchRenderer);

const LAB_W = 480;
const LAB_H = 680;

const renderer = new Renderer({
  width: LAB_W,
  height: LAB_H,
  backgroundColor: 0x0d0f17,
  antialias: true,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
});

document.getElementById('lab').appendChild(renderer.view);

const stage = new Container();
const scene = new Scene(LAB_W, LAB_H, renderer);
stage.addChild(scene.container);

// Click anywhere on the lab -> click damage.
renderer.view.addEventListener('pointerdown', () => scene.click());

initUI();

// Offline progression: credit coins the laser "earned" while the tab was gone
// (>=60s, counted up to 24h, at the full live passive rate). Granted after the UI
// has subscribed so the coin counter updates, then we immediately re-save to
// stamp a fresh savedAt (otherwise a quick reload would award the gap twice).
if (loaded && loaded.savedAt) {
  const elapsedSeconds = (Date.now() - loaded.savedAt) / 1000;
  const reward = offlineCoins(elapsedSeconds, passiveCoinsPerSecond(state));
  if (reward.coins > 0) {
    addCoins(reward.coins);
    showOfflineReward(reward);
  }
}
saveGame(); // stamp current time as the new baseline
installAutosave();

// Durability readout above the canvas. The bar runs green (full) -> yellow ->
// orange -> red (nearly destroyed), interpolated continuously from the fraction.
const durText = document.getElementById('dur-text');
const durFill = document.getElementById('dur-fill');

// Colour stops keyed by remaining-durability fraction, low -> high.
const DUR_STOPS = [
  [0.0, [0xff, 0x3b, 0x30]], //  red
  [0.34, [0xff, 0x8c, 0x00]], // orange
  [0.67, [0xff, 0xd0, 0x00]], // yellow
  [1.0, [0x3c, 0xd0, 0x5a]], //  green
];
function durColor(frac) {
  frac = Math.max(0, Math.min(1, frac));
  for (let i = 1; i < DUR_STOPS.length; i++) {
    const [f1, c1] = DUR_STOPS[i];
    if (frac <= f1) {
      const [f0, c0] = DUR_STOPS[i - 1];
      const t = (frac - f0) / (f1 - f0);
      const ch = (k) => Math.round(c0[k] + (c1[k] - c0[k]) * t);
      return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
    }
  }
  return 'rgb(60, 208, 90)';
}

// Skip the DOM writes when the bar hasn't moved enough to matter (~0.5%). The
// bar/text change slowly while firing and not at all during the respawn pause, so
// this avoids a layout/style write on most frames.
let lastDurFrac = -1;
function updateDurability() {
  const dur = Math.max(0, scene.dur);
  const max = scene.maxDur || 1;
  const frac = dur / max;
  if (Math.abs(frac - lastDurFrac) < 0.005) return;
  lastDurFrac = frac;
  durText.textContent = `${fmt(dur)} / ${fmt(max)}`;
  durFill.style.width = `${Math.max(0, Math.min(100, frac * 100))}%`;
  durFill.style.background = durColor(frac);
}

const ticker = new Ticker();
ticker.add(() => {
  scene.update(ticker.deltaMS);
  updateDurability();
  renderer.render(stage);
});
ticker.start();

// Console helpers for this in-house tool.
window.game = { scene, ticker, state };
window.dev = {
  addCoins: (x) => addCoins(Number(x) || 0),
  nextLaserTier: () => devNextLaserTier(),
  nextObjectsTier: () => devNextObjectTier(),
  // Wipe the save and reset all progress back to a fresh start.
  reset: () => {
    clearSave();
    resetState();
  },
};
