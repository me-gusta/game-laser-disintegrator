// ui.js
// All HTML UI is built and driven here with jQuery. It reads progression for
// labels/costs and calls the buy actions on state; state.onChange re-renders.
import $ from 'jquery';
import * as P from './progression.js';
import { fmt, fmtCoins, fmtDuration } from './format.js';
import { objectImageUrl, objectSetName, objectItemName } from './lab/assets.js';
import { saveGame } from './persistence.js';
import {
  state,
  onChange,
  buyLaserThickness,
  buyLaserPower,
  buyLaserBeams,
  buyLaserNextTier,
  laserMaxed,
  buyClick,
  buyShard,
  buyVacuum,
  buyObject,
  buyObjectNextTier,
  objectUnlocked,
  objectTierMaxed,
  SHAPES,
  TIERS,
} from './state.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// Inline SVGs for the relics panel. Strokes use currentColor so CSS can theme
// them (muted lock, green checkmark) without duplicating markup. The named sub-
// paths (.shackle, .check-ring, .check-mark) are the animation targets.
const LOCK_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="5" y="11" width="14" height="9" rx="2"/>' +
  '<path class="shackle" d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const CHECK_SVG =
  '<svg class="check-svg" viewBox="0 0 36 36" width="34" height="34" fill="none" ' +
  'stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle class="check-ring" cx="18" cy="18" r="15"/>' +
  '<path class="check-mark" d="M11 18.5 L16 23.5 L26 12.5"/></svg>';

// Small coin chip stamped beside a price on every buy/upgrade button (and the
// wallet's coins/sec headline) so a number always reads as "coins", not a bare
// figure. Same /images/coin.png the wallet uses; sized down via CSS (.coin-sm).
const COIN_SM = '<img class="coin-sm" src="/images/coin.png" alt="" aria-hidden="true" />';

// The Vacuum upgrade's game-asset art (first cleaner sprite), shown on the left
// of its card like the relic rows. Same /images/vacuum art the lab sprites use.
const VACUUM_IMG = '/images/vacuum/01.png';

// A row of level pips: `lvl` filled (.on) out of `max`. Built at rebuild time —
// pip fill only changes on a level change, which is exactly what rebuilds.
const pips = (lvl, max) =>
  '<span class="pips">' +
  Array.from({ length: max }, (_, k) => `<span class="pip${k < lvl ? ' on' : ''}"></span>`).join('') +
  `</span><span class="pip-label">${lvl}/${max}</span>`;

// Diffed DOM writes. The full panel refresh runs once per animation frame and
// touches every row, but almost nothing changes between frames (a button's text
// only moves when its cost does, on a buy). These skip the actual DOM write —
// and the style/layout work it triggers — when the value is unchanged since last
// time, tracked via an expando on the node. On a steady frame they're pure
// comparisons and write the DOM zero times.
const tx = ($el, v) => { const n = $el[0]; if (n && n.__tx !== v) { n.textContent = v; n.__tx = v; } };
const htm = ($el, v) => { const n = $el[0]; if (n && n.__htm !== v) { n.innerHTML = v; n.__htm = v; } };
const dis = ($el, v) => { const n = $el[0]; if (n && n.__dis !== v) { n.disabled = v; n.__dis = v; } };
const vis = ($el, v) => { const n = $el[0]; if (n && n.__vis !== v) { $el.toggle(v); n.__vis = v; } };
const cls = ($el, name, on) => { const n = $el[0]; const k = '__c_' + name; if (n && n[k] !== on) { $el.toggleClass(name, on); n[k] = on; } };

// --- transient feedback (Web Animations API) -------------------------------
// One-shot "juice" for purchases / affordability. WAAPI keeps these purely
// transient (nothing lingers in the stylesheet) and re-triggers cleanly on rapid
// repeats — unlike toggling a CSS animation class, which needs a reflow hack. All
// are no-ops on a missing element so callers can stay terse.
function squash(el) {
  if (el) el.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.94)' }, { transform: 'scale(1)' }], { duration: 140, easing: 'ease-out' });
}
function flashRow(el) {
  if (el) el.animate(
    [{ borderColor: '#57e08a', boxShadow: '0 0 10px rgba(87,224,138,0.55)' }, { borderColor: '#2b3142', boxShadow: '0 0 0 rgba(87,224,138,0)' }],
    { duration: 520, easing: 'ease-out' }
  );
}
// Brightness/glow pop on the stat that changed. Deliberately NOT a scale — a
// transform would grow the element past its (overflow:auto) panel and flash a
// scrollbar / shove neighbouring text off the card.
function pulseEl(el) {
  if (el) el.animate(
    [{ filter: 'brightness(2)' }, { filter: 'brightness(1)' }],
    { duration: 340, easing: 'ease-out' }
  );
}
// One-shot green glow the instant a button becomes affordable (desktop attention
// signal — deliberately NOT a perpetual throb, which would read as nagging).
function affordGlow(el) {
  if (el) el.animate(
    [{ boxShadow: '0 0 0 rgba(87,224,138,0)' }, { boxShadow: '0 0 12px rgba(87,224,138,0.85)' }, { boxShadow: '0 0 0 rgba(87,224,138,0)' }],
    { duration: 900, easing: 'ease-out' }
  );
}
// A number that floats up off an anchor element and fades — the DOM analog of the
// in-canvas damage floaters. Lives on <body> so it survives a panel rebuild of the
// element it launched from. Used for "-cost" on a buy and "+N" on a big payout.
function domFloat(anchorEl, text, color) {
  if (!anchorEl) return;
  const r = anchorEl.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'dom-float';
  el.textContent = text;
  el.style.left = `${r.left + r.width / 2}px`;
  el.style.top = `${r.top}px`;
  el.style.color = color;
  document.body.appendChild(el);
  el.animate(
    [{ transform: 'translate(-50%, 0)', opacity: 1 }, { transform: 'translate(-50%, -34px)', opacity: 0 }],
    { duration: 720, easing: 'ease-out' }
  ).onfinish = () => el.remove();
}

