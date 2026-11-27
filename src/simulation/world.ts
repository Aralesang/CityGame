import type { World, DailyReport, Npc, Position, Activity } from '../types.js';
import { goods, jobs, residents, rules } from '../data/config.js';
import { carriedWeight, carryCapacity, productionFits } from './weight.js';
import { createMap } from '../data/map.js';
import { moveActor, tickNeeds, samePosition, nextStep, regionId } from './actors.js';
import { buyFromShop, eatCarried, findSeller, finishDay, homeChest, nearby, produce, refreshEconomy, resetLedger, syncHomeInventory, syncShopInventory, ownedShop, totalGold } from './economy.js';

/** 生产者只拥有自己的物资，容器独立库存；店铺是交易入口，不复制主人库存。 */
export function createWorld(): World {
  const map = createMap();
  const world: World = {
    time: { ...rules.startTime }, market: {}, map,
    npcs: residents.map(config => ({ ...structuredClone(config), workHours: 0, activity: 'sleep', location: config.home,
      position: { ...map.destinations[config.home] } })),
    containers: {}, shops: {}, initialGold: 0, trades: 0, dayLedger: {}, shortages: [], lastReport: null,
  };
  for (const place of Object.values(map.instances)) {
    if (place.kind === 'container') world.containers[place.id!] = { id: place.id!, name: place.name!, position: { ...place }, ownerId: place.ownerId,
      items: Object.fromEntries(Object.entries(goods).map(([id, definition]) => [id, { ...structuredClone(definition), price: definition.basePrice, stock: place.contents?.[id] ?? 0 }])) };
  }
  // 容器先全部创建，再将商店房屋关联到室内货箱，避免配置顺序影响库存引用。
  for (const place of Object.values(map.instances).filter(place => place.kind === 'door' && place.shopOwner)) {
    const owner = world.npcs.find(npc => npc.id === place.shopOwner)!;
    const stockpile = map.cells[regionId(owner.shop.stockpile)][`${owner.shop.stockpile.x},${owner.shop.stockpile.y}`];
    world.shops[place.id!] = { ...structuredClone(owner.shop), containerId: stockpile.id!, id: place.id!, name: place.name!, ownerId: owner.id, position: { ...place } };
  }
  world.initialGold = totalGold(world);
  resetLedger(world);
  return world;
}

interface Plan { stockpile?: boolean; position: Position; activity: Activity; good?: string; shopId?: string; adjacent: boolean }
/** 先解决生存物资与原料，再按日程生产或回家，采购必须走到商店附近。 */
function planNpc(world: World, npc: Npc): Plan {
  const chest = homeChest(world, npc);
  const hour = world.time.hour;
  const asleep = hour < rules.sleepEnd || hour >= rules.sleepStart;
  const working = !asleep && hour >= npc.workStart && hour < npc.workEnd;
  const shop = ownedShop(world, npc);
  const goodsBox = world.containers[shop.containerId];
  const serving = hour >= shop.openStart && hour < shop.openEnd;
  const job = jobs[npc.job];
  const excessGoods = shop.stockGoods.some(id => (npc.inventory[id] ?? 0) > (npc.reserve[id] ?? 0));
  const heavy = carriedWeight(npc) >= npc.maxCarryWeight * 0.8 || (working && !productionFits(npc, job.inputs, job.outputs));
  // 负重接近上限必须先搬运入库，不能继续隔空生产或无限拾取。
  if (heavy) {
    if (excessGoods) return { position: goodsBox.position, activity: 'hauling', adjacent: true, stockpile: true };
    if (chest) return { position: chest.position, activity: 'hauling', adjacent: true };
  }
  const needed: string[] = [];
  for (const need of ['hunger', 'thirst'] as const) if (npc.needs[need] <= rules.survival.buyBelow) {
    const good = Object.keys(goods).find(id => goods[id].purchaseNeed === need);
    if (good && (npc.inventory[good] ?? 0) < rules.survival.purchaseTarget) needed.push(good);
  }
  if (!asleep) for (const [good, amount] of Object.entries(jobs[npc.job].inputs)) if ((npc.inventory[good] ?? 0) < amount) needed.push(good);
  for (const good of needed) {
    if (chest && chest.items[good].stock > 0) return { position: chest.position, activity: 'rest', adjacent: true };
    if (goodsBox.items[good].stock > 0 && carryCapacity(npc, good) > 0) return { position: goodsBox.position, activity: 'hauling', adjacent: true, stockpile: true };
    const shop = carryCapacity(npc, good) > 0 ? findSeller(world, npc, good) : undefined;
    if (shop) return { position: shop.counter, activity: 'shopping', good, shopId: shop.id, adjacent: true };
  }
  if (serving) {
    if (excessGoods) return { position: goodsBox.position, activity: 'hauling', adjacent: true, stockpile: true };
    // 店员必须走到柜台岗位才营业。货箱不足而家中有成品时，亲自去家里取货。
    const refill = shop.stockGoods.some(id => goodsBox.items[id].stock < 4 && chest && chest.items[id].stock > 0 && (npc.inventory[id] ?? 0) <= (npc.reserve[id] ?? 0));
    if (refill && chest) return { position: chest.position, activity: 'hauling', adjacent: true };
    return { position: shop.counter, activity: 'selling', adjacent: false };
  }
  const homeTransfer = chest && Object.keys(goods).some(id => ((npc.inventory[id] ?? 0) < (npc.carryTarget[id] ?? 0) && chest.items[id].stock > 0 && carryCapacity(npc, id) > 0)
    || (!working && (npc.inventory[id] ?? 0) > (npc.carryTarget[id] ?? 0)));
  if (chest && homeTransfer && (!working || (npc.position && regionId(npc.position) === regionId(chest.position)))) return { position: chest.position, activity: 'rest', adjacent: true };
  const destination = working ? jobs[npc.job].workplace : npc.home;
  npc.location = destination;
  return { position: world.map!.destinations[destination], activity: working ? 'work' : asleep ? 'sleep' : 'leisure', adjacent: working };
}

