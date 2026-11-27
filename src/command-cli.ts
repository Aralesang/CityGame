import { appendReports, startWorldClock } from './world-clock.js';
import { createInterface } from 'node:readline';
import { createAdventure } from './simulation/adventure.js';
import { createControls, handleKey } from './controls.js';
import { layout } from './terminal-layout.js';
// 逐行兼容入口：读取字符串命令，但复用与全屏模式相同的世界和按键控制器。
const world = createAdventure();
const ui = createControls();
const messages = ['文本兼容模式：输入 w/a/s/d（移动）、up/down/left/right（转向）、e、f、b、m（地图）、space、.、t（切换自动/行动）、q，每行回车。'];
/** 打印完整帧而不使用光标控制，便于重定向输出及脚本读取。 */
function render() { console.log(layout(world, messages, 80, 30, ui).join('\n')); }
render();
const terminal = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
terminal.prompt();
const stopClock = startWorldClock(world, ui, messages, () => { render(); terminal.prompt(true); }, error => { terminal.close(); console.error(error); process.exitCode = 1; });
terminal.once('close', stopClock);
// 每行只处理一个命令。消息保留最近十条；Q 只关闭游戏界面，输入流结束时由 readline 释放标准输入。
terminal.on('line', line => {
  const result = handleKey(world, ui, line === ' ' ? 'space' : line.trim().toLowerCase());
  if (result.message) messages.push(result.message);
  appendReports(world, messages, result.reports ?? []);
  render();
  terminal.prompt();
});
