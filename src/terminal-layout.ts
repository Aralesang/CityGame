import { spatialMapLabels } from './map-directory.js';
import type { AdventureWorld, Controls, InventorySide } from './types.js';
import { createControls } from './controls.js';

import { observe, facingInfo, targetName } from './simulation/adventure.js';
import { carriedWeight } from './simulation/weight.js';
import { shopOpen } from './simulation/economy.js';
import { regionId } from './simulation/actors.js';
import { itemRows } from './controls.js';

import { rules } from './data/config.js';
const activityNames = rules.activityNames;
// 当前界面只包含 ASCII、中文和框线；框线必须按一列计算。
const charWidth = (character: string) => /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6]/u.test(character) ? 2 : 1;
/** 按终端显示列数计算长度，避免中文双宽字符导致边框错位。 */
export const displayWidth = (text: string) => [...text].reduce((sum, character) => sum + charWidth(character), 0);
/** 逐字符截断到指定显示宽度，再补空格；不会把双宽中文截成半个字符。 */
export function fit(text: string, width: number) {
  let result = '';
  let used = 0;
  for (const character of text) {
    const size = charWidth(character);
    if (used + size > width) break;
    result += character;
    used += size;
  }
  return result + ' '.repeat(Math.max(0, width - used));
}
/** 按显示列宽换行消息文本，每个输出片段都可直接交给面板排版。 */
function wrap(text: string, width: number) {
  const lines = [];
  let line = '';
  let used = 0;
  for (const character of text) {
    const size = charWidth(character);
    if (used + size > width) { lines.push(line); line = ''; used = 0; }
    line += character;
    used += size;
  }
  if (line) lines.push(line);
  return lines;
}

/** 根据当前终端尺寸构建一整帧字符串，不做 I/O，也不修改世界或 UI。
 * 主界面左右分栏，物品菜单切换到独立布局；过小窗口仅显示尺寸提示。 */