/** 每小时至多移动一格，寻路绕过生物碰撞；阻挡的店铺或工位使用相邻可站立格。 */
function advanceNpc(world: World, npc: Npc): void {
  if (!npc.alive || !npc.position || !world.map) return;
  eatCarried(world, npc);
  syncHomeInventory(world, npc);
  const plan = planNpc(world, npc);
  npc.activity = plan.activity;
  npc.destinationName = world.map.cells[regionId(plan.position)]?.[`${plan.position.x},${plan.position.y}`]?.name ?? npc.location;
  const reached = plan.adjacent ? nearby(npc.position, plan.position) : samePosition(npc.position, plan.position);
  if (reached) {
    if (plan.stockpile) syncShopInventory(world, npc, ownedShop(world, npc));
    else if (plan.shopId && plan.good) {
      // 到店后补足一批携带目标，避免面包师每买一份原料就往返一次而无法维持生产。
      const quantity = Math.max(1, (npc.carryTarget[plan.good] ?? rules.survival.purchaseTarget) - (npc.inventory[plan.good] ?? 0));
      buyFromShop(world, npc as Npc & { position: Position }, world.shops[plan.shopId], plan.good, quantity);
    }
    else if (plan.activity === 'work') produce(world, npc);
    else syncHomeInventory(world, npc);
  } else {
    const occupied = world.npcs.filter(other => other !== npc && other.alive && other.position).map(other => other.position!);
    if (world.player?.alive) occupied.push(world.player.position);
    const candidates = plan.adjacent
      ? [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dy]) => ({ ...plan.position, x: plan.position.x + dx, y: plan.position.y + dy }))
      : [plan.position];
    candidates.sort((a, b) => regionId(npc.position!) === regionId(a)
      ? (Math.abs(a.x - npc.position!.x) + Math.abs(a.y - npc.position!.y)) - (Math.abs(b.x - npc.position!.x) + Math.abs(b.y - npc.position!.y)) : 0);
    for (const destination of candidates) {
      const step = nextStep(world.map, npc.position, destination, occupied);
      if (!step) continue;
      const moving = { position: npc.position };
      moveActor(moving, step.dx, step.dy, world.map, occupied);
      npc.position = moving.position;
      break;
    }
  }
  // 买到后及时食用，归零的需求当小时得到补充时不会先无故扣血。
  eatCarried(world, npc);
  for (const need of ['hunger', 'thirst'] as const) if (npc.needs[need] === 0) {
    const good = Object.keys(goods).find(id => goods[id].purchaseNeed === need);
    if (good) {
      world.dayLedger[good].demand++;
      world.dayLedger[good].unmet++;
      const shortage = world.shortages.find(row => row.npcId === npc.id && row.good === good);
      if (shortage) shortage.missing++; else world.shortages.push({ npcId: npc.id, good, missing: 1 });
    }
  }
  // 只有到达床位才计算睡眠恢复；赶路时保留生存消耗，不能隔空恢复疲劳。
  const activity = npc.activity;
  if (activity === 'sleep' && !reached) npc.activity = 'rest';
  tickNeeds(npc);
  if (npc.alive) npc.activity = activity;
}

/** 统一时间入口：所有生物逐小时消耗饱腹、水分并处理死亡；午夜仅汇总，不集中生产发薪。 */
export function advanceHours(world: World, hours = 1): DailyReport[] {
  if (!Number.isSafeInteger(hours) || hours < 0) throw new RangeError('hours 必须为非负安全整数');
  const reports: DailyReport[] = [];
  for (let step = 0; step < hours; step++) {
    const goldBefore = totalGold(world);
    // 每小时轮换行动顺序，避免购买与工位竞争一直偏向同一居民。
    const offset = (world.time.day * rules.hoursPerDay + world.time.hour) % world.npcs.length;
    for (const npc of [...world.npcs.slice(offset), ...world.npcs.slice(0, offset)]) advanceNpc(world, npc);
    if (world.player) tickNeeds(world.player);
    world.time.hour++;
    refreshEconomy(world);
    // 金币守恒是运行约束，生产、消费和角色死亡都不能改变社会金币总量。
    if (totalGold(world) !== goldBefore) throw new Error('经济状态错误：本小时金币总量发生变化');
    if (world.time.hour === rules.hoursPerDay) {
      world.lastReport = finishDay(world);
      reports.push(structuredClone(world.lastReport));
      for (const npc of world.npcs) npc.workHours = 0;
      world.time.day++;
      world.time.hour = 0;
      resetLedger(world);
    }
  }
  return reports;
}
/** 保存状态副本，不刷新或重新生成对象身份。 */
export function snapshot<T extends World>(world: T): T { return structuredClone(world); }