// Toggle a buy button's disabled state, firing the affordable-glow once when it
// flips from disabled -> enabled. Same diffed-write contract as dis() (tracks the
// last value on the node), so it's a no-op on steady frames.
function setBuyDisabled($btn, disabled) {
  const n = $btn[0];
  if (!n || n.__dis === disabled) return;
  const was = n.__dis;
  n.disabled = disabled;
  n.__dis = disabled;
  if (was === true && disabled === false) affordGlow(n);
}

// Common purchase punctuation: button squash, a green confirmation flash on the
// row and a brightness pulse on the stat that improved (the row's sub line, or the
// laser DPS header for beam stats). Called with the buy's result; a no-op on a
// failed/unaffordable click.
function confirmBuy(els, ok) {
  if (!ok) return;
  squash(els.btn[0]);
  flashRow(els.row[0]);
  if (els.laser) pulseEl($laserHead && $laserHead[0]);
  else pulseEl(els.sub[0]);
}

const staticControls = []; // refresh() callbacks for the fixed laser/shards rows
let objControls = []; //      refresh() callbacks for the (rebuilt) objects panel
// Structural state the objects panel was last built for. Compared field-by-field
// each refresh (see objectsStructureChanged) instead of building+comparing a
// joined signature string every frame, so the steady-state check allocates
// nothing. -1 / [] force the first build.
let objSigTier = -1;
let objSigLevels = []; // raw levels at last rebuild (for unlock/maxed anim detection)
let objSigCats = []; //  structural category per relic at last rebuild (rebuild trigger)

// Build a generic upgrade row. spec.refresh(els) updates dynamic text/disabled.
// An optional build.icon (image URL) seats the game-asset art on the LEFT of the
// card, mirroring the relic rows in the Objects tab.
function upgradeRow(panel, build) {
  const $row = $(`
    <div class="row">
      ${build.icon ? `<img class="row-img" src="${build.icon}" alt="" />` : ''}
      <div class="info">
        <div class="name"></div>
        <div class="sub"></div>
      </div>
      <button class="buy"></button>
    </div>`).appendTo(panel);

  const els = { row: $row, name: $row.find('.name'), sub: $row.find('.sub'), btn: $row.find('.buy'), laser: !!build.laser };
  els.btn.on('click', () => confirmBuy(els, build.buy()));
  staticControls.push(() => build.refresh(els));
}

// A "NEXT TIER" button shared by the laser and objects tabs. `build` provides:
//   maxedTier()  -> already at the final tier
//   ready()      -> current tier fully maxed (button becomes buyable)
//   cost(), nextName(), buy()
function nextTierButton(panel, build, controls) {
  const $btn = $('<button class="next-tier"></button>').appendTo(panel);
  $btn.on('click', () => build.buy());
  controls.push(() => {
    if (build.maxedTier()) {
      htm($btn, 'Tier maxed'); dis($btn, true);
    } else if (!build.ready()) {
      htm($btn, 'NEXT TIER<br><small>Max every stat to unlock</small>'); dis($btn, true);
    } else {
      const cost = build.cost();
      const affordable = state.coins >= cost;
      if (affordable) {
        htm($btn, `NEXT TIER → ${build.nextName()}<br><span class="cost">${COIN_SM}${fmt(cost)}</span>`);
      } else {
        // A multi-minute save: show how close it is + a coins/sec-based ETA so the
        // wait reads as anticipation rather than a bare price tag.
        const prog = Math.max(0, Math.min(1, state.coins / cost));
        const rate = P.passiveCoinsPerSecond(state);
        const eta = rate > 0 ? ` · ~${fmtDuration((cost - state.coins) / rate)}` : '';
        htm(
          $btn,
          `NEXT TIER → ${build.nextName()}` +
            `<span class="nt-prog"><span class="nt-fill" style="width:${(prog * 100).toFixed(1)}%"></span></span>` +
            `<span class="nt-meta"><span class="cost">${COIN_SM}${fmt(state.coins)} / ${fmt(cost)}</span>${eta}</span>`
        );
      }
      setBuyDisabled($btn, !affordable);
    }
  });
}

// ----------------------------- Laser tab -----------------------------------
function laserStatRow(panel, { label, key, cost, buy, help }) {
  upgradeRow(panel, {
    buy,
    laser: true, // a beam stat: a successful buy pulses the DPS header (confirmBuy)
    refresh(els) {
      const lvl = state[key];
      tx(els.name, `${label} · Lv ${lvl}/${P.MAX_LEVEL}`);
      tx(els.sub, help);
      if (lvl >= P.MAX_LEVEL) {
        htm(els.btn, 'Maxed'); dis(els.btn, true);
      } else {
        const c = cost(state.laserTier, lvl);
        htm(els.btn, `Upgrade<br><span class="cost">${COIN_SM}${fmt(c)}</span>`);
        setBuyDisabled(els.btn, state.coins < c);
      }
    },
  });
}

