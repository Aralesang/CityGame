import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdventure, act, observe } from '../src/simulation/adventure.js';
import { totalGold } from '../src/simulation/economy.js';

// 地图实例每次新世界使用独立 UUID，运行中的观察与转向不重建地图。
test('观察只读，原地转向不耗时且保留实例身份', () => {
  const world = createAdventure({ automatic: false });
  const before = structuredClone(world);
  observe(world);
  assert.deepEqual(world, before);
  const ids = Object.keys(world.map.instances);
  act(world, { type: 'turn', direction: 'n' });
  assert.deepEqual(world.time, before.time);
  assert.deepEqual(world.player.position, before.player.position);
  assert.deepEqual(Object.keys(world.map.instances), ids);
});

test('等待保留方向，世界与金币统计同步推进', () => {
  const world = createAdventure({ automatic: false });
  world.player.facing = 'w';
  const position = { ...world.player.position };
  act(world, { type: 'wait' });
  assert.equal(world.player.facing, 'w');
  assert.deepEqual(world.player.position, position);
  assert.equal(totalGold(world), world.initialGold);
});

test('死亡后实际操作被拒绝，检查仍可打开', () => {
  const world = createAdventure({ automatic: false });
  world.player.health = 0; world.player.alive = false; world.player.activity = 'dead';
  const before = structuredClone(world);
  assert.equal(act(world, { type: 'move', direction: 'e' }).ok, false);
  assert.equal(act(world, { type: 'use', good: 'bread' }).ok, false);
  assert.deepEqual(world, before);
  assert.equal(act(world, { type: 'inspect' }).ok, true);
});
