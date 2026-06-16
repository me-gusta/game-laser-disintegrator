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
import { initUI } from './ui.js';
import { state, addCoins, devNextLaserTier, devNextObjectTier } from './state.js';
import { fmt } from './format.js';

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
const scene = new Scene(LAB_W, LAB_H);
stage.addChild(scene.container);

// Click anywhere on the lab -> click damage.
renderer.view.addEventListener('pointerdown', () => scene.click());

initUI();

// Durability readout above the canvas.
const durText = document.getElementById('dur-text');
const durFill = document.getElementById('dur-fill');
function updateDurability() {
  const dur = Math.max(0, scene.dur);
  const max = scene.maxDur || 1;
  durText.textContent = `${fmt(dur)} / ${fmt(max)}`;
  durFill.style.width = `${Math.max(0, Math.min(100, (dur / max) * 100))}%`;
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
};