function buildLaser() {
  const panel = $('#panel-laser').empty();

  // Click Power: manual damage you deal by clicking the object yourself. Sits at
  // the top of the tab; unlike the beam stats below, it persists across tiers.
  upgradeRow(panel, {
    buy: buyClick,
    refresh(els) {
      const lvl = state.clickLevel;
      tx(els.name, `Click Power · Lv ${lvl}`);
      htm(els.sub, `<span class="val">${fmt(P.clickDamage(lvl, state.objectTier))}</span> damage per click`);
      const cost = P.clickCost(lvl);
      htm(els.btn, `Upgrade<br><span class="cost">${COIN_SM}${fmt(cost)}</span>`);
      setBuyDisabled(els.btn, state.coins < cost);
    },
  });

  const $head = $('<div class="tier-head"></div>').appendTo(panel);
  $laserHead = $head; // pulsed by confirmBuy when a beam stat is upgraded
  staticControls.push(() => {
    const dps = P.laserDps(state.laserTier, state.laserPower, state.laserThickness, state.laserBeams);
    htm(
      $head,
      `<span class="tier-name" style="color:${hex(P.LASER_TIER_COLORS[state.laserTier])}">` +
        `${P.LASER_TIER_NAMES[state.laserTier]} Laser</span>` +
        `<span class="val">${fmt(dps)} DPS</span>`
    );
  });

  laserStatRow(panel, {
    label: 'Thickness',
    key: 'laserThickness',
    cost: P.laserThicknessCost,
    buy: buyLaserThickness,
    help: 'Increase width',
  });
  laserStatRow(panel, {
    label: 'Power',
    key: 'laserPower',
    cost: P.laserPowerCost,
    buy: buyLaserPower,
    help: 'Increase damage',
  });
  laserStatRow(panel, {
    label: 'Beams',
    key: 'laserBeams',
    cost: P.laserBeamsCost,
    buy: buyLaserBeams,
    help: 'Add more lasers',
  });

  nextTierButton(
    panel,
    {
      maxedTier: () => state.laserTier >= P.TIER_COUNT - 1,
      ready: laserMaxed,
      cost: () => P.laserNextTierCost(state.laserTier),
      nextName: () => P.LASER_TIER_NAMES[state.laserTier + 1],
      buy: buyLaserNextTier,
    },
    staticControls
  );
}

// ----------------------------- Coins tab -----------------------------------
// Income upgrades only: what each shard is worth, and how fast the vacuum
// collects them. (Click Power — a damage upgrade — now lives in the Laser tab.)
function buildCoins() {
  const panel = $('#panel-coins').empty();

  // Vacuum sits ABOVE Shard Value: it's the bottleneck the player feels first
  // (uncollected shards pile up), so it leads the income tab. The vacuum-cleaner
  // game art sits on the LEFT of the card, like the relic rows.
  upgradeRow(panel, {
    buy: buyVacuum,
    icon: VACUUM_IMG,
    refresh(els) {
      const tier = state.vacuumTier;
      const maxed = tier >= P.BASE.vacuumTiers - 1;
      const cleaners = P.vacuumCleaners(tier).length;
      tx(els.name, `Vacuum · Lv ${tier + 1}/${P.BASE.vacuumTiers}`);
      htm(els.sub,
        `<span class="val">${P.vacuumTotalRate(tier).toFixed(1)}</span> shards/sec · ` +
          `${cleaners} cleaner${cleaners > 1 ? 's' : ''}`
      );
      if (maxed) {
        htm(els.btn, 'Maxed'); dis(els.btn, true);
      } else {
        const cost = P.vacuumCost(tier);
        htm(els.btn, `Upgrade<br><span class="cost">${COIN_SM}${fmt(cost)}</span>`);
        setBuyDisabled(els.btn, state.coins < cost);
      }
    },
  });

  upgradeRow(panel, {
    buy: buyShard,
    refresh(els) {
      const lvl = state.shardLevel;
      tx(els.name, `Shard Value · Lv ${lvl}`);
      htm(els.sub, `<span class="val">${fmt(P.shardValue(lvl))}×</span> coins per shard`);
      const cost = P.shardCost(lvl);
      htm(els.btn, `Upgrade<br><span class="cost">${COIN_SM}${fmt(cost)}</span>`);
      setBuyDisabled(els.btn, state.coins < cost);
    },
  });
}

// ----------------------------- Objects tab ---------------------------------
// Only one set of shapes is shown, at the current colour tier. The panel is only
// REBUILT when its structure changes — the tier, or a relic crossing a category
// boundary (gated <-> active <-> maxed). A plain level increment within "active"
// (buy a relic, level it up) is NOT structural: those rows update their cost/pips
// in place via objControls, so a routine upgrade never tears down and reflashes
// every image/dot in the panel.
//
// Structural category of relic idx: 0 gated, 1 active (buyable/owned), 2 maxed.
function objCategory(idx) {
  const objMax = P.objectMaxLevel(state.objectTier);
  const lvl = state.objects[idx];
  if (lvl >= objMax) return 2;
  if (lvl === 0 && !objectUnlocked(idx)) return 0;
  return 1;
}

