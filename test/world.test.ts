import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, advanceHours, snapshot } from '../src/simulation/world.js';
import { totalGold, buyFromShop, saleStock, refreshEconomy } from '../src/simulation/economy.js';
import { tickNeeds } from '../src/simulation/actors.js';
import { goods, rules } from '../src/data/config.js';

// 金币只转移不生成，价格按整数金币结算；此用例同时覆盖自动生产与采购。
test('社会运行前后金币总量恒定，生产与交易不产生金币', () => {
  const world = createWorld();
  const initial = totalGold(world);
  advanceHours(world, rules.hoursPerDay * 5);
  assert.equal(totalGold(world), initial);
  assert.equal(world.initialGold, initial);
  for (const npc of world.npcs) assert.ok(Number.isSafeInteger(npc.money) && npc.money >= 0);
});

test('店铺交易同时转移实际商品与金币，失败时不改变双方', () => {
  const world = createWorld();
  world.time.hour = 16;
  const shop = Object.values(world.shops).find(shop => shop.stockGoods.includes('bread'))!;
  const seller = world.npcs.find(npc => npc.id === shop.ownerId)!;
  const buyer = world.npcs.find(npc => npc.id !== seller.id)!;
  seller.position = { ...shop.counter }; seller.activity = 'selling';
  buyer.position = { ...shop.counter, x: shop.counter.x - 1 };
  const beforeGold = totalGold(world);
  const before = { money: buyer.money, sellerMoney: seller.money, bread: buyer.inventory.bread, stock: world.containers[shop.containerId].items.bread.stock };
  assert.ok(saleStock(world, shop, 'bread') > 0);
  assert.equal(buyFromShop(world, buyer, shop, 'bread'), 1);
  assert.equal(buyer.money, before.money - goods.bread.basePrice);
  assert.equal(seller.money, before.sellerMoney + goods.bread.basePrice);
  assert.equal(buyer.inventory.bread, before.bread + 1);
  assert.equal(world.containers[shop.containerId].items.bread.stock, before.stock - 1);
  assert.equal(totalGold(world), beforeGold);
  buyer.money = 0;
  const copy = snapshot(world);
  assert.equal(buyFromShop(world, buyer, shop, 'bread'), 0);
  assert.deepEqual(world, copy);
});

// 生命规则与角色身份无关，满值代表状态良好，零值才产生伤害。
test('饱腹与水分逐时下降，归零扣血，死亡后不再消耗', () => {
  const world = createWorld();
  const npc = world.npcs[0];
  const before = { ...npc.needs };
  tickNeeds(npc);
  assert.ok(npc.needs.hunger < before.hunger && npc.needs.thirst < before.thirst);
  assert.equal(npc.health, npc.maxHealth);
  npc.needs.hunger = 0;
  npc.needs.thirst = 0;
  npc.health = 1;
  tickNeeds(npc);
  assert.equal(npc.alive, false);
  assert.equal(npc.health, 0);
  const dead = structuredClone(npc);
  tickNeeds(npc);
  assert.deepEqual(npc, dead);
});

test('库存统计只是个人物品与容器物品之和，不是公共库存', () => {
  const world = createWorld();
  refreshEconomy(world);
  for (const id of Object.keys(goods)) {
    const total = world.npcs.reduce((sum, npc) => sum + (npc.inventory[id] ?? 0), 0)
      + Object.values(world.containers).reduce((sum, chest) => sum + chest.items[id].stock, 0);
    assert.equal(world.market[id].stock, total);
  }
});

test('非法时间步长不修改世界', () => {
  const world = createWorld();
  const before = snapshot(world);
  for (const hours of [-1, 1.5, NaN, Infinity]) assert.throws(() => advanceHours(world, hours), RangeError);
  assert.deepEqual(world, before);
});
