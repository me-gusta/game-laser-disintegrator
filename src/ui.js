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

const staticControls = []; // refresh() callbacks for the fixed laser/shards rows
let objControls = []; //      refresh() callbacks for the (rebuilt) objects panel
let objSig = null; //         structural signature of the objects panel

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
      $btn.html('Tier maxed').prop('disabled', true);
    } else if (!build.ready()) {
      $btn.html('NEXT TIER<br><small>Max every stat to unlock</small>').prop('disabled', true);
    } else {
      const cost = build.cost();
      $btn.html(`NEXT TIER → ${build.nextName()}<br><span class="cost">${fmt(cost)}</span>`);
      $btn.prop('disabled', state.coins < cost);
    }
  });
}

// ----------------------------- Laser tab -----------------------------------
function laserStatRow(panel, { label, key, cost, buy, help }) {
  upgradeRow(panel, {
    buy,
    refresh(els) {
      const lvl = state[key];
      els.name.text(`${label} · Lv ${lvl}/${P.MAX_LEVEL}`);
      els.sub.text(help);
      if (lvl >= P.MAX_LEVEL) {
        els.btn.html('Maxed').prop('disabled', true);
      } else {
        const c = cost(state.laserTier, lvl);
        els.btn.html(`Upgrade<br><span class="cost">${fmt(c)}</span>`);
        els.btn.prop('disabled', state.coins < c);
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
      els.name.text(`Click Power · Lv ${lvl}`);
      els.sub.html(`<span class="val">${fmt(P.clickDamage(lvl, state.objectTier))}</span> damage per click`);
      const cost = P.clickCost(lvl);
      els.btn.html(`Upgrade<br><span class="cost">${fmt(cost)}</span>`);
      els.btn.prop('disabled', state.coins < cost);
    },
  });

  const $head = $('<div class="tier-head"></div>').appendTo(panel);
  staticControls.push(() => {
    const dps = P.laserDps(state.laserTier, state.laserPower, state.laserThickness, state.laserBeams);
    $head.html(
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
      els.name.text(`Shard Value · Lv ${lvl}`);
      els.sub.html(`<span class="val">${fmt(P.shardValue(lvl))}×</span> coins per shard`);
      const cost = P.shardCost(lvl);
      els.btn.html(`Upgrade<br><span class="cost">${fmt(cost)}</span>`);
      els.btn.prop('disabled', state.coins < cost);
    },
  });

  upgradeRow(panel, {
    buy: buyVacuum,
    refresh(els) {
      const tier = state.vacuumTier;
      const maxed = tier >= P.BASE.vacuumTiers - 1;
      const cleaners = P.vacuumCleaners(tier).length;
      els.name.text(`Vacuum · Lv ${tier + 1}/${P.BASE.vacuumTiers}`);
      els.sub.html(
        `<span class="val">${P.vacuumTotalRate(tier).toFixed(1)}</span> shards/sec · ` +
          `${cleaners} cleaner${cleaners > 1 ? 's' : ''}`
      );
      if (maxed) {
        els.btn.html('Maxed').prop('disabled', true);
      } else {
        const cost = P.vacuumCost(tier);
        els.btn.html(`Upgrade<br><span class="cost">${fmt(cost)}</span>`);
        els.btn.prop('disabled', state.coins < cost);
      }
    },
  });
}

// ----------------------------- Objects tab ---------------------------------
// Only one set of shapes is shown, at the current colour tier. Rebuilt when the
// tier or any level changes; affordability refreshed cheaply every change.
function objectsSignature() {
  return state.objectTier + ':' + state.objects.join(',');
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

    $row.find('button').on('click', () => buyObject(idx));

    objControls.push(() => {
      const lvl = state.objects[idx];
      const unlocked = objectUnlocked(idx);
      const $lvl = $row.find('.lvl');
      const $btn = $row.find('button');
      // Locked objects (not yet bought) render as a black silhouette of the art.
      $row.toggleClass('locked', lvl === 0);
      // A maxed item shows the checkmark in place of the (now useless) button.
      const objMax = P.objectMaxLevel(t);
      const maxed = lvl >= objMax;
      $row.toggleClass('maxed', maxed);
      $btn.toggle(!maxed);

      if (maxed) {
        $lvl.text(`Lv ${lvl}/${objMax} · Maxed`);
      } else if (lvl === 0 && !unlocked) {
        // Gated: the previous item isn't maxed yet. Say so, instead of showing a
        // buyable-looking Unlock+cost the player can't actually use.
        $lvl.text('Locked');
        $btn.html('Max out the<br>previous item').prop('disabled', true);
      } else if (lvl === 0) {
        const cost = P.objectUnlockCost(t, idx);
        $lvl.text('Locked');
        $btn.html(`Unlock<br><span class="cost">${fmt(cost)}</span>`);
        $btn.prop('disabled', state.coins < cost);
      } else {
        const cost = P.objectUpgradeCost(t, idx, lvl);
        $lvl.html(`Lv ${lvl}/${objMax} · ${fmt(P.objectDurability(t, idx, lvl))} durability`);
        $btn.html(`Upgrade<br><span class="cost">${fmt(cost)}</span>`);
        $btn.prop('disabled', state.coins < cost);
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
function refresh() {
  $('#coins').text(fmtCoins(state.coins));
  const sig = objectsSignature();
  if (sig !== objSig) {
    objSig = sig;
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
  buildLaser();
  buildCoins();
  $('#tabs button').on('click', function () {
    showTab($(this).data('tab'));
  });
  onChange(refresh);
  refresh();
  showTab('laser');
}