function objectsStructureChanged() {
  if (state.objectTier !== objSigTier) return true;
  const o = state.objects;
  if (o.length !== objSigCats.length) return true;
  for (let i = 0; i < o.length; i++) {
    if (objCategory(i) !== objSigCats[i]) return true;
  }
  return false;
}

// Rebuild the relics panel. animUnlock[idx] / animMaxed[idx] mark the rows that
// JUST transitioned this rebuild (computed in runRefresh); those rows are built
// with one-shot CSS animation classes that auto-play once on creation. A rebuild
// only happens on a tier or level change, so each relic's state (gated/buyable/
// owned/maxed), name, art and pip fill are baked here; the per-frame callback
// only re-checks affordability (coins) for rows that still have a live button.
function rebuildObjects(animUnlock = [], animMaxed = []) {
  const panel = $('#panel-objects').empty();
  objControls = [];
  const t = state.objectTier;
  const objMax = P.objectMaxLevel(t);

  // From tier 2 onward, past tiers have vanished from the grid — surface them in a
  // Collection modal so completed work isn't lost (P2.3).
  if (t >= 1) {
    $('<button class="collection-btn">Collection</button>')
      .appendTo(panel)
      .on('click', showCollection);
  }

  const $set = $('<div class="tier current"></div>').appendTo(panel);
  $set.append(
    `<h3>${objectSetName(t)} <span class="badge">tier ${t + 1}/${P.TIER_COUNT}</span></h3>`
  );
  const $list = $('<div class="objlist"></div>').appendTo($set);

  SHAPES.forEach((shape, idx) => {
    const lvl = state.objects[idx];
    const unlocked = objectUnlocked(idx);
    const isMaxed = lvl >= objMax;
    const isGated = lvl === 0 && !unlocked;
    const isBuyable = lvl === 0 && unlocked;
    const justUnlocked = !!animUnlock[idx];
    const name = objectItemName(t, idx);
    const img = `<img class="obj-img" src="${objectImageUrl(t, idx)}" alt="${isGated ? '' : name}" />`;

    let $row;
    if (isGated) {
      // Gated: previous relic not yet maxed. Silhouette + lock icon + caption.
      // No name, no button — nothing the player can act on yet.
      $row = $(
        `<div class="obj-row gated">${img}` +
          `<span class="lock-icon">${LOCK_SVG}</span>` +
          `<div class="gate-msg">Max out previous relic</div></div>`
      ).appendTo($list);
      return; // gated rows have no live button -> no per-frame callback
    }

    if (isMaxed) {
      // Maxed: all pips filled + a checkmark badge. `pop` (set only when this
      // relic just hit the cap) drives the one-shot draw animation; otherwise
      // the SVG renders fully-drawn and static.
      $row = $(
        `<div class="obj-row maxed">${img}` +
          `<div class="info"><div class="name">${name}</div>` +
          `<div class="lvl">${pips(objMax, objMax)}</div></div>` +
          `<span class="obj-check${animMaxed[idx] ? ' pop' : ''}" title="Maxed out">${CHECK_SVG}</span></div>`
      ).appendTo($list);
      if (animMaxed[idx]) {
        // Same one-shot guard as the unlock reveal: drop `pop` after it plays so
        // re-showing the panel doesn't replay the checkmark draw.
        const check = $row[0].querySelector('.obj-check');
        setTimeout(() => check && check.classList.remove('pop'), 800);
      }
      return; // maxed rows have no button
    }

    // Active: buyable (level 0, unlocked) or owned (levelling). The verb, cost and
    // pips all change as it levels, so they're left empty here and filled IN PLACE
    // by the per-frame control below — a routine level-up therefore never rebuilds
    // the panel (so images/dots/text don't reflash).
    const cls0 = `obj-row buyable${justUnlocked ? ' just-unlocked' : ''}`;
    $row = $(
      `<div class="${cls0}">${img}` +
        (justUnlocked ? `<span class="lock-icon unlocking">${LOCK_SVG}</span>` : '') +
        `<div class="info"><div class="name">${name}</div>` +
        `<div class="lvl"></div></div>` +
        `<button class="buy"><span class="verb"></span><br><span class="cost">${COIN_SM}<span class="cost-n"></span></span></button></div>`
    ).appendTo($list);

    if (justUnlocked) {
      // One-shot reveal: once the unlock sequence has played, strip the anim
      // state and the lock overlay so re-showing the panel (switching tabs and
      // back restarts CSS animations on display:none->block) can't replay it.
      // Leaves a clean buyable row; safe no-op if a rebuild detaches it first.
      const row = $row[0];
      setTimeout(() => {
        row.classList.remove('just-unlocked');
        row.querySelector('.lock-icon')?.remove();
      }, 1300); // covers the full lock -> art-reveal -> buy-in sequence
    }

    const $btn = $row.find('button');
    const $verb = $btn.find('.verb');
    const $cost = $btn.find('.cost-n');
    const $lvl = $row.find('.lvl');
    $btn.on('click', () => {
      if (buyObject(idx)) squash($btn[0]);
    });
    // Per-frame, all diffed (steady frames write nothing): verb (BUY/Upgrade),
    // cost, pip fill and affordability — recomputed from the live level so an
    // upgrade updates this one row without a panel rebuild.
    objControls.push(() => {
      const l = state.objects[idx];
      const buyable = l === 0;
      const c = buyable ? P.objectUnlockCost(t, idx) : P.objectUpgradeCost(t, idx, l);
      tx($verb, buyable ? 'BUY' : 'Upgrade');
      tx($cost, fmt(c));
      htm($lvl, buyable ? '<span class="muted-sub">Unlock this relic</span>' : pips(l, objMax));
      setBuyDisabled($btn, state.coins < c);
    });
  });

  nextTierButton(
    $set,
    {
      maxedTier: () => state.objectTier >= P.TIER_COUNT - 1,
      ready: objectTierMaxed,
      cost: () => P.objectNextTierCost(state.objectTier),
      nextName: () => TIERS[state.objectTier + 1].name,
      buy: buyObjectNextTier,
    },
    objControls
  );
}

