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
import { initUI, showOfflineReward, showTierBanner, tutOnShatter } from './ui.js';
import { state, addCoins, devNextLaserTier, devNextObjectTier, resetState, recordUnlock } from './state.js';
import { fmt, fmtCoins } from './format.js';
import { passiveCoinsPerSecond, offlineCoins, LASER_TIER_NAMES, LASER_TIER_COLORS } from './progression.js';
import { loadGame, saveGame, clearSave, installAutosave } from './persistence.js';
import { audio } from './audio.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// Install the audio system's unlock-on-first-gesture + tab-hidden handlers. The
// scene drives the gameplay sounds (hum/snaps/shatter/coins/tier-up); the UI
// drives buy/deny and the settings toggles.
audio.init();

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
  // Cap at 2: on a 3x display the canvas + every GlowFilter render-to-texture
  // pass would otherwise run at ~9x the pixels for no visible gain at this size.
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});

document.getElementById('lab').appendChild(renderer.view);

const stage = new Container();
const scene = new Scene(LAB_W, LAB_H, renderer);
stage.addChild(scene.container);

// Click anywhere on the lab -> click damage at the pointer position. The canvas
// is often CSS-scaled (mobile/landscape) so convert client coords into the lab's
// native 480x680 space before handing them to the scene (ripple + recoil land on
// the real hit point).
renderer.view.addEventListener('pointerdown', (e) => {
  const rect = renderer.view.getBoundingClientRect();
  const x = rect.width ? ((e.clientX - rect.left) / rect.width) * LAB_W : LAB_W / 2;
  const y = rect.height ? ((e.clientY - rect.top) / rect.height) * LAB_H : LAB_H / 2;
  scene.click(x, y);
});

// Brand-new player (no save at all): seed the starter relic into the collection
// log and let the onboarding hints play. Returning players are gated out by the
// persisted tutorial flags (see persistence.loadGame).
const isNewPlayer = !loaded;
if (isNewPlayer) recordUnlock(0, 0);

initUI();

// Tier-crossing banner + the durability bar's reactions to the on-screen drama.
scene.onLaserTierUp = (tier) => showTierBanner(LASER_TIER_NAMES[tier], hex(LASER_TIER_COLORS[tier]));
scene.onSnap = () => flashDurability('snap');
scene.onShatter = () => {
  flashDurability('shatter');
  tutOnShatter(); // advance the first-run tutorial past "destroy your first object"
};

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

// Offline progression on TAB-RETURN, not just on a fresh page load. The reward
// block above only runs at module load, so a player who merely backgrounds the
// tab (the common case on mobile) — or returns via the back/forward cache —
// would otherwise earn nothing for being away. Track when we go hidden and, on
// return, credit the gap with the SAME offlineCoins() logic the reload path
// uses (no rate changes; the >=60s gate inside it means quick tab flicker pays
// nothing and shows no modal). `awayStart` is held in memory rather than read
// from the save's `savedAt`, because the background autosave keeps advancing
// savedAt while hidden (which would under-count away-time); the in-memory value
// also survives a bfcache freeze, so this same handler covers back/forward
// restores too.
let awayStart = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    awayStart = Date.now();
  } else if (document.visibilityState === 'visible' && awayStart) {
    const elapsedSeconds = (Date.now() - awayStart) / 1000;
    awayStart = 0;
    const reward = offlineCoins(elapsedSeconds, passiveCoinsPerSecond(state));
    if (reward.coins > 0) {
      addCoins(reward.coins);
      showOfflineReward(reward);
      saveGame(); // re-stamp the baseline so a follow-up reload can't re-award the gap
    }
  }
});

// Durability readout above the canvas. The bar runs green (full) -> yellow ->
// orange -> red (nearly destroyed), interpolated continuously from the fraction.
const durText = document.getElementById('dur-text');
const durFill = document.getElementById('dur-fill');
const durBar = document.querySelector('#durability .dur-bar');
const rewardVal = document.getElementById('reward-val');

// Acknowledge the on-screen drama on the HUD: a quick white flash + jolt of the
// bar at each snap threshold, and a stronger one on the shatter (P1.5). Uses the
// Web Animations API so the transient effect never lingers in the stylesheet.
function flashDurability(kind) {
  if (!durBar) return;
  const big = kind === 'shatter';
  const dx = big ? 5 : 3;
  durBar.animate(
    [{ transform: 'translateX(0)' }, { transform: `translateX(-${dx}px)` }, { transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }],
    { duration: big ? 240 : 140, easing: 'ease-out' }
  );
  // A neutral white glow around the bar — NOT a fill-brightness filter, which
  // tinted the green bar an ugly light-green on hard multi-snap hits.
  durBar.animate(
    [
      { boxShadow: '0 0 0 0 rgba(255,255,255,0)' },
      { boxShadow: `0 0 ${big ? 14 : 8}px 1px rgba(255,255,255,${big ? 0.8 : 0.45})` },
      { boxShadow: '0 0 0 0 rgba(255,255,255,0)' },
    ],
    { duration: big ? 360 : 200, easing: 'ease-out' }
  );
}

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
let lastBounty = -1;
function updateDurability() {
  const dur = Math.max(0, scene.dur);
  const max = scene.maxDur || 1;
  const frac = dur / max;
  // Bounty readout: the current object's expected payout, so each kill shows its
  // prize. Recomputed only when it has moved meaningfully (a new object spawns,
  // or shard-value upgrades change the worth).
  if (rewardVal) {
    const bounty = scene.currentBounty();
    if (lastBounty < 0 || Math.abs(bounty - lastBounty) > lastBounty * 0.01 + 0.5) {
      lastBounty = bounty;
      // Floored, decimal-free readout (fmtCoins floors + comma-groups) — the
      // reward reads as a clean whole number rather than "1.23K".
      rewardVal.textContent = fmtCoins(bounty);
    }
  }
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