export function layout(world: AdventureWorld, messages: string[], columns: number, rows: number, ui: Controls = createControls()) {
  const width = Math.max(1, columns - 1); // 留一列，避免终端自动换行。
  if (width < 63 || rows < 26) {
    return ['窗口过小，请放大到至少 64 列 × 26 行。',
      `当前 ${columns} 列 × ${rows} 行；Q 关闭界面。`].slice(0, rows).map(line => fit(line, width));
  }
  if (ui.mapOpen) return spatialMapLayout(world, ui, width, rows);
  if (ui.interaction) {
    const options = ui.interaction.shopId ? ['对话', '交易'] : ['对话'];
    const lines = [`与${ui.interaction.name}交互`, '', ...options.map((label, index) => `${ui.interactionIndex === index ? '> ' : '  '}${label}`), '', '↑/↓ 选择  F 确认  Q 返回'];
    while (lines.length < rows) lines.push('');
    return lines.slice(0, rows).map(line => fit(line, width));
  }
  // 对话独占内容区，按宽度换行，避免内容被主界面的近期消息栏截掉。
  if (ui.dialogue !== null) {
    const lines = [`与${ui.dialogue.speaker}对话`, '', ...wrap(ui.dialogue.text, width), '', 'F / Q 结束对话（不耗时）'];
    while (lines.length < rows) lines.push('');
    return lines.slice(0, rows).map(line => fit(line, width));
  }
  // 检查详情独占内容区，窄终端也能完整换行显示物品名称、数量和用途。
  if (ui.inspection !== null) {
    const lines = [`目标检查 ${facingInfo[world.player.facing].symbol}${world.player.facing === 'self' ? '（脚下）' : '（相邻一格）'}`,  '', ...wrap(ui.inspection, width), '', 'E / F / Q 关闭检查'];
    while (lines.length < rows) lines.push('');
    return lines.slice(0, rows).map(line => fit(line, width));
  }
  if (ui.menu) return inventoryLayout(world, messages, width, rows, ui);
  const view = observe(world);
  const player = world.player;
  const leftWidth = Math.max(29, Math.floor(width * 0.48));
  const rightWidth = width - leftWidth - 1;
  const innerLeft = leftWidth - 4;
  const innerRight = rightWidth - 4;
  const border = (size: number, title: string, start = '├', end = '┤') => {
    const label = ` ${title} `;
    return start + label + '─'.repeat(size - 2 - displayWidth(label)) + end;
  };
  const content = (text: string, size: number) => '│ ' + fit(text, size - 4) + ' │';
  const left = Array.from({ length: rows }, () => content('', leftWidth));
  left[0] = border(leftWidth, view.indoors ? '房屋内部' : '世界地图', '┌', '┐');
  left[1] = content(view.regionName, leftWidth);
  // 地图变大后只绘制跟随玩家的可视窗口，避免被边框裁掉或覆盖图例；坐标仍是全图坐标。
  const fullMap = view.map.split('\n').map(row => [...row]);
  const visibleColumns = Math.min(fullMap[0].length, Math.max(1, Math.floor((innerLeft + 1) / 2)));
  const visibleRows = Math.min(fullMap.length, Math.max(1, rows - 9));
  const startX = Math.max(0, Math.min(fullMap[0].length - visibleColumns, player.position.x - Math.floor(visibleColumns / 2)));
  const startY = Math.max(0, Math.min(fullMap.length - visibleRows, player.position.y - Math.floor(visibleRows / 2)));
  left[2] = content(`视野 x${startX}～${startX + visibleColumns - 1} y${startY}～${startY + visibleRows - 1}`, leftWidth);
  const mapLines = fullMap.slice(startY, startY + visibleRows).map(row => row.slice(startX, startX + visibleColumns).join(' '));
  const top = 3 + Math.floor((rows - 9 - visibleRows) / 2);
  for (const [index, line] of mapLines.entries()) {
    const padding = Math.max(0, Math.floor((innerLeft - displayWidth(line)) / 2));
    left[top + index] = content(' '.repeat(padding) + line, leftWidth);
  }
  left[rows - 6] = border(leftWidth, '图例');
  // 图例由实体和地形配置生成；固定四行，只列当前可用空间的部分符号。
  const actorLegend = `${rules.symbols.player} 你  ${rules.symbols.npc} 居民  ${rules.symbols.item} 物品`;
  // 只展示当前地图中的道路、建筑和地形，森林不会混入小镇专有的农田等图例。
  const currentId = regionId(world.player.position);
  const entriesBySymbol = new Map<string, string>();
  for (const connection of world.map.connections.filter(connection => regionId(connection) === currentId)) {
    entriesBySymbol.set(connection.symbol, `${connection.symbol} ${connection.kind === 'door' ? '房门' : connection.kind === 'exit' ? '出口' : '道路'}`);
  }
  for (const place of Object.values(world.map.places).filter(place => regionId(place) === currentId)) {
    if (!entriesBySymbol.has(place.symbol)) entriesBySymbol.set(place.symbol, `${place.symbol} ${place.name ?? '地点'}`);
  }
  const entries = [...entriesBySymbol.values()];
  const legend = [actorLegend, ...Array.from({ length: 3 }, (_, index) => entries.slice(index * 2, index * 2 + 2).join('  '))];
  legend.forEach((line, index) => {
    left[rows - 5 + index] = content(line, leftWidth);
  });
  left[rows - 1] = '└' + '─'.repeat(leftWidth - 2) + '┘';

  const sections: [string, string[]][] = [
    ['时间与位置', [
      `第 ${view.time.day} 天  ${String(view.time.hour).padStart(2, '0')}:00 ${world.clock.automatic ? `自动 ${world.clock.intervalMs / 1000}秒/时` : '行动模式'}`,
      view.places.join('、') || '道路 / 野外',
      `坐标 (${player.position.x}, ${player.position.y})`,
    ]],
    ['角色状态', [
      `饱腹 ${player.needs.hunger}/${rules.needMax}  水分 ${player.needs.thirst}/${rules.needMax}`,
      `生命 ${player.health}/${player.maxHealth} 疲劳 ${player.needs.fatigue}`,
      `目标 ${facingInfo[player.facing].symbol} ${targetName(world)}`,
    ]],
    ['背包与金币', [
      `金币 ${player.money}  负重 ${carriedWeight(player)}/${player.maxCarryWeight}  ${player.alive ? '存活' : '已死亡'}`,
      `背包：${rules.summaryGoods.map(id => `${world.market[id].name} ${player.inventory[id] ?? 0}`).join('  ')}`,
      `营业店铺 ${Object.values(world.shops).filter(shop => shopOpen(world, shop)).length}`,
    ]],
    ['附近居民', Array.from({ length: 3 }, (_, index) => {
      const npc = view.nearby[index];
      return npc ? `${npc.name} ${activityNames[npc.activity]} → ${npc.destination}`
        : index === 0 ? '附近没有居民' : '';
    })],
    ['操作提示', [
      'WASD 移动 方向键 原地转向',
      '空格 等待1小时 E 检查目标',
      '. 脚下 F 交互 B 背包 M地图',
      'Q 关闭界面 T 自动/行动',
    ]],
  ];
  const right: string[] = [];
  for (const [title, lines] of sections) {
    right.push(border(rightWidth, title, right.length ? '├' : '┌', right.length ? '┤' : '┐'));
    for (const line of lines) right.push(content(line, rightWidth));
  }
  right.push(border(rightWidth, '近期消息'));
  // 消息使用右栏剩余行数；先换行再截取尾部，优先保留最新消息。
  const available = rows - right.length - 1;
  const logLines = messages.flatMap(message => wrap(message, innerRight)).slice(-available);
  for (let index = 0; index < available; index++) right.push(content(logLines[index] || '', rightWidth));
  right.push('└' + '─'.repeat(rightWidth - 2) + '┘');
  return left.map((line, index) => line + ' ' + right[index]);
}

