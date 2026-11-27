import { actorMap } from './simulation/actors.js';
import type { AdventureWorld, Controls, InventorySide, KeyResult } from './types.js';

import { saleStock, shopOpen } from './simulation/economy.js';
import { act } from './simulation/adventure.js';

/** 界面状态独立于世界：记录当前菜单、焦点栏及两栏各自的选择索引。 */
export const createControls = (): Controls => ({ mapOpen: false, mapX: 0, mapY: 0, interaction: null, interactionIndex: 0, shopId: null, containerId: null, dialogue: null, inspection: null, menu: null, side: 'chest', indices: { chest: 0, backpack: 0 } });
/** 从实时库存构建可见列表，只展示正数物品；不缓存，避免存取后数量过期。 */
export function itemRows(world: AdventureWorld, side: InventorySide, containerId?: string | null, shopId?: string | null) {
  const shop = shopId ? world.shops[shopId] : undefined;
  return Object.entries(world.market).map(([id, good]) => ({ id, name: good.name, price: good.price,
    quantity: side === 'chest' ? shop ? (shopOpen(world, shop) ? saleStock(world, shop, id) : 0)
      : (containerId ? world.containers[containerId]?.items[id]?.stock ?? 0 : 0) : world.player.inventory[id] || 0 }))
    .filter(item => item.quantity > 0 && (side === 'chest' || !shop || shop.buys.includes(item.id)));
}
/** 物品被取完后列表会缩短，将索引夹回有效范围；空列表索引固定为零。 */
function normalize(world: AdventureWorld, ui: Controls) {
  for (const side of ['chest', 'backpack'] as const) ui.indices[side] = Math.max(0, Math.min(ui.indices[side], itemRows(world, side, ui.containerId, ui.shopId).length - 1));
}
/** 把终端按键转换成领域行动。菜单浏览只修改 UI，实际操作统一交给 act。
 * Q 只关闭当前界面，在地图上不执行操作；未绑定的键直接忽略。 */
