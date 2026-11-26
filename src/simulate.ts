import { createWorld, advanceHours } from './simulation/world.js';

// 批量模拟不装配地图，NPC 按排班直接累计工时；适合观察经济长期变化。
const args = process.argv.slice(2);
const days = args.length === 0 ? 7 : Number(args[0]);
// 参数必须是有限范围内的整数，错误时设置退出码，方便脚本识别失败。
if (args.length > 1 || !Number.isInteger(days) || days < 1 || days > 10000) {
  console.error('用法：npm run simulate -- [天数 1～10000]');
  process.exitCode = 1;
} else {
  const world = createWorld();
  console.log(`小镇模拟：${world.npcs.length} 位居民，运行 ${days} 天`);
  // 一次推进整天只产生一份日报；打印字段与内部守恒账本直接对应。
  for (let day = 0; day < days; day++) {
    const [report] = advanceHours(world, 24);
    console.log(`\n第 ${report.day} 天结算`);
    console.table(Object.fromEntries(Object.entries(report.goods).map(([id, row]) => [world.market[id].name, {
      生产: row.produced, 需求: row.demand, 消耗: row.consumed, 缺口: row.unmet, 库存: row.closingStock, 次日价格: row.price,
    }])));
    if (report.shortages.length) console.log('生活物资短缺：', report.shortages);
  }
  console.table(world.npcs.map(npc => ({ 姓名: npc.name, 职业: npc.job, 金钱: npc.money, ...npc.needs })));
}
