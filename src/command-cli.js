import { createInterface } from 'node:readline';
import { createAdventure } from './simulation/adventure.js';
import { createControls, handleKey } from './controls.js';
import { layout } from './terminal-layout.js';
const world = createAdventure();
const ui = createControls();
const messages = ['文本兼容模式：输入 up/down/left/right、z、escape、q，每行回车。'];
function render() { console.log(layout(world, messages, 80, 30, ui).join('
')); }
render();
const terminal = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
terminal.prompt();
terminal.on('line', line => {
  const result = handleKey(world, ui, line.trim().toLowerCase());
  if (result.quit) { terminal.close(); return; }
  if (result.message) messages.push(result.message);
  if (messages.length > 10) messages.shift();
  render();
  terminal.prompt();
});
