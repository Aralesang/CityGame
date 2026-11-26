import { createInterface } from 'node:readline';
import { createAdventure } from './simulation/adventure.js';
import { createControls, handleKey } from './controls.js';
import { layout } from './terminal-layout.js';
// 逐行兼容入口：读取字符串命令，但复用与全屏模式相同的世界和按键控制器。
const world = createAdventure();
const ui = createControls();
const messages = ['文本兼容模式：输入 up/down/left/right、z、escape、q，每行回车。'];
/** 打印完整帧而不使用光标控制，便于重定向输出及脚本读取。 */
function render() { console.log(layout(world, messages, 80, 30, ui).join('\n')); }
render();
const terminal = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
terminal.prompt();
// 每行只处理一个命令。消息保留最近十条；退出时关闭 readline，释放标准输入。
terminal.on('line', line => {
  const result = handleKey(world, ui, line.trim().toLowerCase());
  if (result.quit) { terminal.close(); return; }
  if (result.message) messages.push(result.message);
  if (messages.length > 10) messages.shift();
  render();
  terminal.prompt();
});
