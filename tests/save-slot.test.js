import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, performAction } from '../src/game.js';
import { SAVE_KEY, MAX_SAVE_FILE_BYTES, loadLocalSave, storeLocalSave, readSaveFile } from '../src/save-slot.js';

function slot(raw = null) {
  return { raw, writes: 0, getItem(key) { assert.equal(key, SAVE_KEY); return this.raw; }, setItem(key, value) { assert.equal(key, SAVE_KEY); this.writes++; this.raw = value; } };
}

test('opening the title screen does not create a save or alter an existing or corrupt slot', () => {
  const empty = slot();
  assert.equal(loadLocalSave(empty), null);
  assert.equal(empty.writes, 0);
  const state = createGame({ maxTurns: 40, seed: 812 });
  const existing = slot(JSON.stringify({ state, savedAt: 'earlier' }));
  const before = existing.raw;
  assert.deepEqual(loadLocalSave(existing), state);
  assert.equal(existing.raw, before);
  assert.equal(existing.writes, 0);
  const corrupt = slot('{broken');
  assert.throws(() => loadLocalSave(corrupt), /JSON/);
  assert.equal(corrupt.raw, '{broken');
  assert.equal(corrupt.writes, 0);
});

test('a validated imported campaign remains separate until explicitly saved', async () => {
  const original = createGame({ maxTurns: 24, seed: 11 });
  const current = slot(JSON.stringify({ state: original }));
  let imported = createGame({ maxTurns: 64, seed: 99 });
  if (imported.pending?.kind === 'event') imported = performAction(imported, { type: 'acknowledgeEvent' }).state;
  imported = performAction(imported, { type: 'build', id: 'workshop' }).state;
  const raw = JSON.stringify({ state: imported });
  const candidate = await readSaveFile(new Blob([raw], { type: 'application/json' }));
  assert.deepEqual(candidate, imported);
  assert.deepEqual(loadLocalSave(current), original);
  assert.equal(current.writes, 0);
  storeLocalSave(current, candidate);
  assert.deepEqual(loadLocalSave(current), imported);
  assert.equal(current.writes, 1);
});

test('invalid, empty and oversized imports are rejected without reading oversized data', async () => {
  let read = false;
  await assert.rejects(readSaveFile({ size: MAX_SAVE_FILE_BYTES + 1, text() { read = true; } }), /2 MB/);
  assert.equal(read, false);
  await assert.rejects(readSaveFile(new Blob([])), /为空/);
  await assert.rejects(readSaveFile(new Blob(['not json'])), /JSON/);
  await assert.rejects(readSaveFile(new Blob(['{}'])), /不兼容|不完整/);
});

test('the event-history save slot rejects old formats without rewriting their source', () => {
  assert.equal(SAVE_KEY, 'chongzhen-industry.save.v10');
  for (const version of [4, 5, 6, 7, 8, 9]) {
    const legacy = { ...createGame(), version };
    const raw = JSON.stringify({ state: legacy });
    const existing = slot(raw);
    assert.throws(() => loadLocalSave(existing), /不兼容|不完整/);
    assert.equal(existing.raw, raw);
    assert.equal(existing.writes, 0);
  }
});

test('reading and confirming a saved event preserve its already-issued reward', async () => {
  let state;
  for (let seed = 1; seed <= 1000; seed++) {
    const candidate = createGame({ seed });
    if (candidate.events.history[0]?.eventId === 'corrupt_official') { state = candidate; break; }
  }
  assert.ok(state);
  const storage = slot();
  storeLocalSave(storage, state);
  const raw = storage.raw, imported = await readSaveFile(new Blob([raw], { type: 'application/json' }));
  assert.deepEqual(imported, state);
  assert.deepEqual(loadLocalSave(storage), state);
  assert.equal(storage.raw, raw); assert.equal(storage.writes, 1);
  const acknowledged = performAction(imported, { type: 'acknowledgeEvent' });
  assert.equal(acknowledged.error, undefined);
  storeLocalSave(storage, acknowledged.state);
  const restored = loadLocalSave(storage);
  assert.equal(restored.pending, null);
  assert.equal(restored.money, state.money);
  assert.deepEqual(restored.treasury, state.treasury);
  assert.deepEqual(restored.events, state.events);
});
