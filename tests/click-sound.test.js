import test from 'node:test';
import assert from 'node:assert/strict';
import { createClickSound } from '../src/click-sound.js';

const SETTINGS_KEY = 'chongzhen-industry.click-sound.v1';
function environment({ saved = null, state = 'running' } = {}) {
  const documentRef = new EventTarget(); documentRef.hidden = false;
  const data = new Map(saved === null ? [] : [[SETTINGS_KEY, saved]]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const parameters = () => ({ events: [], setValueAtTime(...args) { this.events.push(['set', ...args]); }, linearRampToValueAtTime(...args) { this.events.push(['linear', ...args]); }, exponentialRampToValueAtTime(...args) { this.events.push(['exponential', ...args]); } });
  const context = {
    state, currentTime: 0, destination: {}, oscillators: [], gains: [], resumeCalls: 0, closeCalls: 0,
    createOscillator() {
      const node = { frequency: parameters(), onended: null, starts: [], stops: [], disconnectCalls: 0,
        connect(target) { this.target = target; }, disconnect() { this.disconnectCalls++; },
        start(at) { this.starts.push(at); }, stop(at) { this.stops.push(at); }, end() { this.onended?.(); },
      };
      this.oscillators.push(node); return node;
    },
    createGain() {
      const node = { gain: parameters(), disconnectCalls: 0, connect(target) { this.target = target; }, disconnect() { this.disconnectCalls++; } };
      this.gains.push(node); return node;
    },
    resume() { this.resumeCalls++; this.state = 'running'; return Promise.resolve(); },
    close() { this.closeCalls++; this.state = 'closed'; return Promise.resolve(); },
  };
  let creations = 0;
  const audioContextFactory = () => { creations++; return context; };
  return { documentRef, storage, data, context, audioContextFactory, get creations() { return creations; } };
}

test('click sound creates audio only on play, reuses its context and ends and disconnects each short voice', async () => {
  const env = environment(), sound = createClickSound(env);
  assert.equal(sound.enabled, true); assert.equal(sound.volume, .35);
  assert.equal(env.creations, 0);
  assert.equal(await sound.play(), true);
  assert.equal(env.creations, 1);
  const voice = env.context.oscillators[0], gain = env.context.gains[0];
  assert.equal(voice.type, 'sine');
  assert.equal(voice.starts[0], 0);
  assert.ok(voice.stops[0] > 0 && voice.stops[0] < .1);
  assert.equal(gain.gain.events[1][1], .35 * .16);
  voice.end();
  assert.equal(voice.onended, null);
  assert.equal(voice.disconnectCalls, 1); assert.equal(gain.disconnectCalls, 1);
  env.context.currentTime = .1;
  assert.equal(await sound.play(), true);
  assert.equal(env.creations, 1);
  sound.destroy();
});

test('muting, zero volume and background visibility suppress clicks without touching background-music preferences', async () => {
  const env = environment();
  env.data.set('chongzhen-industry.music.v1', '{"enabled":true,"volume":0.8}');
  const sound = createClickSound(env);
  sound.toggle(); assert.equal(await sound.play(), false);
  sound.toggle(); sound.setVolume(0); assert.equal(await sound.play(), false);
  sound.setVolume(.5); env.documentRef.hidden = true; assert.equal(await sound.play(), false);
  assert.equal(env.creations, 0);
  env.documentRef.hidden = false; assert.equal(await sound.play(), true);
  env.documentRef.hidden = true; env.documentRef.dispatchEvent(new Event('visibilitychange'));
  assert.equal(env.context.oscillators[0].onended, null);
  assert.equal(env.context.oscillators[0].disconnectCalls, 1);
  env.documentRef.hidden = false; env.documentRef.dispatchEvent(new Event('visibilitychange'));
  assert.equal(env.context.oscillators.length, 1, 'returning to the tab does not play an unsolicited click');
  assert.equal(env.data.get('chongzhen-industry.music.v1'), '{"enabled":true,"volume":0.8}');
  sound.destroy();
});

test('preferences restore and clamp safely without creating an audio context', () => {
  const env = environment({ saved: '{"enabled":false,"volume":0.61}' });
  let changes = 0;
  const sound = createClickSound({ ...env, onChange: () => { changes++; } });
  assert.equal(sound.enabled, false); assert.equal(sound.volume, .61);
  assert.equal(sound.toggle(), true);
  sound.setVolume(2); assert.equal(sound.volume, 1);
  sound.setVolume('invalid'); sound.setVolume(Symbol('bad')); assert.equal(sound.volume, 1);
  sound.setVolume(-1); assert.equal(sound.volume, 0);
  assert.equal(changes, 3);
  assert.equal(env.creations, 0);
  assert.deepEqual(JSON.parse(env.data.get(SETTINGS_KEY)), { enabled: true, volume: 0 });
  sound.destroy();
});

test('rapid clicks are bounded while ordinary consecutive clicks still sound', async () => {
  const env = environment(), sound = createClickSound(env);
  sound.setVolume(1);
  const results = await Promise.all(Array.from({ length: 100 }, () => sound.play()));
  assert.equal(results.filter(Boolean).length, 1);
  for (const now of [.005, .01, .015]) { env.context.currentTime = now; assert.equal(await sound.play(), false); }
  env.context.currentTime = .02; assert.equal(await sound.play(), true);
  env.context.currentTime = .04; assert.equal(await sound.play(), true);
  assert.equal(env.context.oscillators.length, 3);
  assert.ok(env.context.gains.every(gain => gain.gain.events[1][1] <= .16), 'bounded voices retain ample clipping headroom');
  assert.equal(env.creations, 1);
  sound.destroy();
});

test('a suspended context resumes on a click, deduplicates pending resume and can retry after rejection', async () => {
  const env = environment({ state: 'suspended' });
  let resolveResume;
  env.context.resume = function () { this.resumeCalls++; return new Promise(resolve => { resolveResume = () => { this.state = 'running'; resolve(); }; }); };
  const sound = createClickSound(env), first = sound.play(), second = sound.play();
  assert.equal(env.context.resumeCalls, 1);
  resolveResume();
  assert.deepEqual(await Promise.all([first, second]), [true, false]);
  env.context.state = 'suspended';
  env.context.resume = () => Promise.reject(new Error('not allowed'));
  assert.equal(await sound.play(), false);
  env.context.resume = function () { this.state = 'running'; return Promise.resolve(); };
  env.context.currentTime = .2;
  assert.equal(await sound.play(), true);
  sound.destroy();
});

test('a late resume cannot play after mute, hiding or destruction', async () => {
  for (const cancel of ['mute', 'hide', 'destroy']) {
    const env = environment({ state: 'suspended' });
    let resolveResume;
    env.context.resume = () => new Promise(resolve => { resolveResume = () => { env.context.state = 'running'; resolve(); }; });
    const sound = createClickSound(env), pending = sound.play();
    if (cancel === 'mute') sound.toggle();
    else if (cancel === 'hide') { env.documentRef.hidden = true; env.documentRef.dispatchEvent(new Event('visibilitychange')); }
    else sound.destroy();
    resolveResume();
    assert.equal(await pending, false);
    assert.equal(env.context.oscillators.length, 0);
    sound.destroy();
  }
});

test('unavailable audio, storage failures and synthesis failures never reject or interrupt gameplay', async () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  for (const audioContextFactory of [() => null, () => { throw new Error('unavailable'); }]) {
    const sound = createClickSound({ storage, audioContextFactory, onChange() { throw new Error('view gone'); } });
    assert.equal(await sound.play(), false);
    assert.doesNotThrow(() => { sound.toggle(); sound.setVolume(.2); sound.destroy(); });
  }
  const env = environment(), sound = createClickSound({ ...env, storage });
  env.context.createGain = () => { throw new Error('node unavailable'); };
  assert.equal(await sound.play(), false);
  assert.equal(env.context.oscillators[0].disconnectCalls, 1);
  env.context.close = () => Promise.reject(new Error('cannot close'));
  sound.destroy();
  await Promise.resolve();
});

test('destroy stops active nodes once and future controls cannot recreate audio or update settings', async () => {
  const env = environment(), sound = createClickSound(env);
  await sound.play();
  const node = env.context.oscillators[0];
  sound.destroy(); sound.destroy();
  assert.equal(env.context.closeCalls, 1);
  assert.equal(node.disconnectCalls, 1);
  assert.equal(node.onended, null);
  const saved = env.data.get(SETTINGS_KEY);
  sound.toggle(); sound.setVolume(.9);
  assert.equal(await sound.play(), false);
  assert.equal(env.data.get(SETTINGS_KEY), saved);
  assert.equal(env.creations, 1);
});
