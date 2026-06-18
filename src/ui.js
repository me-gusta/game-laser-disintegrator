// ui.js
// All HTML UI is built and driven here with jQuery. It reads progression for
// labels/costs and calls the buy actions on state; state.onChange re-renders.
import $ from 'jquery';
import * as P from './progression.js';
import { fmt, fmtDuration } from './format.js';
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

const GLYPHS = { circle: '●', rectangle: '▮', triangle: '▲', pentagon: '⬠', hexagon: '⬡' };
// Player-facing description of each beam level (replaces the internal X/x layout
// notation): index 0..4 == beam level 1..5.
const BEAM_DESC = ['1 beam', '3 beams (2 narrow)', '3 beams', '5 beams (2 narrow)', '5 beams'];
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
function laserStatRow(panel, { label, key, cost, buy, value }) {
  upgradeRow(panel, {
    buy,
    refresh(els) {
      const lvl = state[key];
      els.name.text(`${label} · Lv ${lvl}/${P.MAX_LEVEL}`);
      els.sub.html(value(lvl));
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
      els.sub.html(`<span class="val">${fmt(P.clickDamage(lvl))}</span> damage per click`);
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
    value: (lvl) => {
      const w = P.BASE.laserBaseWidth + lvl * P.BASE.laserWidthPerLevel;
      return `<span class="val">${w.toFixed(0)}px</span> wide`;
    },
  });
  laserStatRow(panel, {
    label: 'Power',
    key: 'laserPower',
    cost: P.laserPowerCost,
    buy: buyLaserPower,
    value: () => `<span class="val">+more damage</span> · brighter beam`,
  });
  laserStatRow(panel, {
    label: 'Beams',
    key: 'laserBeams',
    cost: P.laserBeamsCost,
    buy: buyLaserBeams,
    value: (lvl) =>
      `<span class="val">${BEAM_DESC[lvl - 1]}</span> · ${P.beamSum(lvl)}× beam power`,
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
  const tierDef = TIERS[t];
  const glyphColor = hex(tierDef.color);

  const $set = $('<div class="tier current"></div>').appendTo(panel);
  $set.append(
    `<h3>${tierDef.name} Set <span class="badge">tier ${t + 1}/${P.TIER_COUNT}</span></h3>`
  );
  const $grid = $('<div class="objgrid"></div>').appendTo($set);

  SHAPES.forEach((shape, idx) => {
    const $cell = $(`
      <div class="obj">
        <div class="glyph" style="color:${glyphColor}">${GLYPHS[shape]}</div>
        <div class="lvl"></div>
        <button class="buy"></button>
      </div>`).appendTo($grid);

    $cell.find('button').on('click', () => buyObject(idx));

    objControls.push(() => {
      const lvl = state.objects[idx];
      const unlocked = objectUnlocked(idx);
      const $lvl = $cell.find('.lvl');
      const $btn = $cell.find('button');
      $cell.toggleClass('locked', lvl === 0 && !unlocked);

      if (lvl >= P.MAX_LEVEL) {
        $lvl.text(`Lv ${lvl}/${P.MAX_LEVEL}`);
        $btn.html('Maxed').prop('disabled', true);
      } else if (lvl === 0 && !unlocked) {
        // Gated: the previous shape hasn't been unlocked yet. Say so, instead of
        // showing a buyable-looking Unlock+cost the player can't actually use.
        $lvl.text('Locked');
        $btn.html('🔒 Unlock the<br>previous shape').prop('disabled', true);
      } else if (lvl === 0) {
        const cost = P.objectUnlockCost(t, idx);
        $lvl.text('Locked');
        $btn.html(`Unlock<br><span class="cost">${fmt(cost)}</span>`);
        $btn.prop('disabled', state.coins < cost);
      } else {
        const cost = P.objectUpgradeCost(t, idx, lvl);
        $lvl.html(`Lv ${lvl}/${P.MAX_LEVEL}<br>${fmt(P.objectDurability(t, idx, lvl))} durability`);
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
  $('#coins').text(fmt(state.coins));
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
