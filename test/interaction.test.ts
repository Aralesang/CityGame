import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdventure, act } from '../src/simulation/adventure.js';
import { createControls, handleKey } from '../src/controls.js';
import { layout, displayWidth } from '../src/terminal-layout.js';

// 操作打开界面不耗时；物品使用才消耗一份并推进世界。
test('B 独立打开背包，F 使用食物恢复饱腹', () => {
  const world = createAdventure({ automatic: false }); const ui = createControls();
  world.player.needs.hunger = 40;
  const quantity = world.player.inventory.bread;
  const hour = world.time.hour;
  handleKey(world, ui, 'b');
  assert.equal(ui.menu, 'backpack');
  assert.equal(world.time.hour, hour);
  handleKey(world, ui, 'f');
  assert.equal(world.player.inventory.bread, quantity - 1);
  assert.ok(world.player.needs.hunger > 40);
  handleKey(world, ui, 'q');
  assert.equal(ui.menu, null);
});

test('家用箱子独立库存，其他居民的箱子不可无偿拿取', () => {
  const world = createAdventure({ automatic: false });
  const own = Object.values(world.containers).find(container => container.ownerId === world.player.id)!;
  const other = Object.values(world.containers).find(container => container.ownerId && container.ownerId !== world.player.id)!;
  assert.notEqual(own.items, other.items);
  world.player.position = { ...other.position };
  assert.equal(act(world, { type: 'transfer', containerId: other.id, direction: 'take', good: 'bread' }).ok, false);
});

test('店铺界面交易扣金币，不把买货当作免费拿取', () => {
  const world = createAdventure({ automatic: false }); const ui = createControls();
  world.time.hour = 16;
  const shop = Object.values(world.shops).find(shop => shop.stockGoods.includes('bread'))!;
  const clerk = world.npcs.find(npc => npc.id === shop.ownerId)!;
  clerk.position = { ...shop.counter }; clerk.activity = 'selling';
  world.player.position = { ...shop.counter, x: shop.counter.x - 1 };
  world.player.facing = 'e';
  const money = world.player.money;
  const quantity = world.player.inventory.bread;
  handleKey(world, ui, 'f');
  assert.ok(ui.interaction?.shopId);
  handleKey(world, ui, 'down'); handleKey(world, ui, 'f');
  assert.equal(ui.menu, 'shop');
  handleKey(world, ui, 'f');
  assert.ok(world.player.money < money);
  assert.equal(world.player.inventory.bread, quantity + 1);
  handleKey(world, ui, 'q');
  assert.equal(ui.menu, null);
});

test('菜单在标准终端尺寸内无溢出', () => {
  const world = createAdventure({ automatic: false }); const ui = createControls();
  for (const [columns, rows] of [[64,26],[80,30],[120,40]]) {
    const lines = layout(world, [], columns, rows, ui);
    assert.equal(lines.length, rows);
    assert.ok(lines.every(line => displayWidth(line) === columns - 1));
  }
});
