// lab/assets.js
// Central registry for every image asset under /public/images. Textures are
// created with Texture.from (which caches + lazily loads via the BaseTexture's
// own image loader — no @pixi/loaders needed for this hand-wired core build).
//
// Because textures load asynchronously, callers use whenReady() to scale a
// sprite the moment its pixels are known (firing synchronously for any texture
// already in the cache, e.g. the second time a tier's object is shown).
import { Texture } from '@pixi/core';
import { TIER_COUNT } from '../progression.js';

const BASE = '/images';
const pad2 = (n) => String(n).padStart(2, '0');

// The lab backdrop the whole scene sits in.
export const BACKGROUND = Texture.from(`${BASE}/background.png`);

// One emitter (gun) sprite per laser colour tier: laser/01.png .. 07.png.
export const LASER_TEX = Array.from({ length: TIER_COUNT }, (_, i) =>
  Texture.from(`${BASE}/laser/${pad2(i + 1)}.png`)
);

// Three vacuum-cleaner sprites (one per cleaner that spawns as the Vacuum
// upgrade is levelled): vacuum/01.png .. 03.png. Drawn facing left.
export const VACUUM_TEX = [1, 2, 3].map((n) => Texture.from(`${BASE}/vacuum/${pad2(n)}.png`));

// Object art is themed per colour tier. For now every tier uses the "egypt"
// set; later tiers get their own theme folder under /images/objects/<theme>/.
export const OBJECT_THEMES = Array.from({ length: TIER_COUNT }, () => 'egypt');

// URL of the object art at colour `tier`, shape `idx` (0..4). The single source
// of truth for the path, shared by the Pixi texture (below) and the DOM <img> in
// the Objects tab so both always show the same artwork.
export const objectImageUrl = (tier, idx) =>
  `${BASE}/objects/${OBJECT_THEMES[tier] || OBJECT_THEMES[0]}/${pad2(idx + 1)}.png`;

// Texture for the object at colour `tier`, shape `idx` (0..4). Cached by URL via
// Texture.from, so repeated spawns of the same object reuse one GPU texture.
export function objectTexture(tier, idx) {
  return Texture.from(objectImageUrl(tier, idx));
}

// Run `cb(width, height)` once `tex` has real pixel dimensions — immediately if
// it is already loaded, otherwise on its BaseTexture 'loaded' event.
export function whenReady(tex, cb) {
  if (tex.baseTexture.valid) cb(tex.width, tex.height);
  else tex.baseTexture.once('loaded', () => cb(tex.width, tex.height));
}

// A solid, HARD-edged white circle "hole brush". Stamped into an object's
// RenderTexture with BLEND_MODES.ERASE to bite clean craters out of it
// (revealing the lab background behind). It is deliberately NOT feathered: with
// ERASE, any partial-alpha rim only partially erases, leaving a translucent
// halo — so the brush is fully opaque to the very edge for crisp holes. Built
// once from a hi-res canvas (downscaled when stamped, keeping the edge sharp),
// so it is valid synchronously.
function makeBrush(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  return Texture.from(c);
}

export const BRUSH = makeBrush();