/** 箱子/背包共用双栏面板；选中项超出可见区域时向下滚动，保证焦点始终可见。 */
function inventoryLayout(world: AdventureWorld, messages: string[], width: number, rows: number, ui: Controls) {
  const leftWidth = Math.floor((width - 1) / 2);
  const rightWidth = width - leftWidth - 1;
  const active = ui.side;
  const container = ui.containerId ? world.containers[ui.containerId] : undefined;
  const shop = ui.shopId ? world.shops[ui.shopId] : undefined;
  const owner = shop ? world.npcs.find(npc => npc.id === shop.ownerId) : undefined;
  const containerName = shop?.name ?? container?.name ?? '容器';
  const bodyRows = rows - 9;
  const panel = (side: InventorySide, size: number, title: string) => {
    const selected = ui.indices[side];
    const items = itemRows(world, side, ui.containerId, ui.shopId);
    const offset = Math.max(0, selected - bodyRows + 1);
    const label = ' ' + (active === side ? '> ' : '  ') + title + ' ';
    const result = ['┌' + label + '─'.repeat(size - 2 - displayWidth(label)) + '┐'];
    for (let index = 0; index < bodyRows; index++) {
      const item = items[offset + index];
      const text = item ? (active === side && offset + index === selected ? '> ' : '  ') + item.name + ' ×' + item.quantity + (shop ? ` ${item.price}金币` : '') + ` 重${world.market[item.id].weight}` : index === 0 && !items.length ? '（空）' : '';
      result.push('│ ' + fit(text, size - 4) + ' │');
    }
    result.push('└' + '─'.repeat(size - 2) + '┘');
    return result;
  };
  const left = panel('chest', leftWidth, ui.menu !== 'backpack' ? containerName : '物品说明');
  if (ui.menu === 'backpack') for (let index = 1; index < left.length - 1; index++) left[index] = '│ ' + fit(index === 1 ? '选择背包物品，按 F 使用。' : '', leftWidth - 4) + ' │';
  const right = panel('backpack', rightWidth, '你的背包');
  const lines = [fit(ui.menu === 'shop' ? `${containerName} · 你的金币 ${world.player.money} / 店主金币 ${owner?.money ?? 0}` : ui.menu === 'chest' ? `${containerName} · 双向存取（每次一份）` : '背包 · 使用物品', width),
    fit('第 ' + world.time.day + ' 天 ' + String(world.time.hour).padStart(2, '0') + ':00  负重 ' + carriedWeight(world.player) + '/' + world.player.maxCarryWeight + (world.clock.automatic ? '  自动计时，世界不会暂停' : '  实际操作耗时一小时'), width),
    fit('', width), ...left.map((line, index) => line + ' ' + right[index]),
    fit(ui.menu === 'shop' ? '←/→ 切换购买/出售  ↑/↓ 选择  F 交易一份' : ui.menu === 'chest' ? '←/→ 切换箱子与背包  ↑/↓ 选择  F 拿取/存入' : '↑/↓ 选择  F 使用', width),
    fit('Q 关闭界面 T 自动/行动', width),
    fit(messages.at(-1) || '', width)];
  while (lines.length < rows) lines.push(fit('', width));
  return lines.slice(0, rows);
}

