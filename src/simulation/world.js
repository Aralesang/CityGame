import { goods, jobs, residents } from '../data/town.js';
import { moveActor, tickNeeds, samePosition, nextStep } from './actors.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = value => Math.round(value * 100) / 100;

export function createWorld() {
  const world = {
    time: { day: 1, hour: 0 },
    market: Object.fromEntries(Object.entries(goods).map(([id, good]) => [id, { ...good, price: good.basePrice }])),
    npcs: residents.map(npc => ({ ...npc, home: `${npc.name}的家`, money: 30,
      needs: { hunger: 0, thirst: 0, fatigue: 0 }, workHours: 0, activity: 'sleep', location: `${npc.name}的家` })),
    lastReport: null,
  };
  updateActivities(world);
  return world;
}

function updateActivities(world) {
  const hour = world.time.hour;
  for (const npc of world.npcs) {
    const sleeping = hour < 6 || hour >= 22;
    const working = hour >= npc.workStart && hour < npc.workEnd;
    npc.activity = sleeping ? 'sleep' : npc.needs.hunger >= 80 || npc.needs.thirst >= 80
      ? 'rest' : working ? 'work' : 'leisure';
    npc.location = npc.activity === 'work' ? jobs[npc.job].workplace : npc.home;
  }
}

function settleDay(world) {
  const ledger = Object.fromEntries(Object.entries(world.market).map(([id, good]) => [id, {
    openingStock: good.stock, produced: 0, demand: 0, consumed: 0, unmet: 0,
  }]));
  // 原料在本日可用于加工，数组顺序不决定产业链顺序。
  for (const npc of [...world.npcs].sort((a, b) => jobs[a.job].priority - jobs[b.job].priority)) {
    const job = jobs[npc.job];
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
    for (const [id, need] of [['bread', 'hunger'], ['water', 'thirst']]) {
      const wanted = Math.floor(npc.needs[need] / 25);
      const good = world.market[id];
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
  world.lastReport = { day: world.time.day, goods: ledger, shortages };
  return structuredClone(world.lastReport);
}

// 唯一时间入口：每步一个游戏小时，不依赖真实时钟、画面或 I/O。
export function advanceHours(world, hours = 1) {
  if (!Number.isSafeInteger(hours) || hours < 0) throw new RangeError('hours 必须为非负安全整数');
  const reports = [];
  for (let step = 0; step < hours; step++) {
    updateActivities(world);
    for (const npc of world.npcs) {
      let arrived = true;
      if (world.map) {
        const target = world.map.places[npc.location];
        arrived = samePosition(npc.position, target);
        if (!arrived) {
          const step = nextStep(world.map, npc.position, target);
          if (step) moveActor(npc, step.dx, step.dy, world.map);
        }
      }
      if (npc.activity === 'work' && arrived) npc.workHours++;
      tickNeeds(world.map && npc.activity === 'sleep' && !arrived ? { ...npc, activity: 'rest' } : npc);
    }
    if (world.player) tickNeeds(world.player);
    world.time.hour++;
    if (world.time.hour === 24) {
      reports.push(settleDay(world));
      world.time.day++;
      world.time.hour = 0;
    }
    updateActivities(world);
  }
  return reports;
}

export function snapshot(world) {
  return structuredClone(world);
}
