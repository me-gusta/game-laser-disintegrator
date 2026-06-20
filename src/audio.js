// audio.js
// ---------------------------------------------------------------------------
// All game sound, built on Howler. Punchy one-shots for snaps / shatter / coins
// / buys / denied taps, a celebratory tier-up sting, and a background music loop.
// Two independent toggles — music and sound — persist via the platform store;
// both default on. A separate platform-driven master mute (setMuted) sits on top
// for the host's muteAudio setting.
//
// Browsers block audio until a user gesture, so everything stays silent until the
// first pointer/key interaction unlocks playback (see init/_unlock). Callers stay
// terse: every play method no-ops when audio isn't ready yet or its toggle is off,
// mirroring the WAAPI feedback helpers in ui.js. The master mix is kept quiet on
// purpose — this is a long-session idle game, not an arcade.
// ---------------------------------------------------------------------------
import { Howl, Howler } from 'howler';
// Platform storage seam (localStorage in dev, CrazyGames data module in prod).
import { data as storage } from './platform/platform.js';

// Relative (no leading slash): CrazyGames serves the game from a CDN sub-path,
// where an absolute `/sound_fx/...` would resolve to the CDN root and 404.
const FX = 'sound_fx';
const LS_KEY = 'laserDisintegrator/audio/v1';

// Major-pentatonic semitone steps. The coin tick walks UP this scale as a
// cleaner's collection streak climbs, so a local pickup run sounds like a
// rising musical arpeggio instead of a flat machine-gun. Snapping to a scale
// (rather than a continuous glissando) keeps every step consonant. Capped at a
// short run so a maxed vacuum tops out around ~2.2x rate, not a chipmunk squeak.
const PENTA = [0, 2, 4, 7, 9];
const COIN_STREAK_MAX = 6; // highest scale degree the run reaches before it holds

