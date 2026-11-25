import { observe } from './simulation/adventure.js';
import { itemRows } from './controls.js';

const activityNames = { work: '工作', sleep: '睡觉', leisure: '闲暇', rest: '休息' };
// 当前界面只包含 ASCII、中文和框线；框线必须按一列计算。
const charWidth = character => /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6]/u.test(character) ? 2 : 1;
export const displayWidth = text => [...text].reduce((sum, character) => sum + charWidth(character), 0);
export function fit(text, width) {
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
function wrap(text, width) {
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

export function layout(world, messages, columns, rows, ui = {}) {
  const width = Math.max(1, columns - 1); // 留一列，避免终端自动换行。
  if (width < 63 || rows < 26) {
    return ['窗口过小，请放大到至少 64 列 × 26 行。',
      `当前 ${columns} 列 × ${rows} 行；Q / Esc 退出。`].slice(0, rows).map(line => fit(line, width));
  }
  if (ui.menu) return inventoryLayout(world, messages, width, rows, ui);
  const view = observe(world);
  const player = world.player;
  const leftWidth = Math.max(29, Math.floor(width * 0.48));
  const rightWidth = width - leftWidth - 1;
  const innerLeft = leftWidth - 4;
  const innerRight = rightWidth - 4;
  const border = (size, title, start = '├', end = '┤') => {
    const label = ` ${title} `;
    return start + label + '─'.repeat(size - 2 - displayWidth(label)) + end;
  };
  const content = (text, size) => '│ ' + fit(text, size - 4) + ' │';
  const left = Array.from({ length: rows }, () => content('', leftWidth));
  left[0] = border(leftWidth, view.indoors ? '房屋内部' : '世界地图', '┌', '┐');
  left[1] = content(view.regionName, leftWidth);
  const mapLines = view.map.split('\n').map(row => [...row].join(' '));
  const top = Math.max(3, Math.floor((rows - 7 - mapLines.length) / 2));
  for (const [index, line] of mapLines.entries()) {
    const padding = Math.max(0, Math.floor((innerLeft - displayWidth(line)) / 2));
    left[top + index] = content(' '.repeat(padding) + line, leftWidth);
  }
  left[rows - 6] = border(leftWidth, '图例');
  (view.indoors ? ['@ 你  N 居民  b 床铺', 'D 出口（走上去离开）', 't 桌 c 椅 ! 可拾取物', '# 墙壁  . 地板'] :
    ['@ 你  N 居民  H 家门', 'h 民居门（走上去进入）', 'C 箱子 F 农田 B 面包坊', 'W 水井 ^ 野外 ! 物品']).forEach((line, index) => {
    left[rows - 5 + index] = content(line, leftWidth);
  });
  left[rows - 1] = '└' + '─'.repeat(leftWidth - 2) + '┘';

  const sections = [
    ['时间与位置', [
      `第 ${view.time.day} 天  ${String(view.time.hour).padStart(2, '0')}:00`,
      view.places.join('、') || '道路 / 野外',
      `坐标 (${player.position.x}, ${player.position.y})`,
    ]],
    ['角色状态', [
      `饥饿 ${player.needs.hunger}/100  口渴 ${player.needs.thirst}/100`,
      `疲劳 ${player.needs.fatigue}/100`,
    ]],
    ['背包与公共物资', [
      `背包：面包 ${player.inventory.bread}  水 ${player.inventory.water}`,
      `箱子面包 ${world.market.bread.stock} / ${world.market.bread.price}币`,
      `箱子饮水 ${world.market.water.stock} / ${world.market.water.price}币`,
    ]],
    ['附近居民', Array.from({ length: 3 }, (_, index) => {
      const npc = view.nearby[index];
      return npc ? `${npc.name} ${activityNames[npc.activity]} → ${npc.destination}`
        : index === 0 ? '附近没有居民' : '';
    })],
    ['操作提示', [
      '方向键 移动  Z 交互',
      '床上Z睡觉  ! 上Z拾取',
      'C 上Z打开箱子 空地Z背包',
      'Esc关闭界面  Q退出',
    ]],
  ];
  const right = [];
  for (const [title, lines] of sections) {
    right.push(border(rightWidth, title, right.length ? '├' : '┌', right.length ? '┤' : '┐'));
    for (const line of lines) right.push(content(line, rightWidth));
  }
  right.push(border(rightWidth, '近期消息'));
  const available = rows - right.length - 1;
  const logLines = messages.flatMap(message => wrap(message, innerRight)).slice(-available);
  for (let index = 0; index < available; index++) right.push(content(logLines[index] || '', rightWidth));
  right.push('└' + '─'.repeat(rightWidth - 2) + '┘');
  return left.map((line, index) => line + ' ' + right[index]);
}

function inventoryLayout(world, messages, width, rows, ui) {
  const leftWidth = Math.floor((width - 1) / 2);
  const rightWidth = width - leftWidth - 1;
  const active = ui.side;
  const bodyRows = rows - 9;
  const panel = (side, size, title) => {
    const selected = ui.indices[side];
    const items = itemRows(world, side);
    const offset = Math.max(0, selected - bodyRows + 1);
    const label = ' ' + (active === side ? '> ' : '  ') + title + ' ';
    const result = ['┌' + label + '─'.repeat(size - 2 - displayWidth(label)) + '┐'];
    for (let index = 0; index < bodyRows; index++) {
      const item = items[offset + index];
      const text = item ? (active === side && offset + index === selected ? '> ' : '  ') + item.name + ' ×' + item.quantity : index === 0 && !items.length ? '（空）' : '';
      result.push('│ ' + fit(text, size - 4) + ' │');
    }
    result.push('└' + '─'.repeat(size - 2) + '┘');
    return result;
  };
  const left = panel('chest', leftWidth, ui.menu === 'chest' ? '箱子' : '物品说明');
  if (ui.menu === 'backpack') for (let index = 1; index < left.length - 1; index++) left[index] = '│ ' + fit(index === 1 ? '选择背包物品，按 Z 使用。' : '', leftWidth - 4) + ' │';
  const right = panel('backpack', rightWidth, '你的背包');
  const lines = [fit(ui.menu === 'chest' ? '公共箱子 · 双向存取（每次一份）' : '背包 · 使用物品', width),
    fit('第 ' + world.time.day + ' 天 ' + String(world.time.hour).padStart(2, '0') + ':00  浏览不耗时，实际操作耗时一小时', width),
    fit('', width), ...left.map((line, index) => line + ' ' + right[index]),
    fit(ui.menu === 'chest' ? '←/→ 切换箱子与背包  ↑/↓ 选择  Z 拿取/存入' : '↑/↓ 选择  Z 使用', width),
    fit('Esc 返回地图  Q 退出游戏', width),
    fit(messages.at(-1) || '', width)];
  while (lines.length < rows) lines.push(fit('', width));
  return lines.slice(0, rows);
}
