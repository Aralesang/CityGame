import { act } from './simulation/adventure.js';

export const createControls = () => ({ menu: null, side: 'chest', indices: { chest: 0, backpack: 0 } });
export function itemRows(world, side) {
  return Object.entries(world.market).map(([id, good]) => ({ id, name: good.name,
    quantity: side === 'chest' ? world.chest.items[id].stock : world.player.inventory[id] || 0 }))
    .filter(item => item.quantity > 0);
}
function normalize(world, ui) {
  for (const side of ['chest', 'backpack']) ui.indices[side] = Math.max(0, Math.min(ui.indices[side], itemRows(world, side).length - 1));
}
export function handleKey(world, ui, name) {
  if (name === 'escape') {
    if (ui.menu) { ui.menu = null; return { message: '已关闭物品界面。', reports: [] }; }
    return { quit: true };
  }
  if (name === 'q') return { quit: true };
  if (ui.menu) {
    normalize(world, ui);
    if (ui.menu === 'chest' && ['left', 'right'].includes(name)) ui.side = name === 'left' ? 'chest' : 'backpack';
    if (['up', 'down'].includes(name)) {
      const size = itemRows(world, ui.side).length;
      if (size) ui.indices[ui.side] = (ui.indices[ui.side] + (name === 'up' ? -1 : 1) + size) % size;
    }
    if (name !== 'z') return {};
    const item = itemRows(world, ui.side)[ui.indices[ui.side]];
    if (!item) return { message: '这里没有物品。', reports: [] };
    const result = act(world, ui.menu === 'chest'
      ? { type: 'transfer', direction: ui.side === 'chest' ? 'take' : 'deposit', good: item.id }
      : { type: 'use', good: item.id });
    normalize(world, ui);
    return result;
  }
  const directions = { up: 'n', down: 's', left: 'w', right: 'e' };
  let result;
  if (Object.hasOwn(directions, name)) result = act(world, { type: 'move', direction: directions[name] });
  else if (name === 'z') result = act(world, { type: 'interact' });
  else return {};
  if (result.menu) {
    ui.menu = result.menu;
    ui.side = result.menu === 'chest' ? 'chest' : 'backpack';
    ui.indices = { chest: 0, backpack: 0 };
  }
  return result;
}