// --------------------------- Collection modal ------------------------------
// A scrollable catalogue of every relic unlocked so far, grouped by colour tier,
// each card stamped with the passive coins/sec at the moment it was unlocked
// (recorded in state.collection). Built fresh each open from the live log.
function showCollection() {
  $('#collection-modal').remove(); // never stack two

  const byTier = new Map();
  for (const e of state.collection) {
    if (!byTier.has(e.tier)) byTier.set(e.tier, []);
    byTier.get(e.tier).push(e);
  }
  const tiers = [...byTier.keys()].sort((a, b) => a - b);

  let body = '';
  if (!tiers.length) {
    body = '<p class="cm-empty">No relics catalogued yet.</p>';
  } else {
    for (const tier of tiers) {
      const items = byTier.get(tier).slice().sort((a, b) => a.idx - b.idx);
      body +=
        `<h3 class="cm-head">${objectSetName(tier)}` +
        `<span class="badge">tier ${tier + 1}/${P.TIER_COUNT}</span></h3><div class="cm-grid">`;
      for (const e of items) {
        const rate = e.cps > 0 ? `${fmt(e.cps)}/s` : '—';
        body +=
          `<div class="cm-card">` +
          `<img class="obj-img" src="${objectImageUrl(e.tier, e.idx)}" alt="${objectItemName(e.tier, e.idx)}" />` +
          `<div class="cm-name">${objectItemName(e.tier, e.idx)}</div>` +
          `<div class="cm-cps">unlocked at <b>${rate}</b></div></div>`;
      }
      body += '</div>';
    }
  }

  const $modal = $(
    `<div id="collection-modal" class="modal-backdrop">` +
      `<div class="modal collection-modal">` +
      `<h2>Relic Collection</h2>` +
      `<div class="cm-scroll">${body}</div>` +
      `<button class="collect close">Close</button>` +
      `</div></div>`
  ).appendTo('body');

  const close = () => $modal.remove();
  $modal.find('.close').on('click', close);
  $modal.on('click', (e) => {
    if (e.target === $modal[0]) close();
  });
}

// --------------------------- Tier-up banner --------------------------------
// A short "TIER UP → <Colour> Laser" banner that sweeps across the lab on a laser
// tier crossing, themed to the new colour. Driven by scene.onLaserTierUp (wired in
// main.js); the CSS animation plays once and we remove the node after it ends.
export function showTierBanner(name, color) {
  const lab = document.getElementById('lab');
  if (!lab) return;
  const old = document.getElementById('tier-banner');
  if (old) old.remove();
  const b = document.createElement('div');
  b.id = 'tier-banner';
  b.style.setProperty('--tb-color', color);
  b.innerHTML = `<span class="tb-kicker">TIER UP</span><span class="tb-name">${name} Laser</span>`;
  lab.appendChild(b);
  setTimeout(() => b.remove(), 2200);
}

// Mobile bottom-sheet controls (used by both initUI's wiring and the tutorial, so
// the tutorial can open the sheet when its target lives inside it).
function bottomSheetLayout() {
  const b = document.getElementById('open-upgrades');
  return !!b && getComputedStyle(b).display !== 'none'; // visible only in the mobile layout
}
function openSheet() {
  $('#upgrades').addClass('open');
  $('#sheet-backdrop').addClass('show');
}
function closeSheet() {
  $('#upgrades').removeClass('open');
  $('#sheet-backdrop').removeClass('show');
}

// --------------------------- First-run onboarding --------------------------
// A single badge walks a brand-new player through the core loop. It's a fixed,
// document-level element that floats over the lab (centred, pulsing), or flies to
// a button and sits beside/above it. It tracks its target across tab switches and
// resizes, and hides when the target isn't on screen (e.g. its tab is closed or
// the mobile sheet is shut) so it never strands in a corner. Steps live in
// state.tutorialStep (persisted). DONE is the highest value but the others are NOT
// strictly ordered (OPENUP is mobile-only and inserted via explicit transitions),
// so all checks use === / !== TUT.DONE, never < / >=.
const TUT = { TAP: 0, BUYCLICK: 1, RELICS: 2, DONE: 3, OPENUP: 4 };

