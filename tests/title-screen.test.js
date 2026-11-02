import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getDate } from '../src/game.js';
import { renderTitleScreen } from '../src/title-screen.js';

test('title screen offers new and imported games without pretending an empty browser has a save', () => {
  const html = renderTitleScreen();
  assert.match(html, /data-action="continue-game" disabled/);
  assert.match(html, /尚无本地卷宗/);
  assert.match(html, /data-action="new-game"/);
  assert.match(html, /data-action="load-save"/);
  assert.match(html, /朕梦中得窥天机，历甲申之殇，习天工之妙。/);
  assert.match(html, /逆天改命，当始于今日。/);
});

test('title screen presents the real saved campaign and keeps saved endings available', () => {
  const state = createGame({ maxTurns: 40 });
  const html = renderTitleScreen({ savedState: state });
  assert.doesNotMatch(html, /data-action="continue-game" disabled/);
  assert.ok(html.includes(getDate(state)));
  assert.match(html, /第 1 \/ 40 季/);
  assert.match(renderTitleScreen({ savedState: { ...state, status: 'lost' } }), /已完结/);
});

test('title notices are escaped and music controls reflect the supplied preference', () => {
  const html = renderTitleScreen({ notice: '<img onerror="bad">', music: { enabled: false, volume: .46 } });
  assert.ok(html.includes('&lt;img onerror=&quot;bad&quot;&gt;'));
  assert.match(html, /data-action="toggle-music" aria-pressed="false"/);
  assert.match(html, /data-music-label>音乐关/);
  assert.match(html, /value="46" data-music-volume/);
});

test('click sound has separate controls and volume from background music', () => {
  const html = renderTitleScreen({ music: { enabled: false, volume: .46 }, clickSound: { enabled: true, volume: .72 } });
  assert.match(html, /data-action="toggle-music" aria-pressed="false"/);
  assert.match(html, /value="46" data-music-volume/);
  assert.match(html, /data-action="toggle-click-sound" aria-pressed="true"/);
  assert.match(html, /value="72" data-click-sound-volume/);
  assert.match(renderTitleScreen({ clickSound: { enabled: false, volume: 0 } }), /data-click-sound-label>音效关/);
});
