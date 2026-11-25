import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdventure, act } from '../src/simulation/adventure.js';
import { createControls, handleKey, itemRows } from '../src/controls.js';
import { nextStep, samePosition } from '../src/simulation/actors.js';
import { layout, displayWidth } from '../src/terminal-layout.js';
function atChest() {
  const world = createAdventure();
  while (!samePosition(world.player.position, world.chest.position)) {
    const step = nextStep(world.map, world.player.position, world.chest.position);
    act(world, { type: 'move', direction: step.dx === 1 ? 'e' : step.dx === -1 ? 'w' : step.dy === 1 ? 's' : 'n' });
  }
  return world;
}

test('只允许方向键移动；Z 根据床、地面物品、空地执行不同交互', () => {
  const world = createAdventure(); const ui = createControls();
  const initial = structuredClone(world);
  for (const key of ['w','a','s','d','e','r','1','2','space']) handleKey(world, ui, key);
  assert.deepEqual(world, initial);
  handleKey(world, ui, 'left');
  assert.equal(handleKey(world, ui, 'z').ok, true);
  assert.equal(world.player.inventory.bread, 1);
  assert.equal(world.groundItems[0].quantity, 0);
  const time = { ...world.time };
  handleKey(world, ui, 'z');
  assert.equal(ui.menu, 'backpack');
  assert.deepEqual(world.time, time);
  handleKey(world, ui, 'z');
  assert.equal(world.player.inventory.bread, 0);
  handleKey(world, ui, 'escape');
  assert.equal(ui.menu, null);
  handleKey(world, ui, 'right');
  handleKey(world, ui, 'z');
  assert.deepEqual(world.time, { day: 2, hour: 6 });
});

test('打开和浏览箱子不耗时，Z 拿取与存回遵守物品守恒', () => {
  const world = atChest(); const ui = createControls();
  assert.equal(world.chest.items, world.market);
  const time = { ...world.time };
  handleKey(world, ui, 'z');
  assert.equal(ui.menu, 'chest');
  for (const key of ['right','down','left','down']) handleKey(world, ui, key);
  assert.deepEqual(world.time, time);
  assert.equal(itemRows(world, 'chest')[ui.indices.chest].id, 'bread');
  const stock = world.market.bread.stock;
  handleKey(world, ui, 'z');
  assert.equal(world.market.bread.stock, stock - 1);
  assert.equal(world.player.inventory.bread, 1);
  assert.equal(world.time.hour, time.hour + 1);
  handleKey(world, ui, 'right');
  handleKey(world, ui, 'z');
  assert.equal(world.market.bread.stock, stock);
  assert.equal(world.player.inventory.bread, 0);
  const before = structuredClone(world);
  handleKey(world, ui, 'z');
  assert.deepEqual(world, before);
  handleKey(world, ui, 'escape');
  assert.equal(ui.menu, null);
});

test('取完最后一个物品、空列表与重新存入仍可正常选择', () => {
  const world = atChest(); const ui = createControls();
  for (const good of Object.values(world.market)) good.stock = 0;
  world.market.water.stock = 1;
  handleKey(world, ui, 'z');
  handleKey(world, ui, 'z');
  assert.equal(itemRows(world, 'chest').length, 0);
  const before = structuredClone(world);
  for (const key of ['up','down','z']) handleKey(world, ui, key);
  assert.deepEqual(world, before);
  handleKey(world, ui, 'right'); handleKey(world, ui, 'z');
  assert.equal(world.market.water.stock, 1);
  handleKey(world, ui, 'left'); handleKey(world, ui, 'z');
  assert.equal(world.player.inventory.water, 1);
});

test('跨午夜转移仍统一结算，箱子与经济保持同一库存', () => {
  const world = atChest(); const ui = createControls();
  act(world, { type: 'wait', hours: 23 - world.time.hour });
  handleKey(world, ui, 'z');
  const result = handleKey(world, ui, 'z');
  assert.equal(result.reports.length, 1);
  assert.equal(world.time.hour, 0);
  assert.equal(world.chest.items, world.market);
  for (const good of Object.values(world.chest.items)) assert.ok(good.stock >= 0);
});

test('箱子远程转移被拒绝，物品界面在不同终端尺寸下无溢出', () => {
  const world = createAdventure(); const ui = createControls();
  assert.equal(act(world, { type: 'transfer', direction: 'deposit', good: 'bread' }).ok, false);
  for (const menu of [null,'chest','backpack']) {
    ui.menu = menu;
    for (const [columns, rows] of [[64,26],[80,30],[120,40]]) {
      const lines = layout(world, ['测试消息'], columns, rows, ui);
      assert.equal(lines.length, rows);
      assert.ok(lines.every(line => displayWidth(line) === columns - 1));
    }
  }
});
