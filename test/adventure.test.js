import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdventure, act, observe } from '../src/simulation/adventure.js';
import { nextStep, samePosition, regionId } from '../src/simulation/actors.js';

function walkTo(world, target) {
  for (let count = 0; !samePosition(world.player.position, target); count++) {
    assert.ok(count < 100, '目标必须可达');
    const step = nextStep(world.map, world.player.position, target);
    assert.ok(step);
    const direction = step.dx === 1 ? 'e' : step.dx === -1 ? 'w' : step.dy === 1 ? 's' : 'n';
    assert.equal(act(world, { type: 'move', direction }).ok, true);
  }
}

function goToWarehouse(world) {
  walkTo(world, world.map.places['公共箱子']);
}

test('走出住所，NPC 同步移动并在抵达工作地点后生产', () => {
  const world = createAdventure();
  assert.deepEqual(world.time, { day: 1, hour: 7 });
  const farmer = world.npcs.find(npc => npc.id === 'lin');
  const before = { ...farmer.position };
  act(world, { type: 'move', direction: 'e' });
  assert.deepEqual(world.player.position, { x: 3, y: 4, mapId: 'home:你的住所' });
  assert.notDeepEqual(farmer.position, before);
  assert.equal(farmer.workHours, 0);
  act(world, { type: 'wait', hours: 8 });
  assert.deepEqual(farmer.position, { x: 6, y: 2, mapId: 'town' });
  assert.ok(farmer.workHours > 0);
});

test('观察与无效行动不推进时间或修改状态', () => {
  const world = createAdventure();
  const before = structuredClone(world);
  assert.ok(observe(world).map.includes('@'));
  for (const action of [{ type: 'take', good: 'bread' }, { type: 'use', good: 'bread' },
    { type: 'wait', hours: NaN }, { type: 'move', direction: 'bad' }, { type: 'unknown' }]) {
    assert.equal(act(world, action).ok, false);
  }
  assert.deepEqual(world, before);
  walkTo(world, { x: 1, y: 1, mapId: 'home:你的住所' });
  const atEdge = structuredClone(world);
  assert.equal(act(world, { type: 'move', direction: 'w' }).ok, false);
  assert.deepEqual(world, atEdge);
});

test('拿取并使用物资减少公共库存、缓解玩家需求', () => {
  const world = createAdventure();
  goToWarehouse(world);
  const stock = world.market.bread.stock;
  assert.equal(act(world, { type: 'take', good: 'bread' }).ok, true);
  assert.equal(world.market.bread.stock, stock - 1);
  assert.equal(world.player.inventory.bread, 1);
  const hunger = world.player.needs.hunger;
  act(world, { type: 'use', good: 'bread' });
  assert.equal(world.player.inventory.bread, 0);
  assert.equal(world.player.needs.hunger, Math.max(0, hunger - 25) + 2);
});

test('玩家取走物资影响次日库存和价格', () => {
  const taken = createAdventure();
  const baseline = createAdventure();
  for (const world of [taken, baseline]) goToWarehouse(world);
  act(taken, { type: 'take', good: 'bread' });
  act(baseline, { type: 'wait' });
  for (const world of [taken, baseline]) act(world, { type: 'wait', hours: 24 - world.time.hour });
  assert.equal(taken.market.bread.stock, baseline.market.bread.stock - 1);
  assert.ok(taken.market.bread.price > baseline.market.bread.price);
  assert.equal(taken.lastReport.day, 1);
});

test('睡眠需回到住所，统一快进所有角色', () => {
  const world = createAdventure();
  act(world, { type: 'move', direction: 'e' });
  assert.equal(act(world, { type: 'sleep' }).ok, false);
  act(world, { type: 'move', direction: 'w' });
  const result = act(world, { type: 'sleep' });
  assert.deepEqual(world.time, { day: 2, hour: 6 });
  assert.equal(result.reports.length, 1);
  assert.ok(world.player.needs.thirst > 0);
  assert.equal(world.player.activity, 'leisure');
});

test('每间民居都可从门进入并原路离开，室内外互相隔离', () => {
  const world = createAdventure();
  for (const door of world.map.entrances) {
    const bed = world.map.places[door.name];
    walkTo(world, bed);
    const view = observe(world);
    assert.equal(view.indoors, true);
    assert.equal(view.regionName, door.name);
    assert.ok(view.map.includes('D'));
    assert.ok(view.map.includes('t'));
    assert.ok(view.nearby.every(npc => regionId(npc.position) === regionId(bed)));
    if (door.name !== '你的住所') {
      const before = structuredClone(world);
      assert.equal(act(world, { type: 'sleep' }).ok, false);
      assert.deepEqual(world, before);
    }
    walkTo(world, door);
    assert.equal(observe(world).indoors, false);
    // 从出口外站位退开再走回门，自动进入对应房间。
    act(world, { type: 'move', direction: 's' });
    act(world, { type: 'move', direction: 'n' });
    assert.equal(regionId(world.player.position), regionId(bed));
  }
});

test('室内墙壁与桌椅阻挡行动，失败不耗时；地板不能睡觉', () => {
  const world = createAdventure();
  walkTo(world, { x: 1, y: 1, mapId: 'home:你的住所' });
  const before = structuredClone(world);
  assert.equal(act(world, { type: 'move', direction: 'n' }).ok, false);
  assert.deepEqual(world, before);
  walkTo(world, { x: 3, y: 1, mapId: 'home:你的住所' });
  const atTable = structuredClone(world);
  assert.equal(act(world, { type: 'move', direction: 'e' }).ok, false);
  assert.equal(act(world, { type: 'sleep' }).ok, false);
  assert.deepEqual(world, atTable);
});

test('NPC 穿过房门上班并在夜间回到自己的床铺', () => {
  const world = createAdventure();
  act(world, { type: 'wait', hours: 8 });
  assert.ok(world.npcs.some(npc => regionId(npc.position) === 'town' && npc.workHours > 0));
  act(world, { type: 'wait', hours: 12 });
  for (const npc of world.npcs) {
    assert.ok(samePosition(npc.position, world.map.places[npc.home]), `${npc.name} 应已回到床铺`);
    assert.equal(npc.activity, 'sleep');
  }
});