/** 将真实地图按固定间距放大成文字格子：一个原始坐标对应一个固定大小区域。
 * 名称只在自己的格子内换行，同格多对象合并，不覆盖邻格，也不按名称重新排序。
 */
function spatialMapLayout(world: AdventureWorld, ui: Controls, width: number, rows: number): string[] {
  const region = world.map.regions[regionId(world.player.position)];
  const labels = spatialMapLabels(world);
  const cellWidth = 8;
  const gutter = 4;
  const bodyHeight = rows - 7;
  const cellHeight = Math.max(3, ...Object.values(labels).map(names => wrap(names.join(' / '), cellWidth).length));
  const columns = Math.min(region.rows[0].length, Math.max(1, Math.floor((width - gutter + 1) / (cellWidth + 1))));
  const visibleRows = Math.min(region.rows.length, Math.max(1, Math.floor(bodyHeight / cellHeight)));
  const startX = Math.max(0, Math.min(region.rows[0].length - columns, ui.mapX - Math.floor(columns / 2)));
  const startY = Math.max(0, Math.min(region.rows.length - visibleRows, ui.mapY - Math.floor(visibleRows / 2)));
  const center = (text: string): string => {
    const left = Math.max(0, Math.floor((cellWidth - displayWidth(text)) / 2));
    return fit(' '.repeat(left) + text, cellWidth);
  };
  const lines = [
    `地图 · ${region.name}  ${region.rows[0].length}×${region.rows.length}`,
    `你在 (${world.player.position.x},${world.player.position.y})，【你】标记当前位置`,
    `视野 x${startX}～${startX + columns - 1} / y${startY}～${startY + visibleRows - 1}；上北下南、左西右东`,
    ' '.repeat(gutter) + Array.from({ length: columns }, (_, index) => center(String(startX + index))).join(' '),
  ];
  for (let y = startY; y < startY + visibleRows; y++) {
    const cells = Array.from({ length: columns }, (_, index) => {
      const x = startX + index;
      const names = labels[`${x},${y}`];
      if (names) return wrap(names.join(' / '), cellWidth);
      // 背景保留边界和地形轮廓，可交互对象全部用名称替代单字图标。
      const place = world.map.cells[regionId(world.player.position)][`${x},${y}`];
      return [place.blocked ? '████' : place.symbol === '^' ? '░░' : '·'];
    });
    for (let line = 0; line < cellHeight; line++) {
      lines.push((line === 0 ? String(y).padStart(gutter - 1) + ' ' : ' '.repeat(gutter))
        + cells.map(cell => center(cell[line] ?? '')).join(' '));
    }
  }
  while (lines.length < rows - 3) lines.push('');
  lines.push('↑↓←→ 平移地图  PgUp/PgDn 纵向翻页', 'Home 回到你的位置  End 地图末端', 'M / Q 关闭；名称所在格与真实地图坐标完全对应');
  return lines.slice(0, rows).map(line => fit(line, width));
}
