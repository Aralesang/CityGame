import type { AdventureWorld, Controls, InventorySide, KeyResult } from './types.js';

import { act } from './simulation/adventure.js';

/** 界面状态独立于世界：记录当前菜单、焦点栏及两栏各自的选择索引。 */
export const createControls = (): Controls => ({ menu: null, side: 'chest', indices: { chest: 0, backpack: 0 } });
/** 从实时库存构建可见列表，只展示正数物品；不缓存，避免存取后数量过期。 */
export function itemRows(world: AdventureWorld, side: InventorySide) {
  return Object.entries(world.market).map(([id, good]) => ({ id, name: good.name,
    quantity: side === 'chest' ? world.chest.items[id].stock : world.player.inventory[id] || 0 }))
    .filter(item => item.quantity > 0);
}
/** 物品被取完后列表会缩短，将索引夹回有效范围；空列表索引固定为零。 */
function normalize(world: AdventureWorld, ui: Controls) {
  for (const side of ['chest', 'backpack'] as const) ui.indices[side] = Math.max(0, Math.min(ui.indices[side], itemRows(world, side).length - 1));
}
/** 把终端按键转换成领域行动。菜单浏览只修改 UI，实际操作统一交给 act。
 * Esc 优先关闭菜单，地图上的 Esc 与 Q 才退出；未绑定的键直接忽略。 */
export function handleKey(world: AdventureWorld, ui: Controls, name: string): KeyResult {
  if (name === 'escape') {
    // 物品界面独占方向键，避免浏览物品时同时移动地图角色。
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
    // Z 才提交转移或使用命令；空栏保持原状，操作后重新校正两栏选择位置。
    if (name !== 'z') return {};
    const item = itemRows(world, ui.side)[ui.indices[ui.side]];
    if (!item) return { message: '这里没有物品。', reports: [] };
    const result = act(world, ui.menu === 'chest'
      ? { type: 'transfer', direction: ui.side === 'chest' ? 'take' : 'deposit', good: item.id }
      : { type: 'use', good: item.id });
    normalize(world, ui);
    return result;
  }
  const directions: Record<string, string> = { up: 'n', down: 's', left: 'w', right: 'e' };
  let result;
  if (Object.hasOwn(directions, name)) result = act(world, { type: 'move', direction: directions[name] });
  else if (name === 'z') result = act(world, { type: 'interact' });
  else return {};
  // 打开新菜单时重置两栏索引，箱子聚焦左栏，背包聚焦右栏。
  if (result.menu) {
    ui.menu = result.menu;
    ui.side = result.menu === 'chest' ? 'chest' : 'backpack';
    ui.indices = { chest: 0, backpack: 0 };
  }
  return result;
}
