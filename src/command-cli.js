import { createInterface } from 'node:readline';
import { createAdventure, act, observe } from './simulation/adventure.js';

const world = createAdventure();
const help = `命令：n/s/e/w 移动 | look 观察 | status 状态 | take bread/water 取一份物资
use bread/water 使用物资 | wait [小时] 等待 | sleep 在自家床上睡到早晨 | history 近期记录 | quit 退出
图例：@ 你，N 居民，H/h 房门，D 室内出口，b 床，t/c 桌椅，S 仓库，F 农田，B 面包坊，W 水井，^ 野外，# 墙壁
移动、取用、使用各耗时一小时；观察不耗时。公共物资可免费取用，暂未实现所有权。`;
function look() {
  const view = observe(world);
  console.log(`\n第 ${view.time.day} 天 ${String(view.time.hour).padStart(2, '0')}:00\n${view.map}`);
    console.log(`所在地点：${view.places.join('、') || view.regionName}`);
  for (const npc of view.nearby) console.log(`${npc.name} (${npc.position.x},${npc.position.y})：${npc.activity}，目的地：${npc.destination}`);
  if (view.places.includes('公共仓库')) console.table(world.market);
}
console.log('冒险原型：你是世界中的一名旅人。输入 help 查看命令。');
console.log(help);
look();
const terminal = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
terminal.prompt();
terminal.on('line', line => {
  const [command, argument, ...extra] = line.trim().toLowerCase().split(/\s+/);
  if (command === 'quit' || command === 'exit') { terminal.close(); return; }
  if (!command) { terminal.prompt(); return; }
  const requiresArgument = ['take', 'use'].includes(command);
  const optionalArgument = command === 'wait';
  if (extra.length || (argument !== undefined && !requiresArgument && !optionalArgument) || (requiresArgument && !argument)) {
    console.log('参数不正确，输入 help 查看用法。'); terminal.prompt(); return;
  }
  if (command === 'help') console.log(help);
  else if (command === 'look') look();
  else if (command === 'status') console.log({ time: world.time, player: world.player });
  else if (command === 'history') console.table(world.history);
  else {
    const action = ['n', 's', 'e', 'w'].includes(command) ? { type: 'move', direction: command }
      : command === 'wait' ? { type: 'wait', hours: argument === undefined ? 1 : Number(argument) }
      : { type: command, good: argument };
    const result = act(world, action);
    console.log(result.message);
    for (const report of result.reports) {
      console.log(`第 ${report.day} 天结算：`);
      console.table(Object.fromEntries(Object.entries(report.goods).map(([id, row]) => [world.market[id].name, {
        库存: row.closingStock, 次日价格: row.price, 缺口: row.unmet,
      }])));
      for (const shortage of report.shortages) console.log(`${world.npcs.find(npc => npc.id === shortage.npcId).name} 缺少 ${shortage.missing} 份${world.market[shortage.good].name}`);
    }
    if (result.ok) look();
  }
  terminal.prompt();
});
