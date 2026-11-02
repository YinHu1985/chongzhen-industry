const SETTINGS_KEY = 'chongzhen-industry.click-sound.v1';
const DURATION = .045;
const MIN_INTERVAL = .016;
const PEAK_GAIN = .16;

/** A quiet UI tap with a short attack/release, separate from background music. */
export function createClickSound({ documentRef = globalThis.document, storage, audioContextFactory, onChange } = {}) {
  let preferences = storage;
  if (preferences === undefined) {
    try { preferences = globalThis.localStorage; } catch { /* Storage is optional. */ }
  }
  let enabled = true, volume = .35, destroyed = false;
  let context = null, resuming = null, generation = 0, lastStarted = -Infinity;
  const voices = new Set();
  try {
    const saved = JSON.parse(preferences?.getItem(SETTINGS_KEY) ?? 'null');
    if (typeof saved?.enabled === 'boolean') enabled = saved.enabled;
    if (Number.isFinite(saved?.volume)) volume = Math.max(0, Math.min(1, saved.volume));
  } catch { /* Broken preferences must not affect the game. */ }
  const factory = audioContextFactory || (() => {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    return typeof AudioContext === 'function' ? new AudioContext() : null;
  });
  const allowed = () => !destroyed && enabled && volume > 0 && !documentRef?.hidden;
  function notify() {
    if (!destroyed && typeof onChange === 'function') {
      try { onChange(); } catch { /* Sound settings must not interrupt a click. */ }
    }
  }
  function persist() {
    try { preferences?.setItem(SETTINGS_KEY, JSON.stringify({ enabled, volume })); } catch { /* Optional preferences. */ }
  }
  function disconnect(voice) {
    voices.delete(voice);
    if (voice.oscillator) voice.oscillator.onended = null;
    try { voice.oscillator?.disconnect(); } catch { /* The node may already be detached. */ }
    try { voice.gain?.disconnect(); } catch { /* The node may already be detached. */ }
  }
  function stop() {
    generation++;
    lastStarted = -Infinity;
    for (const voice of voices) {
      try { voice.oscillator?.stop(); } catch { /* Already ended or not yet started. */ }
      disconnect(voice);
    }
  }
  function synthesize(current) {
    const now = current.currentTime;
    if (!Number.isFinite(now) || now - lastStarted < MIN_INTERVAL) return false;
    const voice = { oscillator: null, gain: null };
    try {
      voice.oscillator = current.createOscillator();
      voice.gain = current.createGain();
      const oscillator = voice.oscillator, envelope = voice.gain.gain;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1100, now);
      oscillator.frequency.exponentialRampToValueAtTime(520, now + .035);
      envelope.setValueAtTime(0, now);
      envelope.linearRampToValueAtTime(volume * PEAK_GAIN, now + .002);
      envelope.exponentialRampToValueAtTime(.0001, now + .035);
      envelope.linearRampToValueAtTime(0, now + DURATION);
      oscillator.connect(voice.gain);
      voice.gain.connect(current.destination);
      oscillator.onended = () => disconnect(voice);
      voices.add(voice);
      oscillator.start(now);
      oscillator.stop(now + DURATION);
      lastStarted = now;
      return true;
    } catch {
      try { voice.oscillator?.stop(); } catch { /* Creation or scheduling failed. */ }
      disconnect(voice);
      return false;
    }
  }
  async function play() {
    if (!allowed()) return false;
    const requestGeneration = generation;
    try {
      if (!context || context.state === 'closed') {
        context = factory();
        lastStarted = -Infinity;
      }
      const current = context;
      if (!current) return false;
      if (current.state !== 'running') {
        if (!resuming) {
          resuming = Promise.resolve(current.resume()).then(() => true, () => false);
          const attempt = resuming;
          void attempt.then(() => { if (resuming === attempt) resuming = null; });
        }
        if (!await resuming) return false;
      }
      if (!allowed() || requestGeneration !== generation || context !== current || current.state !== 'running') return false;
      return synthesize(current);
    } catch { return false; }
  }
  const visibilityChanged = () => { if (documentRef?.hidden) stop(); };
  documentRef?.addEventListener?.('visibilitychange', visibilityChanged);
  return {
    get enabled() { return enabled; },
    get volume() { return volume; },
    play,
    toggle() {
      if (destroyed) return enabled;
      enabled = !enabled;
      if (!enabled) stop();
      persist(); notify();
      return enabled;
    },
    setVolume(value) {
      if (destroyed) return;
      let next;
      try { next = Number(value); } catch { return; }
      if (!Number.isFinite(next)) return;
      volume = Math.max(0, Math.min(1, next));
      if (volume === 0) stop();
      persist(); notify();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      documentRef?.removeEventListener?.('visibilitychange', visibilityChanged);
      try { void Promise.resolve(context?.close()).catch(() => {}); } catch { /* Some browsers cannot close a blocked context. */ }
      context = null;
      resuming = null;
    },
  };
}