// Restore the saved toggles. Either toggle defaults ON (only an explicit `false`
// in storage turns it off), so a fresh player gets full sound. Reads the platform
// store, so it must run AFTER platform.init() — hence it's called from init(),
// not the constructor (which runs at import, before the backend is selected).
function loadSettings() {
  try {
    const d = JSON.parse(storage.getItem(LS_KEY));
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
    // Defaults until init() loads the persisted toggles from platform storage.
    this.settings = { music: true, sound: true };
    this.ready = false; //   flipped true once a user gesture unlocks playback

    // Coin-pitch top-note breaker (see coin()). Without this a long collection
    // run pins the streak at COIN_STREAK_MAX and the top note machine-guns
    // forever. `_coinTopRun` counts consecutive top-note hits; once it reaches
    // `_coinTopBreak` (a fresh random 5-10 each time) we pull the run back to the
    // bottom via `_coinDrop` and let it climb the scale again.
    this._coinTopRun = 0;
    this._coinDrop = 0;
    this._coinTopBreak = this._randTopBreak();

    // One-shots use Web Audio (low latency); the long music loop streams via HTML5
    // audio so it isn't fully decoded into memory. Volumes are individually tuned
    // — the shatter is the loudest (the climax), the coin tick the quietest (it
    // fires tens of times/sec at a maxed vacuum).
    this.sfx = {
      hit: new Howl({ src: [`${FX}/hit.mp3`], volume: 0.4 }),
      explosion: new Howl({ src: [`${FX}/explosion.mp3`], volume: 0.3 }),
      shard1: new Howl({ src: [`${FX}/shard1.mp3`], volume: 0.8 }),
      shard2: new Howl({ src: [`${FX}/shard2.mp3`], volume: 0.8 }),
      coin: new Howl({ src: [`${FX}/coin.mp3`], volume: 0.15 }),
      buy: new Howl({ src: [`${FX}/buy.mp3`], volume: 0.5 }),
      deny: new Howl({ src: [`${FX}/deny.mp3`], volume: 0.4 }),
      tierUp: new Howl({ src: [`${FX}/tier-up.mp3`], volume: 0.6 }),
    };
    this.music = new Howl({ src: ['bg_music.mp3'], loop: true, volume: 0.22, html5: true });
  }

  // Wire the one-time unlock gesture and the tab-hidden music pause. Call once on
  // boot (main.js), AFTER platform.init() so the persisted toggles can be read
  // from the platform store.
  init() {
    this.settings = loadSettings();
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
    // iOS puts the AudioContext into an "interrupted"/"suspended" state when the
    // app is backgrounded or interrupted (calls, Siri), and WebKit will ONLY let
    // us revive it from inside a real user gesture — the visibilitychange above
    // is too late on iOS. So resume on every touchend/click while suspended, per
    // the CrazyGames mobile-audio requirement. Not `once`: an interruption can
    // happen any number of times in a session.
    const reviveAudio = () => {
      // Revive a suspended WebAudio context (iOS interruptions) when present.
      if (Howler.ctx && Howler.ctx.state !== 'running') Howler.ctx.resume();
      // ALSO (re)start the streaming music if it should be playing but isn't.
      // On mobile the very first unlock gesture usually fires before the music
      // track has finished loading, so its queued play() resolves outside a user
      // gesture and the browser blocks it — and the old code only retried while
      // the ctx was suspended, which it isn't once the SFX context is running.
      // So music stayed silent until the player toggled it off/on. Retrying on
      // every tap restarts it the moment it's loaded; _playMusic is idempotent.
      if (this.ready && this.settings.music) this._playMusic();
    };
    document.addEventListener('touchend', reviveAudio);
    document.addEventListener('click', reviveAudio);
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
    // Only (re)start a loaded, idle loop. Skipping while still 'loading' avoids
    // queueing a pre-load play() that a mobile browser later blocks (and avoids
    // stacking duplicate voices if several gestures land during that window) —
    // the loop instead starts on the first gesture after the track is loaded.
    if (this.music.state() === 'loaded' && !this.music.playing()) this.music.play();
  }

  // --- coin tick -----------------------------------------------------------
  // Round-robins Howler's voice pool at a pitch set by the collecting cleaner's
  // streak: each shard a cleaner pulls off a *local* cluster steps the note up a
  // major-pentatonic scale, so a pickup run rises like an arpeggio; when the
  // cleaner drives off to a fresh pile the caller resets `streak` to 0 and the
  // run drops back to the low note (see shards.js). With several cleaners each
  // carrying their own streak, the ticks interleave into varied pitches rather
  // than the old flat, saturated machine-gun.
  // A fresh "break after this many top notes" threshold, in [5, 10].
  _randTopBreak() {
    return 10 + Math.floor(Math.random() * 6);
  }

  coin(streak = 0) {
    if (!this.ready || !this.settings.sound) return;
    let n = Math.min(streak, COIN_STREAK_MAX);

    // Break up an endless top-note run. While the streak sits pinned at the top
    // (big pile + fast vacuum), count the consecutive top hits; once we've held
    // it for a random 5-10, drop the run back to the low note and let it re-climb
    // the scale (`_coinDrop` shrinks one step per hit, so the arpeggio walks back
    // up 0,1,2…). A genuine gameplay restart (cleaner drove to a fresh pile, so
    // streak fell below the cap) cancels any in-progress re-climb and resets.
    if (n >= COIN_STREAK_MAX && this._coinDrop === 0) {
      if (++this._coinTopRun >= this._coinTopBreak) {
        this._coinTopRun = 0;
        this._coinTopBreak = this._randTopBreak();
        this._coinDrop = COIN_STREAK_MAX;
      }
    } else if (n < COIN_STREAK_MAX) {
      this._coinTopRun = 0;
      this._coinDrop = 0;
    }
    if (this._coinDrop > 0) {
      n = Math.max(0, n - this._coinDrop);
      this._coinDrop--;
    }

    const semis = 12 * Math.floor(n / PENTA.length) + PENTA[n % PENTA.length];
    const id = this.sfx.coin.play();
    this.sfx.coin.rate(Math.pow(2, semis / 12), id);
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
  // commits them to the platform store.
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

  // Master mute driven by the host platform (CrazyGames `settings.muteAudio`),
  // wired in main.js. This is a hard gate ON TOP OF the player's own music/sound
  // toggles — `Howler.mute(true)` silences everything without disturbing those
  // preferences, so unmuting restores exactly the player's chosen mix.
  setMuted(muted) {
    Howler.mute(muted);
  }

  save() {
    try {
      storage.setItem(LS_KEY, JSON.stringify(this.settings));
    } catch {
      // Best-effort, same as the game save.
    }
  }
}

export const audio = new AudioManager();