// Inline tap/hand icon (no emoji). Inherits the badge's text colour via
// currentColor. The leading transparent rect is the icon's full 16×16 bounding
// box (keeps it from being cropped to the visible path's bbox).
const TAP_ICON =
  '<svg viewBox="0 0 16 16">' +
  '<path d="M0 0h16v16H0z" fill="none"/>' +
  '<path fill="currentColor" d="M4.75 6.25a1.06 1.06 0 0 1 1.5 0l1.867 1.867l3.309-1.378a1 1 0 0 1 1.043.171l1.923 1.682a2 2 0 0 1 .096 2.92L12.44 13.56a1.5 1.5 0 0 1-.43.298a1 1 0 0 1-.51.142H8a1 1 0 1 1 0-2h1L4.75 7.75a1.06 1.06 0 0 1 0-1.5M2 6a1 1 0 0 1 0 2H1a1 1 0 0 1 0-2zm-.707-3.707a1 1 0 0 1 1.414 0l1 1a1 1 0 1 1-1.414 1.414l-1-1a1 1 0 0 1 0-1.414M6 1a1 1 0 0 1 1 1v1a1 1 0 0 1-2 0V2a1 1 0 0 1 1-1"/>' +
  '</svg>';

function tutBadge() {
  if (!$tutBadge) {
    $tutBadge = $(
      `<div id="tut-badge" hidden><span class="tb-ic">${TAP_ICON}</span><span class="tb-txt"></span></div>`
    ).appendTo('body');
  }
  return $tutBadge;
}

function rectOf(sel) {
  const el = document.querySelector(sel);
  return el ? el.getBoundingClientRect() : null;
}

function tutAdvance(step) {
  state.tutorialStep = step;
  saveGame();
  // Make sure the next pointer's target is on screen: open the right tab, and on
  // mobile open the bottom sheet (the upgrades live inside it).
  if (step === TUT.BUYCLICK) {
    showTab('laser');
    if (bottomSheetLayout()) openSheet();
  } else if (step === TUT.RELICS) {
    showTab('objects');
    if (bottomSheetLayout()) openSheet();
  }
  updateTutorial();
  // Re-place once the sheet's slide-up / panel swap has settled (its target's
  // final on-screen rect isn't known until the transform transition finishes).
  setTimeout(() => {
    if (state.tutorialStep !== TUT.DONE) updateTutorial();
  }, 340);
}

function tutComplete() {
  if (state.tutorialStep === TUT.DONE) return;
  state.tutorialStep = TUT.DONE;
  saveGame();
  if ($tutBadge) $tutBadge.attr('hidden', '');
}

// Called when the mobile sheet is opened — advances past the "OPEN UPGRADES" step.
export function tutOnSheetOpen() {
  if (state.tutorialStep === TUT.OPENUP) tutAdvance(TUT.BUYCLICK);
}

// First object destroyed -> a brief "GOOD JOB!", then point at the next action:
// on mobile that's the "Upgrades" bar (the menu is hidden in a sheet); on desktop
// the upgrades are already visible, so go straight to the click upgrade.
export function tutOnShatter() {
  if (state.tutorialStep !== TUT.TAP) return;
  tutGoodJobUntil = Date.now() + 1600;
  updateTutorial();
  setTimeout(() => {
    if (state.tutorialStep !== TUT.TAP) return;
    tutAdvance(bottomSheetLayout() ? TUT.OPENUP : TUT.BUYCLICK);
  }, 1600);
}

// Reposition + retext the badge for the current step. Called every refresh, on
// resize and on tab switches. A null/zero-size target (its tab is closed) hides
// the badge rather than parking it at the top-left corner.
function updateTutorial() {
  const step = state.tutorialStep;
  const $b = tutBadge();
  if (step === TUT.DONE) {
    $b.attr('hidden', '');
    return;
  }

  const goodjob = Date.now() < tutGoodJobUntil;
  const centred = goodjob || step === TUT.TAP;

  // Text + target + placement per step. 'centred' floats over the lab; 'above'
  // sits above a wide/low target (the Upgrades bar, the next-tier button); 'left'
  // sits to the LEFT of a button (the click upgrade is narrow and far right, so
  // above-centred overflowed the screen edge).
  let txt;
  let rect;
  let mode;
  if (goodjob) {
    txt = 'GOOD JOB!';
    rect = rectOf('#lab');
    mode = 'centred';
  } else if (step === TUT.TAP) {
    txt = 'TAP TO GET COINS';
    rect = rectOf('#lab');
    mode = 'centred';
  } else if (step === TUT.OPENUP) {
    txt = 'OPEN UPGRADES';
    rect = rectOf('#open-upgrades');
    mode = 'above';
  } else if (step === TUT.BUYCLICK) {
    txt = 'BUY TO DESTROY FASTER';
    rect = rectOf('#panel-laser .row:first-child button.buy');
    mode = 'left';
  } else {
    txt = 'UNLOCK ALL RELICS TO ACCESS NEXT TIER';
    rect = rectOf('#panel-objects button.next-tier');
    mode = 'above';
  }

  const txtEl = $b[0].querySelector('.tb-txt');
  if (txtEl && txtEl.textContent !== txt) txtEl.textContent = txt;

  if (!rect || rect.width === 0) {
    $b.attr('hidden', '');
    return;
  }

  $b.removeAttr('hidden');
  cls($b, 'pulsing', mode === 'centred'); // rapid green pulse only over the lab
  cls($b, 'at-above', mode === 'above');
  cls($b, 'at-left', mode === 'left');

  const n = $b[0];
  if (mode === 'centred') {
    n.style.left = `${rect.left + rect.width / 2}px`;
    n.style.top = `${rect.top + rect.height * 0.6}px`;
  } else if (mode === 'above') {
    n.style.left = `${rect.left + rect.width / 2}px`;
    n.style.top = `${rect.top - 12}px`;
  } else {
    // Left of the button, vertically centred. The badge's right edge anchors at
    // `left` (translate(-100%)); clamp so the whole badge stays on-screen.
    const w = n.offsetWidth;
    let anchor = rect.left - 12;
    if (anchor - w < 8) anchor = 8 + w;
    n.style.left = `${anchor}px`;
    n.style.top = `${rect.top + rect.height / 2}px`;
  }
}