export function handleKey(world: AdventureWorld, ui: Controls, name: string): KeyResult {
  // 时间模式切换在任何界面都可用，不移动角色，也不关闭玩家正在查看的界面。
  if (name === 't') {
    world.clock.automatic = !world.clock.automatic;
    world.clock.actionUsed = false;
    if (world.clock.sleepUntil) { delete world.clock.sleepUntil; if (world.player.alive) world.player.activity = 'leisure'; }
    return { message: world.clock.automatic ? `自动模式：每 ${world.clock.intervalMs / 1000} 秒推进一小时。` : '行动模式：仅实际行动推进时间。', reports: [] };
  }
  // M 为独立地图覆盖界面，从背包或对话打开时保留原界面，关闭后原样返回。
  if (name === 'm') {
    ui.mapOpen = !ui.mapOpen;
    ui.mapX = world.player.position.x;
    ui.mapY = world.player.position.y;
    return {};
  }
  if (ui.mapOpen) {
    if (name === 'q') { ui.mapOpen = false; return {}; }
    const region = actorMap(world.map, world.player.position);
    // 方向键平移的是地图视野，保持真实 x/y 布局，不会移动玩家或改变朝向。
    if (name === 'up') ui.mapY--;
    if (name === 'down') ui.mapY++;
    if (name === 'left') ui.mapX--;
    if (name === 'right') ui.mapX++;
    if (name === 'pageup') ui.mapY -= 5;
    if (name === 'pagedown') ui.mapY += 5;
    if (name === 'home') { ui.mapX = world.player.position.x; ui.mapY = world.player.position.y; }
    if (name === 'end') { ui.mapX = region.rows[0].length - 1; ui.mapY = region.rows.length - 1; }
    ui.mapX = Math.max(0, Math.min(region.rows[0].length - 1, ui.mapX));
    ui.mapY = Math.max(0, Math.min(region.rows.length - 1, ui.mapY));
    return {};
  }
  // 与店员同样先打开人物交互选项，不用把普通对话替换成交易界面。
  if (ui.interaction) {
    const options = ui.interaction.shopId ? ['talk', 'open-trade'] : ['talk'];
    if (name === 'q') { ui.interaction = null; return {}; }
    if (name === 'up' || name === 'down') {
      ui.interactionIndex = (ui.interactionIndex + (name === 'up' ? -1 : 1) + options.length) % options.length;
      return {};
    }
    if (name !== 'f') return {};
    const npcId = ui.interaction.npcId;
    const result = act(world, { type: options[Math.min(ui.interactionIndex, options.length - 1)], npcId });
    ui.interaction = null;
    if (result.dialogue) ui.dialogue = result.dialogue;
    if (result.menu) { ui.menu = result.menu; ui.shopId = result.shopId ?? null; ui.side = 'chest'; ui.indices = { chest: 0, backpack: 0 }; }
    return result;
  }
  // 对话期间屏蔽移动和等待，F / Q 关闭；关闭操作本身不再次触发 NPC 交互。
  if (ui.dialogue !== null) {
    if (name === 'f' || name === 'q') ui.dialogue = null;
    return {};
  }
  // 检查界面为只读弹层，E / F / Q 关闭，其他操作不穿透到世界。
  if (ui.inspection !== null) {
    if (['e', 'f', 'q'].includes(name)) ui.inspection = null;
    return {};
  }
  // Q 只负责返回地图，不提供退出游戏的快捷键，也不消耗时间。
  if (name === 'q') {
    if (ui.menu) { ui.menu = null; ui.containerId = null; ui.shopId = null; return { message: '已关闭物品界面。', reports: [] }; }
    return {};
  }
  // 物品界面独占按键，空格和 E 不会在浏览物品时意外推进时间。
  if (ui.menu) {
    normalize(world, ui);
    if (ui.menu !== 'backpack' && ['left', 'right'].includes(name)) ui.side = name === 'left' ? 'chest' : 'backpack';
    if (['up', 'down'].includes(name)) {
      const size = itemRows(world, ui.side, ui.containerId, ui.shopId).length;
      if (size) ui.indices[ui.side] = (ui.indices[ui.side] + (name === 'up' ? -1 : 1) + size) % size;
    }
    // F 才提交转移或使用命令；空栏保持原状，操作后重新校正两栏选择位置。
    if (name !== 'f') return {};
    const item = itemRows(world, ui.side, ui.containerId, ui.shopId)[ui.indices[ui.side]];
    if (!item) return { message: '这里没有物品。', reports: [] };
    const result = act(world, ui.menu === 'shop'
      ? { type: ui.side === 'chest' ? 'buy' : 'sell', good: item.id, shopId: ui.shopId ?? undefined }
      : ui.menu === 'chest'
      ? { type: 'transfer', direction: ui.side === 'chest' ? 'take' : 'deposit', good: item.id, containerId: ui.containerId ?? undefined }
      : { type: 'use', good: item.id });
    normalize(world, ui);
    return result;
  }
  const directions: Record<string, string> = { w: 'n', s: 's', a: 'w', d: 'e' };
  let result;
  // WASD 固定移动，光标键固定原地转向；不使用组合键，也不需要切换输入模式。
  const turns: Record<string, string> = { up: 'n', down: 's', left: 'w', right: 'e' };
  if (Object.hasOwn(directions, name)) {
    result = act(world, { type: 'move', direction: directions[name] });
  }
  else if (Object.hasOwn(turns, name)) result = act(world, { type: 'turn', direction: turns[name] });
  // 空格复用统一等待行动，保持位置不变，同时推进所有角色与午夜结算。
  else if (name === 'space' || name === ' ') result = act(world, { type: 'wait', hours: 1 });
  // 句点键不耗时地选中脚下，避免为了检查脚下必须先等待一小时。
  else if (name === '.' || name === 'period') result = act(world, { type: 'target-self' });
  else if (name === 'e') {
    result = act(world, { type: 'inspect' });
    ui.inspection = result.message;
    // 详情由独立界面完整显示，不挤入可能只有一行的近期消息区域。
    return { ok: result.ok, reports: result.reports };
  }
  // B 独立打开背包，不复用 F 的场景交互入口。
  else if (name === 'b') result = act(world, { type: 'backpack' });
  else if (name === 'f') result = act(world, { type: 'interact' });
  else return {};
  if (result.interaction) { ui.interaction = result.interaction; ui.interactionIndex = 0; }
  if (result.dialogue) ui.dialogue = result.dialogue;
  // 打开新菜单时重置两栏索引，箱子聚焦左栏，背包聚焦右栏。
  if (result.menu) {
    ui.menu = result.menu;
    ui.containerId = result.containerId ?? null;
    ui.shopId = result.shopId ?? null;
    ui.side = result.menu !== 'backpack' ? 'chest' : 'backpack';
    ui.indices = { chest: 0, backpack: 0 };
  }
  return result;
}
