import { appendReports, startWorldClock } from './world-clock.js';
import { rules } from './data/config.js';
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

const messages = [rules.openingMessage];
/** 光标回到左上后逐行清除并绘制，最后清理剩余区域，避免窗口缩小时残留旧画面。 */
function render() {
  const lines = layout(world, messages, output.columns || 100, output.rows || 40, ui);
  output.write('\x1b[H' + lines.map(line => '\x1b[2K' + line).join('\n') + '\x1b[J');
}
let closed = false;
let stopClock = () => {};
/** 幂等清理：恢复标准输入、光标和原终端缓冲区，退出事件重复触发也只执行一次。 */
function cleanup() {
  if (closed) return;
  closed = true;
  stopClock();
  input.off('keypress', onKey);
  output.off('resize', render);
  input.setRawMode(false);
  input.pause();
  output.write('\x1b[?25h\x1b[?1049l');
}
function terminate() {
  cleanup();
  process.exit(0);
}
/** 处理 Node 解码后的键盘事件；保留终端标准 Ctrl+C 中断，其他 Ctrl / Alt 组合键忽略。 */
function onKey(text: string, key: Key = {}) {
  const name = key.name || text;
  // 原始输入模式不会自动用 Ctrl+C 终止进程，须在过滤组合键前显式处理，
  // 并通过统一清理恢复光标、输入模式和原终端画面；所有游戏界面均可中断。
  if (key.ctrl && name === 'c') { terminate(); return; }
  if (key.ctrl || key.meta) return;
  // 只传递普通按键名称，WASD 移动、光标键转向，无需组合键或终端键盘协议。
  const result = handleKey(world, ui, name);
  if (result.message) messages.push(result.message);
  appendReports(world, messages, result.reports ?? []);
  render();
}

// 原始输入模式允许方向键和 F 即时响应；备用屏幕缓冲区保证退出后恢复原终端。
emitKeypressEvents(input);
input.setRawMode(true);
input.resume();
output.write('\x1b[?1049h\x1b[?25l\x1b[2J');
input.on('keypress', onKey);
output.on('resize', render);
// 外部终止信号仍恢复终端状态，这属于进程清理，不是游戏按键操作。
process.once('SIGINT', terminate);
process.once('SIGTERM', terminate);
process.once('exit', cleanup);
stopClock = startWorldClock(world, ui, messages, render, error => { cleanup(); console.error(error); process.exitCode = 1; });
render();

