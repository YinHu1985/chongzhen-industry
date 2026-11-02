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

test('an existing browser slot migrates v4 in memory without overwriting the source', () => {
  const legacy = createGame({ seed: 812 });
  legacy.version = 4; delete legacy.enemyStrength; delete legacy.warfare;
  delete legacy.treasury; delete legacy.lastSettlement;
  legacy.plannedEvents = [1, 2, 3].map(stage => ({ id: `crisis_${stage}`, stage,
    turn: stage * 6, title: '旧军报', description: '地方请求援军。' }));
  const raw = JSON.stringify({ state: legacy });
  const existing = slot(raw), restored = loadLocalSave(existing);
  assert.equal(restored.version, 6); assert.equal(restored.status, 'playing');
  assert.deepEqual(restored.projects, legacy.projects);
  assert.equal(existing.raw, raw); assert.equal(existing.writes, 0);
  storeLocalSave(existing, restored);
  assert.deepEqual(loadLocalSave(existing), restored); assert.equal(existing.writes, 1);
});

test('the original browser slot also accepts v5 and starts finance history only after migration', () => {
  const legacy = createGame({ seed: 441 });
  legacy.version = 5; delete legacy.treasury; delete legacy.lastSettlement;
  const raw = JSON.stringify({ state: legacy });
  const existing = slot(raw), restored = loadLocalSave(existing);
  assert.equal(restored.version, 6); assert.equal(restored.money, legacy.money);
  assert.deepEqual(restored.treasury, { entries: [], nextId: 1 });
  assert.equal(restored.lastSettlement, null);
  assert.equal(existing.raw, raw); assert.equal(existing.writes, 0);
});
