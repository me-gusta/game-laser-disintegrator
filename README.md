# Laser Disintegrator

A small idle/incremental demo built with **PixiJS v6.5.10** (modular `@pixi/*` imports)
and a **jQuery** HTML UI. A laser beam glows down from the top of the "lab" and
disintegrates a hovering geometric object; the shards it sheds are vacuumed up
for coins, which you spend on exponential upgrades.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle in dist/
```

## How to play

- **Click anywhere in the lab** to deal click damage to the object.
- The **laser** also deals passive damage per second.
- As durability drops, the object loses 3 tiers of material (circular craters),
  shedding **shards** that fly to the walls, bounce, and fall to the floor.
- The **vacuum** slides along the floor and sucks up shards; each one pays coins.
- Spend coins in the three upgrade tabs on the right.
- **Offline progression** — your progress is saved automatically, and while the
  tab is closed/hidden the laser keeps working. On return you're credited **70%**
  of your live passive income for the time away (ignored below **60s**, capped at
  **12h**), shown in a "Welcome back" pop-up.

## Upgrades

- **Laser** — three separate stats, each 5 levels: **Thickness** (beam width),
  **Power** (brightness + damage) and **Beams** (pattern `X` → `xXx` → `XXX` →
  `xXXXx` → `XXXXX`, where `x` is a half-size/half-power beam). Maxing all three
  unlocks the priced **NEXT TIER** button, which resets the stats to 1 and changes
  colour (red → blue → green → purple).
- **Shards** — click power, coin value per shard, and vacuum speed (10 tiers).
- **Objects** — a single set of 5 shapes (circle, rectangle, triangle, pentagon,
  hexagon) at the current colour tier. Each shape has 5 upgrade levels and unlocks
  once the previous one has been bought (one-by-one, but upgrades are unrestricted).
  Maxing the whole set unlocks the priced **NEXT
  TIER** button: the set stays the same but moves to the next colour
  (white → light-blue → light-green → light-purple). The object being
  disintegrated is chosen at random from the unlocked shapes (progressive bias to
  later shapes). Tougher shapes drop more shards (~10–20 for the first up to ~100).

## Code layout

| File | Responsibility |
|------|----------------|
| `src/progression.js` | **All balance math** — baseline numbers + exponential curves. Tune the game here. Also holds the passive-income model + offline-reward knobs. |
| `src/persistence.js` | Save/restore state to `localStorage` + autosave triggers (tab close / hide / reload / interval). |
| `src/state.js` | Game state, buy actions, object grid, tier gating, pub/sub. |
| `src/lab/laser.js` | Laser emitter + glowing beam(s). |
| `src/lab/target.js` | The hovering object + crater-based disintegration. |
| `src/lab/shards.js` | Shard particles (hand-rolled physics) + the vacuum. |
| `src/lab/scene.js` | Wires the lab together: damage → destruction → shatter → respawn. |
| `src/ui.js` | jQuery upgrade panels, tabs, coin counter. |
| `src/main.js` | Bootstraps the Pixi `Renderer` + `Ticker` and the game loop. |

> Note: this build ships only `@pixi/core` + `@pixi/ticker` (no `@pixi/app`), so the
> renderer, stage and ticker are wired by hand in `main.js`, and `BatchRenderer` is
> registered via `extensions.add(...)`.

`window.game` (`{ scene, ticker, state }`) is exposed in the console for tuning.

## Balancing

Everything tunable lives in the `BASE` object at the top of `progression.js`
(costs, growth rates, durability, vacuum speed, rewards). The functions below it
turn those baselines into per-level values. Offline progression has its own knobs
in the `OFFLINE` object (`minSeconds`, `maxSeconds`, `efficiency`); the credited
rate comes from `passiveCoinsPerSecond()`, which models the laser → shards →
vacuum chain (so a slow vacuum throttles offline income exactly as in live play).
