// lab/target.js
// The object being disintegrated — a themed image sprite (egypt artefacts, etc.)
// that hovers above the ground. As durability drops the laser eats it away by
// biting circular HOLES out of it, revealing the lab background behind.
//
// Implementation: each object owns a RenderTexture. On spawn we draw the object
// texture into it once; thereafter every crater is a single soft white brush
// stamped into the RenderTexture with BLEND_MODES.ERASE (O(1) per crater — no
// geometry rebuild, unlike a Graphics mask whose hole triangulation thrashed and
// froze as the overlapping craters piled up). A single Sprite displays the RT.
import { Container } from '@pixi/display';
import { Sprite } from '@pixi/sprite';
import { Texture, RenderTexture } from '@pixi/core';
import { BLEND_MODES } from '@pixi/constants';
import { objectTexture, whenReady, BRUSH } from './assets.js';

const DISPLAY_H = 175; //  displayed object height in px
const RT_MAX_H = 360; //   cap the RenderTexture height (crisp enough; bounds VRAM)
const MAX_EROSION = 22; //  fine holes punched by the time the object is destroyed

export class Target {
  constructor(dims, renderer) {
    this.dims = dims;
    this.renderer = renderer;
    this.container = new Container();
    this.container.x = dims.center.x;
    this.baseY = dims.center.y;

    // Shows the (progressively eroded) RenderTexture.
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0.5);
    this.container.addChild(this.sprite);

    // Off-stage helpers rendered straight into the RenderTexture (never added to
    // the scene graph): the source object (drawn once per spawn) and the erase
    // brush (stamped per crater).
    this.srcSprite = new Sprite(Texture.EMPTY);
    this.brush = new Sprite(BRUSH);
    this.brush.anchor.set(0.5);
    this.brush.blendMode = BLEND_MODES.ERASE;

    this.rt = null; //        RenderTexture for the current object
    this.rtW = 0;
    this.rtH = 0;

    this.bob = 0;
    this.frac = 1; //         current durability fraction (1 = pristine)
    this.lastDrawnFrac = 1; // throttles erosion to ~1.5% steps
    this.erosionCount = 0; // craters already stamped this object
    this.ready = false; //    true once the RenderTexture is primed
    this.halfW = DISPLAY_H / 2; // displayed half-width
    this.halfH = DISPLAY_H / 2; // displayed half-height (for beam aiming)
    this.radTex = DISPLAY_H / 2; // crater scale in RenderTexture pixels
    this.dispScale = 1; //    RenderTexture px -> display px
    this.color = 0xffffff; // tier colour used to tint the shard particles
  }

  // Reset for a freshly spawned object at colour `tier`, shape `idx`.
  spawn(tier, idx, color) {
    this.color = color;
    this.frac = 1;
    this.lastDrawnFrac = 1;
    this.erosionCount = 0;
    this.ready = false;
    const tex = objectTexture(tier, idx);
    this.sprite.visible = false;
    // Prime the RenderTexture once the source size is known (sync for cached art).
    whenReady(tex, (w, h) => this._prime(tex, w, h));
  }

  // (Re)size the RenderTexture and draw the pristine object into it.
  _prime(tex, w, h) {
    const rtScale = Math.min(1, RT_MAX_H / h);
    this.rtW = Math.max(1, Math.round(w * rtScale));
    this.rtH = Math.max(1, Math.round(h * rtScale));

    if (!this.rt) this.rt = RenderTexture.create({ width: this.rtW, height: this.rtH });
    else this.rt.resize(this.rtW, this.rtH);

    // Draw the source object into the RT, clearing whatever was there before.
    this.srcSprite.texture = tex;
    this.srcSprite.anchor.set(0, 0);
    this.srcSprite.position.set(0, 0);
    this.srcSprite.scale.set(rtScale);
    this.renderer.render(this.srcSprite, { renderTexture: this.rt, clear: true });

    this.sprite.texture = this.rt;
    this.dispScale = DISPLAY_H / this.rtH;
    this.sprite.scale.set(this.dispScale);
    this.halfW = (this.rtW * this.dispScale) / 2;
    this.halfH = (this.rtH * this.dispScale) / 2;
    this.radTex = Math.min(this.rtW, this.rtH) / 2;

    this.ready = true;
    this.sprite.visible = true;
  }

  // Stamp one erase-brush crater (centre + radius in RenderTexture pixels) into
  // the RT — a single draw call, accumulating on top of prior craters.
  _erase(cx, cy, r) {
    const b = this.brush;
    b.position.set(cx, cy);
    b.scale.set((r * 2) / b.texture.width);
    this.renderer.render(b, { renderTexture: this.rt, clear: false });
  }

  // Continuous erosion driven by durability fraction (1 -> 0), called each frame
  // by the scene. Throttled to ~1.5% steps; only the NEW craters since last time
  // are stamped (never a full rebuild).
  setDamage(frac) {
    this.frac = Math.max(0, Math.min(1, frac));
    if (!this.ready) return;
    if (Math.abs(this.frac - this.lastDrawnFrac) < 0.015) return;
    this.lastDrawnFrac = this.frac;
    const dmg = 1 - this.frac;
    const target = Math.floor(dmg * MAX_EROSION);
    while (this.erosionCount < target) {
      const angle = (Math.random() - 0.5) * Math.PI * 2;
      const dist = this.radTex * (0.25 + Math.random() * 0.6);
      const r = this.radTex * (0.12 + Math.random() * 0.14);
      this._erase(this.rtW / 2 + Math.cos(angle) * dist, this.rtH / 2 + Math.sin(angle) * dist, r);
      this.erosionCount++;
    }
  }

  // Punch a bigger destruction crater (`tier` 1..3 controls size). Returns the
  // world-space point where shards should erupt from.
  addDestruction(tier) {
    if (!this.ready) return { x: this.container.x, y: this.container.y };
    const angle = (Math.random() - 0.5) * Math.PI * 2;
    const dist = this.radTex * (0.4 + Math.random() * 0.5);
    const r = this.radTex * (0.32 + tier * 0.13);
    this._erase(this.rtW / 2 + Math.cos(angle) * dist, this.rtH / 2 + Math.sin(angle) * dist, r);
    return {
      x: this.container.x + Math.cos(angle) * dist * this.dispScale,
      y: this.container.y + Math.sin(angle) * dist * this.dispScale,
    };
  }

  update(deltaMS) {
    // Gentle hover.
    this.bob += deltaMS * 0.003;
    this.container.y = this.baseY + Math.sin(this.bob) * 6;
  }

  topY() {
    return this.container.y - this.halfH;
  }
}
