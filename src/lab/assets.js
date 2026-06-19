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

// Object art is themed per colour tier, one theme folder per tier under
// /images/objects/<theme>/. Index = 0-based tier (UI shows it +1). Any tier past
// the end of this list falls back to the first theme.
export const OBJECT_THEMES = [
  'egypt', //     tier 1
  'arthur', //    tier 2
  'japan', //     tier 3
  'pirates', //   tier 4
  'rome', //      tier 5
  'vikings', //   tier 6
  'wild_west', // tier 7
];

// Display strings (set title + the 5 item names) for each theme. The artwork,
// the set heading and the per-row item labels are all driven from here so they
// stay in lockstep. As new themes are added for later tiers, add an entry here
// and point OBJECT_THEMES at it.
const THEME_LABELS = {
  egypt: {
    setName: 'Ancient Egypt Set',
    items: [
      'Scarab Beetle Charm',
      'Alabaster Canopic Jar',
      'Bust of Nefertiti',
      'Eye of Horus',
      'Golden Mask of Tutankhamun',
    ],
  },
  arthur: {
    setName: "King Arthur's Relics",
    items: ['Knight Helmet', 'Knight Shield', 'King Crown', 'Holy Grail', 'Iron Gauntlet'],
  },
  japan: {
    setName: 'Feudal Japan',
    items: ['Ninja Star', 'Samurai Mask', 'Katana', 'Paper Lantern', 'Scroll'],
  },
  pirates: {
    setName: 'Pirates',
    items: ['Pirate Hook', 'Flintlock Pistol', 'Spyglass', 'Compass', 'Jolly Roger'],
  },
  rome: {
    setName: 'Ancient Rome',
    items: ['Gladiator Helmet', 'Golden Eagle', 'Gladius', 'Shield', 'Bust of Julius Caesar'],
  },
  vikings: {
    setName: 'Vikings',
    items: ['Viking Helmet', 'Rune Stone', 'Horn', 'Bearded Axe', 'Drakkar'],
  },
  wild_west: {
    setName: 'Wild West',
    items: ['Cowboy Boot', 'Wanted Poster', 'Cavalry Sabre', 'Revolver Cylinder', 'Sheriff Badge'],
  },
};

const themeFor = (tier) => OBJECT_THEMES[tier] || OBJECT_THEMES[0];

// Title of the object set shown at colour `tier` (e.g. "Ancient Egypt Set").
export const objectSetName = (tier) => THEME_LABELS[themeFor(tier)]?.setName || `${themeFor(tier)} Set`;

// Name of the individual item at colour `tier`, shape `idx` (0..4).
export const objectItemName = (tier, idx) =>
  THEME_LABELS[themeFor(tier)]?.items[idx] || `Item ${idx + 1}`;

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

// A unit diamond (rotated square), white so it can be .tint-ed to the object's
// tier colour. Every shard particle is a pooled Sprite of THIS one texture rather
// than a per-shard Graphics — far less allocation/GC churn over a long idle
// session, and all shards batch into a single draw call (one shared texture).
// Half-extent in texture space is size/2; callers scale by (shardSize / half).
function makeDiamond(size = 32) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const h = size / 2;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(h, 0);
  ctx.lineTo(size, h);
  ctx.lineTo(h, size);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  return Texture.from(c);
}

export const SHARD = makeDiamond();
