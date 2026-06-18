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

function rebuildObjects() {
  const panel = $('#panel-objects').empty();
  objControls = [];
  const t = state.objectTier;

  const $set = $('<div class="tier current"></div>').appendTo(panel);
  $set.append(
    `<h3>${objectSetName(t)} <span class="badge">tier ${t + 1}/${P.TIER_COUNT}</span></h3>`
  );
  const $list = $('<div class="objlist"></div>').appendTo($set);

  SHAPES.forEach((shape, idx) => {
    // One row per object: its real art (a black silhouette while locked), the
    // item name + level/durability, and the unlock/upgrade button. While locked
    // (not yet bought) the item is a mystery: its name reads "Unknown" and the
    // art is a black silhouette. Once an item is maxed the button is replaced by
    // a blue (theme) checkmark.
    const locked = state.objects[idx] === 0;
    const displayName = locked ? 'Unknown' : objectItemName(t, idx);
    const $row = $(`
      <div class="obj-row">
        <img class="obj-img" src="${objectImageUrl(t, idx)}" alt="${displayName}" />
        <div class="info">
          <div class="name">${displayName}</div>
          <div class="lvl"></div>
        </div>
        <button class="buy"></button>
        <span class="obj-check" title="Maxed out">✓</span>
      </div>`).appendTo($list);

    // Cache the row's dynamic handles once — the per-frame refresh below must not
    // re-run jQuery's .find() traversal on every tick.
    const $btn = $row.find('button');
    const $lvl = $row.find('.lvl');
    $btn.on('click', () => buyObject(idx));

    objControls.push(() => {
      const lvl = state.objects[idx];
      const unlocked = objectUnlocked(idx);
      // Locked objects (not yet bought) render as a black silhouette of the art.
      cls($row, 'locked', lvl === 0);
      // A maxed item shows the checkmark in place of the (now useless) button.
      const objMax = P.objectMaxLevel(t);
      const maxed = lvl >= objMax;
      cls($row, 'maxed', maxed);
      vis($btn, !maxed);

      if (maxed) {
        tx($lvl, `Lv ${lvl}/${objMax} · Maxed`);
      } else if (lvl === 0 && !unlocked) {
        // Gated: the previous item isn't maxed yet. Say so, instead of showing a
        // buyable-looking Unlock+cost the player can't actually use.
        tx($lvl, 'Locked');
        htm($btn, 'Max out the<br>previous item'); dis($btn, true);
      } else if (lvl === 0) {
        const cost = P.objectUnlockCost(t, idx);
        tx($lvl, 'Locked');
        htm($btn, `Unlock<br><span class="cost">${fmt(cost)}</span>`);
        dis($btn, state.coins < cost);
      } else {
        const cost = P.objectUpgradeCost(t, idx, lvl);
        tx($lvl, `Lv ${lvl}/${objMax} · ${fmt(P.objectDurability(t, idx, lvl))} durability`);
        htm($btn, `Upgrade<br><span class="cost">${fmt(cost)}</span>`);
        dis($btn, state.coins < cost);
      }
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

// ----------------------------- wiring --------------------------------------
// The full panel refresh (structure + every row's affordability) is relatively
// expensive — it walks every upgrade row via jQuery. State can change many times
// per frame (each shard the vacuum collects credits coins -> notify), so instead
// of re-rendering per coin we coalesce every notification into at most ONE
// refresh per animation frame. The coin counter rides along on that same tick,
// which is plenty smooth for a counter.
let $coins = null; //         cached so we don't re-query #coins each refresh
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
    objSigTier = state.objectTier;
    objSigLevels = state.objects.slice(); // snapshot only on actual change (rare)
    rebuildObjects();
  }
  staticControls.forEach((fn) => fn());
  objControls.forEach((fn) => fn());
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
  buildLaser();
  buildCoins();
  $('#tabs button').on('click', function () {
    showTab($(this).data('tab'));
  });
  onChange(refresh);
  runRefresh(); // initial synchronous paint (don't wait a frame for first render)
  showTab('laser');
}
