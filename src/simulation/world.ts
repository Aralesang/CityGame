import type { World, DailyReport } from '../types.js';

import { goods, jobs, residents } from '../data/town.js';
import { moveActor, tickNeeds, samePosition, nextStep } from './actors.js';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 100) / 100;

/** 创建不依赖终端的纯经济世界。每次调用均复制商品和居民运行状态，
 * 可同时运行多个相互隔离的模拟，也可由冒险模式继续附加地图与玩家。 */
export function createWorld(): World {
  const world: World = {
    time: { day: 1, hour: 0 },
    market: Object.fromEntries(Object.entries(goods).map(([id, good]) => [id, { ...good, price: good.basePrice }])),
    npcs: residents.map(npc => ({ ...npc, home: `${npc.name}的家`, money: 30,
      needs: { hunger: 0, thirst: 0, fatigue: 0 }, workHours: 0, activity: 'sleep', location: `${npc.name}的家` })),
    lastReport: null,
  };
  updateActivities(world);
  return world;
}

/** 按当前小时重新计算活动与目的地：睡眠优先，其次是严重需求下的休息。
 * location 表示计划目的地；冒险模式中的实际位置由逐小时寻路更新。 */
function updateActivities(world: World) {
  const hour = world.time.hour;
  for (const npc of world.npcs) {
    const sleeping = hour < 6 || hour >= 22;
    const working = hour >= npc.workStart && hour < npc.workEnd;
    npc.activity = sleeping ? 'sleep' : npc.needs.hunger >= 80 || npc.needs.thirst >= 80
      ? 'rest' : working ? 'work' : 'leisure';
    npc.location = npc.activity === 'work' ? jobs[npc.job].workplace : npc.home;
  }
}

/** 午夜依次结算生产、工资、生活购买与次日价格。
 * 账本区分需求和实际消耗，便于检查库存守恒及原料不足造成的缺口。 */
function settleDay(world: World): DailyReport {
  const ledger: DailyReport['goods'] = Object.fromEntries(Object.entries(world.market).map(([id, good]) => [id, {
    openingStock: good.stock, produced: 0, demand: 0, consumed: 0, unmet: 0, closingStock: good.stock, price: good.price,
  }]));
  // 原料在本日可用于加工，数组顺序不决定产业链顺序。
  for (const npc of [...world.npcs].sort((a, b) => jobs[a.job].priority - jobs[b.job].priority)) {
    const job = jobs[npc.job];
    // 所有原料共同限制有效生产小时；工作过却缺少原料的小时不产生工资或产出。
    let hours = npc.workHours;
    for (const [id, amount] of Object.entries(job.inputs)) hours = Math.min(hours, Math.floor(world.market[id].stock / amount));
    for (const [id, amount] of Object.entries(job.inputs)) {
      ledger[id].demand += npc.workHours * amount;
      ledger[id].consumed += hours * amount;
      ledger[id].unmet += (npc.workHours - hours) * amount;
      world.market[id].stock -= hours * amount;
    }
    for (const [id, amount] of Object.entries(job.outputs)) {
      world.market[id].stock += hours * amount;
      ledger[id].produced += hours * amount;
    }
    // 原型采用外部雇主发薪；不模拟封闭货币循环。
    npc.money = round(npc.money + hours * job.wage);
  }
  // 每日轮换购买顺序，避免同一个居民永远最后买到食物。
  const offset = (world.time.day - 1) % world.npcs.length;
  const buyers = [...world.npcs.slice(offset), ...world.npcs.slice(0, offset)];
  const shortages = [];
  for (const npc of buyers) {
    for (const [id, need] of ([['bread', 'hunger'], ['water', 'thirst']] as const)) {
      const wanted = Math.floor(npc.needs[need] / 25);
      const good = world.market[id];
      // 购买量同时受需求、公共库存和现金限制；买不起也计入未满足需求。
      const bought = Math.min(wanted, good.stock, Math.floor(npc.money / good.price));
      good.stock -= bought;
      npc.money = round(npc.money - bought * good.price);
      npc.needs[need] = clamp(npc.needs[need] - bought * 25, 0, 100);
      ledger[id].demand += wanted;
      ledger[id].consumed += bought;
      ledger[id].unmet += wanted - bought;
      if (bought < wanted) shortages.push({ npcId: npc.id, good: id, missing: wanted - bought });
    }
    npc.workHours = 0;
  }
  for (const [id, good] of Object.entries(world.market)) {
    // 库存低于目标、未满足需求都会推高价格，限制在基础价的 0.5～3 倍。
    const pressure = (good.targetStock - good.stock + ledger[id].unmet) / good.targetStock;
    good.price = round(good.basePrice * clamp(1 + pressure * 0.5, 0.5, 3));
    Object.assign(ledger[id], { closingStock: good.stock, price: good.price });
  }
  // 发布前所有商品都已填入期末库存和价格；返回深拷贝，防止调用者修改世界报告。
  world.lastReport = { day: world.time.day, goods: ledger, shortages };
  return structuredClone(world.lastReport);
}

// 唯一时间入口：每步一个游戏小时，不依赖真实时钟、画面或 I/O。
export function advanceHours(world: World, hours = 1): DailyReport[] {
  if (!Number.isSafeInteger(hours) || hours < 0) throw new RangeError('hours 必须为非负安全整数');
  const reports = [];
  for (let step = 0; step < hours; step++) {
    // 每小时先确定日程，再移动；本小时开始时尚未抵达工作地点，就不累计生产。
    updateActivities(world);
    for (const npc of world.npcs) {
      let arrived = true;
      if (world.map && npc.position) {
        const target = world.map.places[npc.location];
        arrived = samePosition(npc.position, target);
        if (!arrived) {
          const step = nextStep(world.map, npc.position, target);
          if (step) {
            // 局部对象保留已收窄的 position 类型；跨房门后需回写移动产生的新坐标。
            const moving = { position: npc.position };
            moveActor(moving, step.dx, step.dy, world.map);
            npc.position = moving.position;
          }
        }
      }
      if (npc.activity === 'work' && arrived) npc.workHours++;
      // 还在回家路上的 NPC 不能提前享受睡眠恢复，临时按休息状态计算需求。
      tickNeeds(world.map && npc.activity === 'sleep' && !arrived ? { ...npc, activity: 'rest' } : npc);
    }
    if (world.player) tickNeeds(world.player);
    world.time.hour++;
    // 跨午夜先结算旧日，再递增日期；一次快进可按顺序返回多份日报。
    if (world.time.hour === 24) {
      reports.push(settleDay(world));
      world.time.day++;
      world.time.hour = 0;
    }
    updateActivities(world);
  }
  return reports;
}

/** 深拷贝可序列化状态，保留调用方世界类型；修改快照不会影响原世界。 */
export function snapshot<T extends World>(world: T): T {
  return structuredClone(world);
}
