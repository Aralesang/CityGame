import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, advanceHours, snapshot } from '../src/simulation/world.js';

test('日程按小时推进，价格仅在午夜结算', () => {
  const world = createWorld();
  advanceHours(world, 8);
  const baker = world.npcs.find(n => n.id === 'mai');
  assert.ok(baker);
  assert.equal(baker.activity, 'work');
  advanceHours(world, 15);
  assert.equal(world.lastReport, null);
  assert.equal(world.market.bread.price, 4);
  const reports = advanceHours(world, 1);
  assert.deepEqual(world.time, { day: 2, hour: 0 });
  assert.equal(reports.length, 1);
  assert.equal(reports[0].goods.bread.produced, 16);
  assert.equal(reports[0].goods.bread.consumed, 4);
  assert.equal(reports[0].goods.bread.closingStock, 32);
  assert.ok(world.market.bread.price < 4);
  assert.equal(advanceHours(world, 48).length, 2);
});

test('原料断供传导到面包短缺和价格上涨', () => {
  const world = createWorld();
  world.market.wheat.stock = 0;
  world.market.bread.stock = 0;
  for (const npc of world.npcs.filter(n => n.job === 'farmer')) npc.workEnd = npc.workStart;
  const [report] = advanceHours(world, 24);
  assert.equal(report.goods.bread.produced, 0);
  assert.equal(report.goods.wheat.unmet, 8);
  assert.equal(report.goods.bread.unmet, 4);
  assert.equal(report.shortages.length, 4);
  assert.ok(world.market.bread.price > 4);
  assert.ok(world.npcs.every(n => n.needs.hunger === 48));
});

test('购买受资金限制，未满足需求保留', () => {
  const world = createWorld();
  const npc = world.npcs[0];
  npc.money = 0;
  npc.workEnd = npc.workStart;
  const [report] = advanceHours(world, 24);
  assert.equal(npc.money, 0);
  assert.equal(npc.needs.hunger, 48);
  assert.ok(report.shortages.some(s => s.npcId === npc.id));
});

test('100 天确定性、库存守恒与数值边界', () => {
  const world = createWorld();
  const reports = advanceHours(world, 2400);
  const other = createWorld();
  for (let i = 0; i < 100; i++) advanceHours(other, 24);
  assert.deepEqual(world, other);
  for (const report of reports) {
    for (const [id, row] of Object.entries(report.goods)) {
      assert.equal(row.closingStock, row.openingStock + row.produced - row.consumed);
      assert.ok(row.closingStock >= 0);
      assert.equal(row.demand, row.consumed + row.unmet);
      assert.ok(row.price >= world.market[id].basePrice * 0.5);
      assert.ok(row.price <= world.market[id].basePrice * 3);
    }
  }
  for (const npc of world.npcs) {
    assert.ok(Number.isFinite(npc.money) && npc.money >= 0);
    for (const need of Object.values(npc.needs)) assert.ok(need >= 0 && need <= 100);
  }
  const copy = snapshot(world);
  copy.npcs[0].money = -1;
  assert.notEqual(world.npcs[0].money, -1);
});

test('非法时间步长不会修改世界', () => {
  const world = createWorld();
  const before = snapshot(world);
  for (const hours of [-1, 1.5, NaN, Infinity]) assert.throws(() => advanceHours(world, hours), RangeError);
  assert.deepEqual(world, before);
});
