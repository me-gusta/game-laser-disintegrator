// ui.js
// All HTML UI is built and driven here with jQuery. It reads progression for
// labels/costs and calls the buy actions on state; state.onChange re-renders.
import $ from 'jquery';
import * as P from './progression.js';
import { fmt, fmtCoins, fmtDuration } from './format.js';
import { objectImageUrl, objectSetName, objectItemName } from './lab/assets.js';
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

const staticControls = []; // refresh() callbacks for the fixed laser/shards rows
let objControls = []; //      refresh() callbacks for the (rebuilt) objects panel
// Structural state the objects panel was last built for. Compared field-by-field
// each refresh (see objectsStructureChanged) instead of building+comparing a
// joined signature string every frame, so the steady-state check allocates
// nothing. -1 / [] force the first build.
let objSigTier = -1;
let objSigLevels = [];

// Build a generic upgrade row. spec.refresh(els) updates dynamic text/disabled.
function upgradeRow(panel, build) {
  const $row = $(`
    <div class="row">
      <div class="info">
        <div class="name"></div>
        <div class="sub"></div>
      </div>
      <button class="buy"></button>
    </div>`).appendTo(panel);

  const els = { name: $row.find('.name'), sub: $row.find('.sub'), btn: $row.find('.buy') };
  els.btn.on('click', () => build.buy());
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
      htm($btn, `NEXT TIER → ${build.nextName()}<br><span class="cost">${fmt(cost)}</span>`);
      dis($btn, state.coins < cost);
    }
  });
}

// ----------------------------- Laser tab -----------------------------------
function laserStatRow(panel, { label, key, cost, buy, help }) {
  upgradeRow(panel, {
    buy,
    refresh(els) {
      const lvl = state[key];
      tx(els.name, `${label} · Lv ${lvl}/${P.MAX_LEVEL}`);
      tx(els.sub, help);
      if (lvl >= P.MAX_LEVEL) {
        htm(els.btn, 'Maxed'); dis(els.btn, true);
      } else {
        const c = cost(state.laserTier, lvl);
        htm(els.btn, `Upgrade<br><span class="cost">${fmt(c)}</span>`);
        dis(els.btn, state.coins < c);
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
      htm(els.btn, `Upgrade<br><span class="cost">${fmt(cost)}</span>`);
      dis(els.btn, state.coins < cost);
    },
  });

  const $head = $('<div class="tier-head"></div>').appendTo(panel);
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

  upgradeRow(panel, {
    buy: buyShard,
    refresh(els) {
      const lvl = state.shardLevel;
      tx(els.name, `Shard Value · Lv ${lvl}`);
      htm(els.sub, `<span class="val">${fmt(P.shardValue(lvl))}×</span> coins per shard`);
      const cost = P.shardCost(lvl);
      htm(els.btn, `Upgrade<br><span class="cost">${fmt(cost)}</span>`);
      dis(els.btn, state.coins < cost);
    },
  });

  upgradeRow(panel, {
    buy: buyVacuum,
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
        htm(els.btn, `Upgrade<br><span class="cost">${fmt(cost)}</span>`);
        dis(els.btn, state.coins < cost);
      }
    },
  });
}