// ----------------------------- wiring --------------------------------------
// The full panel refresh (structure + every row's affordability) is relatively
// expensive — it walks every upgrade row via jQuery. State can change many times
// per frame (each shard the vacuum collects credits coins -> notify), so instead
// of re-rendering per coin we coalesce every notification into at most ONE
// refresh per animation frame. The coin counter rides along on that same tick,
// which is plenty smooth for a counter.
let $coins = null; //         cached so we don't re-query #coins each refresh
let $upgBadge = null; //      mobile "Upgrades" button's available-count badge
let $cps = null; //           live "coins/sec" headline next to the wallet
let $wallet = null; //        wallet card (bumped/glowed on gains & new affordability)
let $laserHead = null; //     laser tier header (DPS readout pulsed on a beam upgrade)
let refreshQueued = false;

// Coin count-up: the displayed balance lerps toward the true `state.coins` every
// animation frame (set up in initUI) so payouts roll up instead of snapping.
let coinsShown = 0;
let coinsText = '';
let prevCoins = 0; //   last seen true balance (for the +N payout floater)
const $tabBtns = {}; //  tab buttons by name, for the per-tab affordable dots

// First-run onboarding: a single badge that walks the player through the loop.
let $tutBadge = null;
let tutGoodJobUntil = 0; //    while Date.now() < this, the badge shows "GOOD JOB!"
let tutPrevClickLevel = 0; //  to detect the click upgrade that advances step 1 -> 2
let tutPrevObjSum = 0; //      total relic levels; a rise = a relic buy/upgrade (ends step 2)

const objLevelSum = () => state.objects.reduce((a, b) => a + b, 0);

function refresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(runRefresh);
}

function runRefresh() {
  refreshQueued = false;
  if (objectsStructureChanged()) {
    // Detect which relics JUST transitioned, by diffing the PRE-rebuild snapshot
    // (objSigTier/objSigLevels still hold last build's values) against live state
    // BEFORE we overwrite it. Only animate within the same tier and after a real
    // prior build — so initial load and tier-ups (objects reset to [1,0,0,0,0])
    // never fire spurious animations.
    const prevTier = objSigTier;
    const prevLevels = objSigLevels;
    const objMax = P.objectMaxLevel(state.objectTier);
    const n = state.objects.length;
    const animUnlock = new Array(n).fill(false);
    const animMaxed = new Array(n).fill(false);
    if (prevTier !== -1 && prevTier === state.objectTier && prevLevels.length === n) {
      for (let i = 0; i < n; i++) {
        if (prevLevels[i] < objMax && state.objects[i] >= objMax) animMaxed[i] = true;
        if (i > 0 && state.objects[i] === 0 &&
            prevLevels[i - 1] < objMax && state.objects[i - 1] >= objMax) animUnlock[i] = true;
      }
    }
    objSigTier = state.objectTier;
    objSigLevels = state.objects.slice(); // raw levels, for next rebuild's anim diff
    objSigCats = state.objects.map((_, i) => objCategory(i)); // categories that gate rebuilds
    rebuildObjects(animUnlock, animMaxed);
  }
  staticControls.forEach((fn) => fn());
  objControls.forEach((fn) => fn());

  // Affordable-buy counts. The controls above just left every affordable buy /
  // next-tier button enabled (maxed and unaffordable ones disabled), so the count
  // is simply the enabled buttons inside each panel. Per-panel so the tab buttons
  // can show their own dot; summed for the mobile "Upgrades" total badge.
  const countIn = (sel) => document.querySelectorAll(`${sel} button:not(:disabled)`).length;
  const cLaser = countIn('#panel-laser');
  const cCoins = countIn('#panel-coins');
  const cObjects = countIn('#panel-objects');
  const avail = cLaser + cCoins + cObjects;
  tx($upgBadge, String(avail));
  cls($upgBadge, 'shown', avail > 0);
  // Desktop attention: a green dot on each tab that has something buyable.
  if ($tabBtns.laser) cls($tabBtns.laser, 'has-afford', cLaser > 0);
  if ($tabBtns.coins) cls($tabBtns.coins, 'has-afford', cCoins > 0);
  if ($tabBtns.objects) cls($tabBtns.objects, 'has-afford', cObjects > 0);

  // Wallet payout floater: a notable jump (offline reward, big cash-in) launches a
  // gold "+N" off the wallet. The steady shard trickle never trips the threshold,
  // so it stays quiet during normal play. (No card glow/scale-bump — that read as a
  // distracting orange blink and risked a scrollbar from the scale.)
  const delta = state.coins - prevCoins;
  if (delta > 0 && delta >= 20 && delta >= prevCoins * 0.25) {
    domFloat($wallet && $wallet[0], `+${fmt(delta)}`, '#ffd45e');
  }
  prevCoins = state.coins;

  // Live "coins/sec" headline — a calm secondary stat (hidden until income > 0).
  const rate = P.passiveCoinsPerSecond(state);
  if (rate > 0) {
    htm($cps, `${fmt(rate)}${COIN_SM}/s`);
    if ($cps && $cps[0]) $cps[0].removeAttribute('hidden');
  } else if ($cps && $cps[0]) {
    $cps[0].setAttribute('hidden', '');
  }

  // First-run tutorial: advance on the actions it asks for, then reposition the
  // badge. Skipped entirely for everyone who's finished it (the common case).
  if (state.tutorialStep !== TUT.DONE) {
    if (state.tutorialStep === TUT.BUYCLICK && state.clickLevel > tutPrevClickLevel) tutAdvance(TUT.RELICS);
    else if (state.tutorialStep === TUT.RELICS && objLevelSum() > tutPrevObjSum) tutComplete();
    else updateTutorial();
  }
  tutPrevClickLevel = state.clickLevel;
  tutPrevObjSum = objLevelSum();
}

