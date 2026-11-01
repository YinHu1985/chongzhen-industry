import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundMusic } from '../src/music.js';

function browser(saved = null) {
  const keys = ['Audio', 'document', 'localStorage'];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const document = new EventTarget();
  document.hidden = false;
  const data = new Map(saved === null ? [] : [['chongzhen-industry.music.v1', saved]]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  class Audio extends EventTarget {
    static latest;
    constructor(src) { super(); this.src = src; this.paused = true; this.ended = false; this.playCalls = 0; Audio.latest = this; }
    play() {
      this.playCalls++;
      if (this.reject) return Promise.reject(new Error('Playback blocked'));
      const begin = () => { this.paused = false; this.dispatchEvent(new Event('playing')); };
      if (this.defer) return new Promise(resolve => { this.resolvePlay = () => { begin(); resolve(); }; });
      begin();
      return Promise.resolve();
    }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
    removeAttribute() {}
    load() {}
  }
  for (const [key, value] of Object.entries({ Audio, document, localStorage: storage })) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  return { Audio, document, data, restore() {
    for (const key of keys) if (previous[key]) Object.defineProperty(globalThis, key, previous[key]); else delete globalThis[key];
  } };
}

test('music waits for interaction, persists across renders, and respects visibility and mute', async () => {
  const env = browser();
  const player = createBackgroundMusic();
  const audio = env.Audio.latest;
  try {
    assert.equal(player.enabled, true);
    assert.equal(player.volume, .28);
    assert.equal(audio.playCalls, 0);
    assert.equal(await player.unlock(), true);
    assert.equal(player.playing, true);
    await player.unlock();
    assert.equal(audio.playCalls, 1, 'repeated UI gestures do not restart the soundtrack');
    env.document.hidden = true;
    env.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(player.playing, false);
    env.document.hidden = false;
    env.document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    assert.equal(player.playing, true);
    await player.toggle();
    assert.equal(player.enabled, false);
    assert.equal(player.playing, false);
    env.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(audio.playCalls, 2, 'visibility cannot undo the player mute preference');
  } finally { player.destroy(); env.restore(); }
});

test('music restores preferences without autoplay and safely clamps volume', async () => {
  const env = browser(JSON.stringify({ enabled: false, volume: .61 }));
  const player = createBackgroundMusic();
  try {
    assert.equal(player.enabled, false);
    assert.equal(player.volume, .61);
    assert.equal(await player.unlock(), false);
    assert.equal(env.Audio.latest.playCalls, 0);
    assert.equal(await player.toggle(), true);
    player.setVolume(2);
    assert.equal(player.volume, 1);
    assert.equal(env.Audio.latest.volume, 1);
    player.setVolume('invalid');
    assert.equal(player.volume, 1);
    assert.deepEqual(JSON.parse(env.data.get('chongzhen-industry.music.v1')), { enabled: true, volume: 1 });
  } finally { player.destroy(); env.restore(); }
});

test('failed or delayed playback never leaks a rejection or overrides a newer mute', async () => {
  const env = browser();
  const player = createBackgroundMusic();
  const audio = env.Audio.latest;
  try {
    audio.reject = true;
    assert.equal(await player.unlock(), false);
    assert.equal(player.playing, false);
    audio.reject = false;
    assert.equal(await player.unlock(), true, 'a later gesture can retry playback');
    await player.toggle();
    audio.defer = true;
    const pending = player.toggle();
    await player.toggle();
    audio.resolvePlay();
    assert.equal(await pending, false);
    assert.equal(player.enabled, false);
    assert.equal(player.playing, false);
    assert.equal(audio.paused, true);
  } finally { player.destroy(); env.restore(); }
});
