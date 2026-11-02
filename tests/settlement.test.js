import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createGame, FACILITIES } from '../src/game.js';
import { SETTLEMENT_DISTRICTS, facilityArt, settlementScene } from '../src/settlement.js';

const districtIds = SETTLEMENT_DISTRICTS.map(district => district.id);
const layers = html => [...html.matchAll(/<image\b[^>]*class="estate-district(?: is-revealing)?"[^>]*data-facility="([^"]+)"[^>]*>/g)];
const baseImage = html => html.match(/<image\b[^>]*class="estate-base"[^>]*>/)?.[0];
const maskIds = html => [...html.matchAll(/<mask\b[^>]*id="district-([^"]+)"/g)].map(match => match[1]);

test('nine building families have distinct landscape crops from the unchanged original town panorama', () => {
  const familyIds = [...new Set(FACILITIES.map(facility => facility.buildingId))];
  assert.equal(SETTLEMENT_DISTRICTS.length, 9);
  assert.equal(new Set(districtIds).size, 9);
  assert.deepEqual(districtIds.toSorted(), familyIds.toSorted());
  const originalUrl = new URL('../assets/estate-panorama-complete.png', import.meta.url).href;
  const crops = new Set();
  for (const district of SETTLEMENT_DISTRICTS) {
    const { x, y, width, height } = district.crop;
    assert.ok([x, y, width, height].every(Number.isFinite));
    assert.ok(x >= 0 && y >= 0 && width > height && height > 0, `${district.id} retains a landscape crop`);
    assert.ok(x + width <= 1586 && y + height <= 992, `${district.id} crop stays inside the original image`);
    const viewBox = `${x} ${y} ${width} ${height}`;
    crops.add(viewBox);
    const art = facilityArt(district.id);
    assert.match(art, /<svg class="estate-district-thumb"/);
    assert.ok(art.includes(`data-facility="${district.id}"`));
    assert.ok(art.includes(`viewBox="${viewBox}"`));
    assert.match(art, /preserveAspectRatio="xMidYMid slice"/);
    assert.ok(art.includes(`href="${originalUrl}"`));
    assert.match(art, /<image\b[^>]*width="1586" height="992"/);
    assert.equal((art.match(/<image\b/g) || []).length, 1);
  }
  assert.equal(crops.size, 9, 'different families must not all fall back to the same district portrait');
  assert.equal(facilityArt('unknown-building'), '');
});

test('an unbuilt town stays empty and each individually constructed family reveals only its own masked district', () => {
  const empty = createGame(), emptyHtml = settlementScene(empty, FACILITIES);
  assert.deepEqual(layers(emptyHtml), []);
  assert.deepEqual(maskIds(emptyHtml), []);
  assert.match(emptyHtml, /data-built-count="0"/);
  assert.match(baseImage(emptyHtml), /estate-panorama-unbuilt\.png/);
  for (const district of SETTLEMENT_DISTRICTS) {
    const state = createGame(); state.facilities[district.id] = 1;
    const before = structuredClone(state);
    const html = settlementScene(state, FACILITIES, { revealFacilityId: district.id });
    const visible = layers(html);
    assert.deepEqual(visible.map(match => match[1]), [district.id]);
    assert.match(visible[0][0], /is-revealing/);
    assert.ok(visible[0][0].includes(`mask="url(#district-${district.id})"`));
    assert.deepEqual(maskIds(html), [district.id]);
    assert.ok(html.includes(`d="${district.outline}"`));
    assert.match(html, /data-built-count="1"/);
    assert.match(baseImage(html), /estate-panorama-unbuilt\.png/);
    assert.doesNotMatch(html, /estate-completion-surround/);
    assert.deepEqual(state, before, 'drawing the town does not mutate construction state');
    const unbuiltId = districtIds.find(id => id !== district.id);
    for (const revealFacilityId of ['unknown-building', unbuiltId]) {
      assert.doesNotMatch(settlementScene(state, FACILITIES, { revealFacilityId }), /is-revealing/, 'only an actually built district can animate');
    }
  }
});

test('any incomplete set of up to eight families retains the empty base and exactly its constructed districts', () => {
  for (const order of [districtIds, districtIds.toReversed()]) for (let count = 1; count < order.length; count++) {
    const constructed = order.slice(0, count);
    const state = createGame();
    for (const id of constructed) state.facilities[id] = 1;
    const html = settlementScene(state, FACILITIES);
    assert.deepEqual(layers(html).map(match => match[1]).toSorted(), constructed.toSorted());
    assert.deepEqual(maskIds(html).toSorted(), constructed.toSorted());
    assert.match(baseImage(html), /estate-panorama-unbuilt\.png/);
    assert.ok(html.includes(`data-built-count="${count}"`));
    assert.doesNotMatch(html, /is-complete|is-revealing|estate-completion-surround/);
  }
});

test('whichever family is built last fades above the masked completed surroundings before the whole original town appears', () => {
  const state = createGame();
  for (const id of districtIds) state.facilities[id] = 1;
  for (const latest of districtIds) {
    const html = settlementScene(state, FACILITIES, { revealFacilityId: latest }), visible = layers(html);
    assert.match(baseImage(html), /estate-panorama-unbuilt\.png/);
    assert.deepEqual(visible.map(match => match[1]).toSorted(), districtIds.toSorted());
    assert.deepEqual(visible.filter(match => /is-revealing/.test(match[0])).map(match => match[1]), [latest]);
    assert.equal(visible.at(-1)[1], latest, 'the newest construction remains above the completed surroundings');
    assert.match(html, /class="estate-completion-surround"[^>]*mask="url\(#district-surround\)"/);
    assert.match(html, /data-built-count="9"/);
  }
  const finished = settlementScene(state, FACILITIES);
  assert.match(baseImage(finished), /estate-panorama-complete\.png/);
  assert.deepEqual(layers(finished), []);
  assert.doesNotMatch(finished, /is-revealing|estate-completion-surround/);
});

test('higher numeric levels keep one district per family and a direct high-level first construction can reveal that district', () => {
  for (const familyId of districtIds) {
    const highest = Math.max(...FACILITIES.filter(facility => facility.buildingId === familyId).map(facility => facility.level));
    const state = createGame(); state.facilities[familyId] = 1;
    const levelOne = settlementScene(state, FACILITIES);
    state.facilities[familyId] = highest;
    const upgraded = settlementScene(state, FACILITIES);
    assert.equal(upgraded, levelOne, 'an upgrade preserves the existing city district without adding or replaying a layer');
    const firstConstruction = settlementScene(state, FACILITIES, { revealFacilityId: familyId });
    assert.deepEqual(layers(firstConstruction).map(match => match[1]), [familyId]);
    assert.match(layers(firstConstruction)[0][0], /is-revealing/);
    assert.match(firstConstruction, /data-built-count="1"/);
  }
});

test('runtime town and building views do not replace the original panorama with the isolated building atlas', () => {
  const sourceDirectory = new URL('../src/', import.meta.url);
  for (const filename of readdirSync(sourceDirectory).filter(name => /\.(js|css)$/.test(name))) {
    const source = readFileSync(new URL(filename, sourceDirectory), 'utf8');
    assert.doesNotMatch(source, /estate-buildings\.png|building-portrait/, filename);
  }
});
