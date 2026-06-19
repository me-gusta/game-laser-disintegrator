// audio.js
// ---------------------------------------------------------------------------
// All game sound, built on Howler. Punchy one-shots for snaps / shatter / coins
// / buys / denied taps, a celebratory tier-up sting, and a background music loop.
// Two independent toggles — music and sound — persist to localStorage; both
// default on.
//
// Browsers block audio until a user gesture, so everything stays silent until the
// first pointer/key interaction unlocks playback (see init/_unlock). Callers stay
// terse: every play method no-ops when audio isn't ready yet or its toggle is off,
// mirroring the WAAPI feedback helpers in ui.js. The master mix is kept quiet on
// purpose — this is a long-session idle game, not an arcade.
// ---------------------------------------------------------------------------
import { Howl, Howler } from 'howler';

const FX = '/sound_fx';
const LS_KEY = 'laserDisintegrator/audio/v1';

// Restore the saved toggles. Either toggle defaults ON (only an explicit `false`
// in storage turns it off), so a fresh player gets full sound.
function loadSettings() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_KEY));
    if (d && typeof d === 'object') {
      return { music: d.music !== false, sound: d.sound !== false };
    }
  } catch {
    // Disabled / blocked storage — fall through to defaults.
  }
  return { music: true, sound: true };
}

class AudioManager {
  constructor() {
    this.settings = loadSettings();
    this.ready = false; //   flipped true once a user gesture unlocks playback
    this._lastCoin = 0; //   ms timestamp of the last coin tick (for streak detection)
    this._coinStreak = 0; // consecutive fast coins -> rising pitch (idle-game classic)

    // One-shots use Web Audio (low latency); the long music loop streams via HTML5
    // audio so it isn't fully decoded into memory. Volumes are individually tuned
    // — the shatter is the loudest (the climax), the coin tick the quietest (it
    // fires tens of times/sec at a maxed vacuum).
    this.sfx = {
      hit: new Howl({ src: [`${FX}/hit.mp3`], volume: 0.4 }),
      explosion: new Howl({ src: [`${FX}/explosion.mp3`], volume: 0.3 }),
      shard1: new Howl({ src: [`${FX}/shard1.mp3`], volume: 0.8 }),
      shard2: new Howl({ src: [`${FX}/shard2.mp3`], volume: 0.8 }),
      coin: new Howl({ src: [`${FX}/coin.mp3`], volume: 0.22 }),
      buy: new Howl({ src: [`${FX}/buy.mp3`], volume: 0.5 }),
      deny: new Howl({ src: [`${FX}/deny.mp3`], volume: 0.4 }),
      tierUp: new Howl({ src: [`${FX}/tier-up.mp3`], volume: 0.6 }),
    };
    this.music = new Howl({ src: ['/bg_music.mp3'], loop: true, volume: 0.22, html5: true });
  }

  // Wire the one-time unlock gesture and the tab-hidden music pause. Call once on
  // boot (main.js).
  init() {
    const unlock = () => this._unlock();
    // Capture + once so the very first interaction anywhere unlocks audio —
    // including the lab-canvas tap that also deals click damage.
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
    // Don't keep the music playing into a backgrounded tab; resume on return if
    // it's enabled. (SFX never fire while hidden — no gameplay runs.)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.music.pause();
      else if (this.ready && this.settings.music) this._playMusic();
    });
  }

  _unlock() {
    if (this.ready) return;
    this.ready = true;
    // Defensively resume the Web Audio context (Howler also auto-unlocks on its
    // own gesture listeners, but pointerdown isn't always among them).
    if (Howler.ctx && Howler.ctx.state !== 'running') Howler.ctx.resume();
    if (this.settings.music) this._playMusic();
  }

  _playMusic() {
    if (!this.music.playing()) this.music.play();
  }

  // --- coin tick -----------------------------------------------------------
  // Round-robins Howler's voice pool, with a streak-rising pitch so a maxed
  // vacuum's tens-per-second don't machine-gun — the pitch climbs on a fast run
  // and resets after a gap.
  coin() {
    if (!this.ready || !this.settings.sound) return;
    const now = Date.now();
    if (now - this._lastCoin < 250) this._coinStreak = Math.min(this._coinStreak + 1, 30);
    else this._coinStreak = 0;
    this._lastCoin = now;
    const id = this.sfx.coin.play();
    this.sfx.coin.rate(Math.min(2.4, 1 + this._coinStreak * 0.035), id);
  }

  // A smaller crunch on each destruction-tier crossing; alternate the two shard
  // samples so repeated snaps don't sound identical.
  snap(i = 0) {
    if (!this.ready || !this.settings.sound) return;
    (i % 2 ? this.sfx.shard2 : this.sfx.shard1).play();
  }

  hit() { this._oneShot('hit'); } //           a tap on the lab (manual click damage)
  // The climax — a meaty crack on a kill. A little pitch variation each time so
  // back-to-back shatters don't sound like a copy-paste.
  shatter() {
    if (!this.ready || !this.settings.sound) return;
    const id = this.sfx.explosion.play();
    this.sfx.explosion.rate(0.9 + Math.random() * 0.2, id);
  }
  buy() { this._oneShot('buy'); } //           satisfying ka-ching on a successful buy
  deny() { this._oneShot('deny'); } //         soft thunk on a disabled / unaffordable tap
  tierUp() { this._oneShot('tierUp'); } //     celebratory chord on a laser tier crossing

  _oneShot(key) {
    if (!this.ready || !this.settings.sound) return;
    this.sfx[key].play();
  }

  // --- settings (live preview + persistence) -------------------------------
  // Toggles apply immediately so the player hears the change in the modal; save()
  // commits them to localStorage.
  setMusic(on) {
    this.settings.music = on;
    if (on) { if (this.ready) this._playMusic(); }
    else this.music.pause();
  }
  setSound(on) {
    this.settings.sound = on;
    // One-shots are short and simply stop firing once the toggle is off (their
    // guards return early).
  }
  save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.settings));
    } catch {
      // Best-effort, same as the game save.
    }
  }
}

export const audio = new AudioManager();