// ----------------------------- Objects tab ---------------------------------
// Only one set of shapes is shown, at the current colour tier. Rebuilt when the
// tier or any level changes (a level 0->1 unlock reveals the item's name/art,
// which is baked in at build time); affordability refreshed cheaply every change.
// Allocation-free: compares the live tier/levels against the snapshot taken at
// the last rebuild rather than materialising a signature string.
function objectsStructureChanged() {
  if (state.objectTier !== objSigTier) return true;
  const o = state.objects;
  if (o.length !== objSigLevels.length) return true;
  for (let i = 0; i < o.length; i++) {
    if (o[i] !== objSigLevels[i]) return true;
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
      return; // maxed rows have no button
    }

    // Buyable (level 0, unlocked) or owned (levelling). Both have a live button
    // whose disabled state tracks coins every frame.
    const cost = isBuyable ? P.objectUnlockCost(t, idx) : P.objectUpgradeCost(t, idx, lvl);
    const verb = isBuyable ? 'BUY' : 'Upgrade';
    const sub = isBuyable
      ? '<span class="muted-sub">Unlock this relic</span>'
      : pips(lvl, objMax);
    // A just-unlocked relic is built buyable but plays the lock shake -> unlock ->
    // BUY-button-appears sequence (lock overlay self-removes via the keyframe).
    const cls0 = `obj-row buyable${justUnlocked ? ' just-unlocked' : ''}`;
    $row = $(
      `<div class="${cls0}">${img}` +
        (justUnlocked ? `<span class="lock-icon unlocking">${LOCK_SVG}</span>` : '') +
        `<div class="info"><div class="name">${name}</div>` +
        `<div class="lvl">${sub}</div></div>` +
        `<button class="buy">${verb}<br><span class="cost">${fmt(cost)}</span></button></div>`
    ).appendTo($list);

    const $btn = $row.find('button');
    $btn.on('click', () => buyObject(idx));
    // Steady-state per-frame work: just the affordability toggle (diffed-write).
    objControls.push(() => dis($btn, state.coins < cost));
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

// ----------------------------- wiring --------------------------------------
// The full panel refresh (structure + every row's affordability) is relatively
// expensive — it walks every upgrade row via jQuery. State can change many times
// per frame (each shard the vacuum collects credits coins -> notify), so instead
// of re-rendering per coin we coalesce every notification into at most ONE
// refresh per animation frame. The coin counter rides along on that same tick,
// which is plenty smooth for a counter.
let $coins = null; //         cached so we don't re-query #coins each refresh
let $upgBadge = null; //      mobile "Upgrades" button's available-count badge
let refreshQueued = false;

function refresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(runRefresh);
}

function runRefresh() {
  refreshQueued = false;
  tx($coins, fmtCoins(state.coins));
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
    objSigLevels = state.objects.slice(); // snapshot only on actual change (rare)
    rebuildObjects(animUnlock, animMaxed);
  }
  staticControls.forEach((fn) => fn());
  objControls.forEach((fn) => fn());

  // Mobile "Upgrades" badge: how many upgrades are actionable right now. The
  // controls above just left every affordable buy / next-tier button enabled
  // (maxed and unaffordable ones disabled), so the count is simply the enabled
  // buttons inside the panels — tab buttons live in #tabs, outside .panel.
  const avail = document.querySelectorAll('.panel button:not(:disabled)').length;
  tx($upgBadge, String(avail));
  cls($upgBadge, 'shown', avail > 0);
}

function showTab(name) {
  $('#tabs button').removeClass('active').filter(`[data-tab="${name}"]`).addClass('active');
  $('.panel').removeClass('active');
  $(`#panel-${name}`).addClass('active');
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

export function initUI() {
  $coins = $('#coins');
  $upgBadge = $('#upg-badge');
  buildLaser();
  buildCoins();
  $('#tabs button').on('click', function () {
    showTab($(this).data('tab'));
  });

  // Mobile bottom-sheet: the "Upgrades" bar slides the menu up; the grab-handle
  // or a tap on the dimming backdrop slides it back down. (On desktop these
  // elements are display:none and the sheet styling never applies.)
  const $sheet = $('#upgrades');
  const $backdrop = $('#sheet-backdrop');
  const closeSheet = () => {
    $sheet.removeClass('open');
    $backdrop.removeClass('show');
  };
  $('#open-upgrades').on('click', () => {
    $sheet.addClass('open');
    $backdrop.addClass('show');
  });
  $('#sheet-handle, #sheet-backdrop').on('click', closeSheet);

  onChange(refresh);
  runRefresh(); // initial synchronous paint (don't wait a frame for first render)
  showTab('laser');
}
