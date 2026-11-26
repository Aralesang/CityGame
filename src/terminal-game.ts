import type { Key } from 'node:readline';
import { emitKeypressEvents } from 'node:readline';
import { createAdventure } from './simulation/adventure.js';
import { layout } from './terminal-layout.js';
import { createControls, handleKey } from './controls.js';

// 全屏终端入口只负责输入、输出和生命周期，世界规则与界面布局分别由独立模块维护。
const world = createAdventure();
const ui = createControls();
const input = process.stdin;
const output = process.stdout;

const messages = ['你在自家床上醒来。向右一格，再向下走过 D 出门。'];
/** 光标回到左上后逐行清除并绘制，最后清理剩余区域，避免窗口缩小时残留旧画面。 */
function render() {
  const lines = layout(world, messages, output.columns || 100, output.rows || 40, ui);
  output.write('\x1b[H' + lines.map(line => '\x1b[2K' + line).join('\n') + '\x1b[J');
}
let closed = false;
/** 幂等清理：恢复标准输入、光标和原终端缓冲区，退出事件重复触发也只执行一次。 */
function cleanup() {
  if (closed) return;
  closed = true;
  input.off('keypress', onKey);
  output.off('resize', render);
  input.setRawMode(false);
  input.pause();
  output.write('\x1b[?25h\x1b[?1049l');
}
function quit() {
  cleanup();
  process.exit(0);
}
/** 处理 Node 解码后的键盘事件；Ctrl+C 优先退出，其他组合键不提交游戏命令。 */
function onKey(text: string, key: Key = {}) {
  const name = key.name || text;
  if (key.ctrl && name === 'c') { quit(); return; }
  if (key.ctrl || key.meta) return;
  const result = handleKey(world, ui, name);
  if (result.quit) { quit(); return; }
  if (result.message) messages.push(result.message);
  // 单次行动可能跨越午夜，将结算报告转成消息；原始账本仍保存在领域层。
  for (const report of result.reports || []) {
    messages.push(`第 ${report.day} 天结束：面包库存 ${report.goods.bread.closingStock}，次日价格 ${report.goods.bread.price}。生活物资缺口 ${report.shortages.length} 项。`);
  }
  if (messages.length > 10) messages.splice(0, messages.length - 10);
  render();
}

// 原始输入模式允许方向键和 Z 即时响应；备用屏幕缓冲区保证退出后恢复原终端。
emitKeypressEvents(input);
input.setRawMode(true);
input.resume();
output.write('\x1b[?1049h\x1b[?25l\x1b[2J');
input.on('keypress', onKey);
output.on('resize', render);
process.once('SIGINT', quit);
process.once('SIGTERM', quit);
process.once('exit', cleanup);
render();