function showTab(name) {
  $('#tabs button').removeClass('active').filter(`[data-tab="${name}"]`).addClass('active');
  $('.panel').removeClass('active');
  $(`#panel-${name}`).addClass('active');
  // The tutorial badge tracks a button in a specific tab — re-evaluate so it
  // shows/hides and repositions when the visible panel changes.
  if (state.tutorialStep !== TUT.DONE) updateTutorial();
}

// ------------------------- Offline reward modal ----------------------------
// Informational pop-up shown on boot when the player earned coins while away.
// The coins are already credited by the time this is called; clicking Collect
// just dismisses it.
export function showOfflineReward({ coins, seconds, capped }) {
  $('#offline-modal').remove(); // never stack two
  const $modal = $(`
    <div id="offline-modal" class="modal-backdrop">
      <div class="modal">
        <h2>Welcome back!</h2>
        <p>You were away for <b>${fmtDuration(seconds)}</b>${capped ? ' <small>(we count up to 24h away)</small>' : ''}.</p>
        <p class="sub">Your laser ran at full power and banked:</p>
        <div class="reward">+${fmt(coins)} <span>coins</span></div>
        <button class="collect">Collect</button>
      </div>
    </div>`).appendTo('body');

  const close = () => $modal.remove();
  $modal.find('.collect').on('click', close);
  // Click the dark backdrop (but not the card) to dismiss too.
  $modal.on('click', (e) => {
    if (e.target === $modal[0]) close();
  });
}

// Continuous coin count-up: every animation frame, ease the displayed balance
// toward the true one and write the text only when its formatted form changes.
// Runs for the life of the page (independent of the event-driven panel refresh)
// so payouts roll up smoothly instead of snapping.
function startCoinLoop() {
  const step = () => {
    const target = state.coins;
    const diff = target - coinsShown;
    if (Math.abs(diff) < 1) coinsShown = target;
    else coinsShown += diff * 0.16;
    const txt = fmtCoins(coinsShown);
    if (txt !== coinsText) {
      coinsText = txt;
      if ($coins && $coins[0]) $coins[0].textContent = txt;
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function initUI() {
  $coins = $('#coins');
  $cps = $('#cps');
  $wallet = $('#wallet-card');
  $upgBadge = $('#upg-badge');
  buildLaser();
  buildCoins();

  // Per-tab affordable dots: add a dot node to each tab button and cache the
  // button so runRefresh can toggle it.
  $('#tabs button').each(function () {
    if (!this.querySelector('.tab-dot')) {
      const dot = document.createElement('span');
      dot.className = 'tab-dot';
      this.appendChild(dot);
    }
    $tabBtns[this.dataset.tab] = $(this);
  });
  $('#tabs button').on('click', function () {
    showTab($(this).data('tab'));
  });

  // Mobile bottom-sheet: the "Upgrades" bar slides the menu up; the grab-handle
  // or a tap on the dimming backdrop slides it back down. (On desktop these
  // elements are display:none and the sheet styling never applies.) openSheet/
  // closeSheet are module-level so the tutorial can drive the sheet too.
  $('#open-upgrades').on('click', () => {
    openSheet();
    tutOnSheetOpen(); // advances the mobile "OPEN UPGRADES" onboarding step
  });
  $('#sheet-handle, #sheet-backdrop').on('click', closeSheet);

  // First-run tutorial: seed the progression baselines and keep the badge pinned
  // to its target as the viewport changes. Shown only to genuinely new players
  // (tutorialStep is persisted; legacy/returning saves load as done).
  tutPrevClickLevel = state.clickLevel;
  tutPrevObjSum = objLevelSum();
  window.addEventListener('resize', () => {
    if (state.tutorialStep !== TUT.DONE) updateTutorial();
  });

  // Seed the coin display so the first paint shows the real balance, then start
  // the count-up loop (subsequent gains roll up).
  coinsShown = state.coins;
  coinsText = fmtCoins(state.coins);
  if ($coins[0]) $coins[0].textContent = coinsText;
  prevCoins = state.coins;
  startCoinLoop();

  onChange(refresh);
  runRefresh(); // initial synchronous paint (don't wait a frame for first render)
  showTab('laser');
}
