import test from 'node:test';
import assert from 'node:assert/strict';
import { PROJECTS } from '../src/technology.js';

const BACKGROUND_FIELDS = ['description', 'technical', 'historical'];
const GAME_COMMENTARY = /本局|游戏|架空|穿越|解锁|回合|节点|验收成功|科技完成|玩家/;

test('technology background describes knowledge rather than explaining the game', () => {
  for (const project of PROJECTS) {
    for (const field of BACKGROUND_FIELDS) {
      const text = project[field];
      assert.ok(typeof text === 'string' && text.trim(), `${project.id}.${field} must provide background information`);
      assert.doesNotMatch(text, GAME_COMMENTARY, `${project.id}.${field} contains gameplay commentary`);
    }
  }
});
