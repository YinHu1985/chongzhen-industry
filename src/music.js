const SETTINGS_KEY = 'chongzhen-industry.music.v1';
const TRACK_URL = new URL('../assets/audio/jiashen-wei-zhi.mp3', import.meta.url).href;

/** One persistent audio element, independent of title/game DOM replacement. */
export function createBackgroundMusic({ onChange } = {}) {
  let enabled = true, volume = .28, unlocked = false, playing = false, destroyed = false;
  let generation = 0, activePlay = null;
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (typeof saved?.enabled === 'boolean') enabled = saved.enabled;
    if (Number.isFinite(saved?.volume)) volume = Math.max(0, Math.min(1, saved.volume));
  } catch { /* Storage may be unavailable; music remains optional. */ }
  const audio = new Audio(TRACK_URL);
  audio.loop = true;
  audio.preload = 'none';
  audio.volume = volume;
  const notify = () => { if (!destroyed && typeof onChange === 'function') onChange(); };
  const allowed = () => !destroyed && enabled && unlocked && !document.hidden;
  const persist = () => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ enabled, volume })); } catch { /* Optional preferences. */ }
  };
  function stop() {
    generation += 1;
    activePlay = null;
    audio.pause();
    playing = false;
    notify();
  }
  function start() {
    if (!allowed()) return Promise.resolve(false);
    if (playing && !audio.paused) return Promise.resolve(true);
    if (activePlay) return activePlay.promise;
    const id = ++generation;
    let attempt;
    try { attempt = audio.play(); } catch { playing = false; notify(); return Promise.resolve(false); }
    const promise = Promise.resolve(attempt).then(() => {
      // A mute or visibility change can arrive before play() resolves.
      if (!allowed()) audio.pause();
      if (id === generation) notify();
      return id === generation && playing && !audio.paused;
    }).catch(() => {
      if (id === generation) { playing = false; notify(); }
      return false;
    }).finally(() => { if (activePlay?.id === id) activePlay = null; });
    activePlay = { id, promise };
    return promise;
  }
  const listeners = {
    playing: () => { if (!allowed()) { audio.pause(); return; } playing = true; notify(); },
    pause: () => { playing = false; notify(); },
    waiting: () => { playing = false; notify(); },
    ended: () => { playing = false; notify(); },
    error: () => { playing = false; notify(); },
  };
  for (const [event, handler] of Object.entries(listeners)) audio.addEventListener(event, handler);
  const visibilityChanged = () => { if (document.hidden) stop(); else void start(); };
  document.addEventListener('visibilitychange', visibilityChanged);
  return {
    get enabled() { return enabled; },
    get playing() { return playing && !audio.paused && !audio.ended; },
    get volume() { return volume; },
    unlock() { if (destroyed) return Promise.resolve(false); unlocked = true; return start(); },
    toggle() {
      if (destroyed) return Promise.resolve(false);
      enabled = !enabled;
      persist();
      if (!enabled) { stop(); return Promise.resolve(false); }
      unlocked = true;
      notify();
      return start();
    },
    setVolume(value) {
      if (destroyed || !Number.isFinite(Number(value))) return;
      volume = Math.max(0, Math.min(1, Number(value)));
      audio.volume = volume;
      persist();
      notify();
    },
    destroy() {
      if (destroyed) return;
      stop();
      destroyed = true;
      document.removeEventListener('visibilitychange', visibilityChanged);
      for (const [event, handler] of Object.entries(listeners)) audio.removeEventListener(event, handler);
      audio.removeAttribute('src');
      audio.load();
    },
  };
}
