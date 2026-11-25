import { emitKeypressEvents } from 'node:readline';
import { createAdventure, act } from './simulation/adventure.js';
import { layout } from './terminal-layout.js';

const world = createAdventure();
const input = process.stdin;
const output = process.stdout;

const messages = ['你在自家床上醒来。向右一格，再向下走过 D 出门。'];
const directions = { up: 'n', down: 's', left: 'w', right: 'e', w: 'n', s: 's', a: 'w', d: 'e' };
const actions = {
  e: { type: 'take', good: 'bread' }, r: { type: 'take', good: 'water' },
  '1': { type: 'use', good: 'bread' }, '2': { type: 'use', good: 'water' },
  space: { type: 'wait' }, z: { type: 'sleep' },
};

function render() {
  const lines = layout(world, messages, output.columns || 100, output.rows || 40);
  output.write('\x1b[H' + lines.map(line => '\x1b[2K' + line).join('\n') + '\x1b[J');
}
let closed = false;
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
function onKey(text, key = {}) {
  const name = key.name || text;
  if (name === 'q' || name === 'escape' || (key.ctrl && name === 'c')) { quit(); return; }
  if (key.ctrl || key.meta) return;
  const action = Object.hasOwn(directions, name) ? { type: 'move', direction: directions[name] }
    : Object.hasOwn(actions, name) ? actions[name] : null;
  if (!action) return;
  const result = act(world, action);
  messages.push(result.message);
  for (const report of result.reports) {
    messages.push(`第 ${report.day} 天结束：面包库存 ${report.goods.bread.closingStock}，次日价格 ${report.goods.bread.price}。生活物资缺口 ${report.shortages.length} 项。`);
  }
  if (messages.length > 10) messages.splice(0, messages.length - 10);
  render();
}

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

