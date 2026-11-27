import type { Container, Creature, DailyReport, Npc, Position, Shop, World } from '../types.js';
import { goods, jobs, rules } from '../data/config.js';
import { carryCapacity, productionFits } from './weight.js';
import { consume, regionId } from './actors.js';

/** 交互距离仅在同地图计算，不允许跨地图访问库存或交易。 */
export function nearby(a: Position, b: Position): boolean {
  return regionId(a) === regionId(b) && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1;
}
/** 营业必须同时满足时段、存活、售货状态和店内柜台位置，不能隔空代售。 */
export const shopOpen = (world: World, shop: Shop): boolean => {
  const clerk = world.npcs.find(npc => npc.id === shop.ownerId);
  return Boolean(clerk?.alive && clerk.activity === 'selling' && clerk.position
    && regionId(clerk.position) === regionId(shop.counter) && clerk.position.x === shop.counter.x && clerk.position.y === shop.counter.y
    && world.time.hour >= shop.openStart && world.time.hour < shop.openEnd);
};
export const homeChest = (world: World, npc: Npc): Container | undefined => Object.values(world.containers).find(container => container.ownerId === npc.id
  && regionId(container.position) === regionId(npc.homeChest) && container.position.x === npc.homeChest.x && container.position.y === npc.homeChest.y);
export const ownedStock = (world: World, npc: Npc, good: string): number => (npc.inventory[good] ?? 0)
  + Object.values(world.containers).filter(container => container.ownerId === npc.id).reduce((sum, container) => sum + container.items[good].stock, 0);
export const ownedShop = (world: World, npc: Npc): Shop => Object.values(world.shops).find(shop => shop.ownerId === npc.id)!;
/** 商品列表就是货箱的实际内容，不以 NPC 随身库存或商品白名单替代。 */
export function saleStock(world: World, shop: Shop, good: string): number {
  return world.containers[shop.containerId]?.items[good]?.stock ?? 0;
}
function canTrade(world: World, customer: Creature & { position?: Position }, shop: Shop): boolean {
  const clerk = world.npcs.find(npc => npc.id === shop.ownerId);
  return Boolean(customer.alive && clerk && customer !== clerk && shopOpen(world, shop)
    && customer.position && clerk.position && nearby(customer.position, clerk.position));
}
/** 买卖使用货箱库存，金币只在客户和店员之间转移，修改之前先检查货物、金币和负重。 */
export function buyFromShop(world: World, buyer: Creature & { position?: Position }, shop: Shop, good: string, quantity = 1): number {
  const seller = world.npcs.find(npc => npc.id === shop.ownerId);
  if (!seller || !canTrade(world, buyer, shop) || !Number.isSafeInteger(quantity) || quantity < 1 || !goods[good]) return 0;
  const stock = world.containers[shop.containerId].items[good];
  const price = goods[good].basePrice;
  const amount = Math.min(quantity, stock.stock, Math.floor(buyer.money / price), carryCapacity(buyer, good));
  const cost = amount * price;
  if (amount < 1 || !Number.isSafeInteger(cost) || !Number.isSafeInteger(seller.money + cost)) return 0;
  buyer.money -= cost;
  seller.money += cost;
  stock.stock -= amount;
  buyer.inventory[good] = (buyer.inventory[good] ?? 0) + amount;
  world.trades++;
  return amount;
}
export function sellToShop(world: World, seller: Creature & { position?: Position }, shop: Shop, good: string): number {
  const buyer = world.npcs.find(npc => npc.id === shop.ownerId);
  if (!buyer || !canTrade(world, seller, shop) || !shop.buys.includes(good) || !goods[good]) return 0;
  const price = goods[good].basePrice;
  if ((seller.inventory[good] ?? 0) < 1 || buyer.money < price || !Number.isSafeInteger(seller.money + price)) return 0;
  buyer.money -= price;
  seller.money += price;
  seller.inventory[good]--;
  world.containers[shop.containerId].items[good].stock++;
  world.trades++;
  return 1;
}

/** 必须亲自走到货箱旁搬运；输出只放入货箱，个人口粮和原料按负重限制取回。 */
export function syncShopInventory(world: World, npc: Npc, shop: Shop): void {
  const chest = world.containers[shop.containerId];
  if (!npc.position || !nearby(npc.position, chest.position)) return;
  for (const id of Object.keys(goods)) {
    if (shop.stockGoods.includes(id)) {
      const amount = Math.max(0, (npc.inventory[id] ?? 0) - (npc.reserve[id] ?? 0));
      chest.items[id].stock += amount;
      npc.inventory[id] = (npc.inventory[id] ?? 0) - amount;
    }
    const target = shop.stockGoods.includes(id) ? npc.reserve[id] ?? 0 : npc.carryTarget[id] ?? 0;
    const amount = Math.min(Math.max(0, target - (npc.inventory[id] ?? 0)), chest.items[id].stock, carryCapacity(npc, id));
    chest.items[id].stock -= amount;
    npc.inventory[id] = (npc.inventory[id] ?? 0) + amount;
  }
}

/** 物品只在实际食用或生产投入时减少；交易与存取不计作消耗。 */
export function recordUse(world: World, good: string, amount = 1): void {
  world.dayLedger[good].demand += amount;
  world.dayLedger[good].consumed += amount;
}
export function eatCarried(world: World, npc: Npc): void {
  for (const need of ['hunger', 'thirst'] as const) {
    if (npc.needs[need] > rules.survival.consumeBelow) continue;
    const good = Object.keys(goods).find(id => (goods[id].effects[need] ?? 0) > 0 && (npc.inventory[id] ?? 0) > 0);
    if (good && consume(npc, good)) recordUse(world, good);
  }
}

/** 回到自家箱子旁才可以补充随身库存；下班后将超出携带目标的物资存回。 */
export function syncHomeInventory(world: World, npc: Npc): void {
  const chest = homeChest(world, npc);
  if (!npc.position || !chest || !nearby(npc.position, chest.position)) return;
  for (const id of Object.keys(goods)) {
    const target = npc.carryTarget[id] ?? 0;
    const carried = npc.inventory[id] ?? 0;
    if (carried < target) {
      const taken = Math.min(target - carried, chest.items[id].stock, carryCapacity(npc, id));
      npc.inventory[id] = carried + taken;
      chest.items[id].stock -= taken;
    } else if (npc.activity !== 'work' && carried > target) {
      chest.items[id].stock += carried - target;
      npc.inventory[id] = target;
    }
  }
}

/** 有原料才生产，产出归生产者；库存达到目标则停工，绝不凭空发金币。 */
export function produce(world: World, npc: Npc): void {
  const job = jobs[npc.job];
  if (Object.keys(job.outputs).some(id => ownedStock(world, npc, id) >= job.stockTarget)) return;
  if (!productionFits(npc, job.inputs, job.outputs)) return;
  if (Object.entries(job.inputs).some(([id, amount]) => (npc.inventory[id] ?? 0) < amount)) return;
  for (const [id, amount] of Object.entries(job.inputs)) { npc.inventory[id] -= amount; recordUse(world, id, amount); }
  for (const [id, amount] of Object.entries(job.outputs)) {
    npc.inventory[id] = (npc.inventory[id] ?? 0) + amount;
    world.dayLedger[id].produced += amount;
  }
  npc.workHours++;
}

/** 优先从资金较少的同价卖家购买，轮换平局顺序，避免两位农夫长期只有一人卖出粮食。 */
export function findSeller(world: World, npc: Npc, good: string): Shop | undefined {
  if (npc.money < goods[good].basePrice) return undefined;
  const all = Object.values(world.shops);
  const offset = (world.time.day + world.time.hour) % Math.max(1, all.length);
  return [...all.slice(offset), ...all.slice(0, offset)]
    .filter(shop => shop.ownerId !== npc.id && shopOpen(world, shop) && saleStock(world, shop, good) > 0)
    .sort((a, b) => world.npcs.find(n => n.id === a.ownerId)!.money - world.npcs.find(n => n.id === b.ownerId)!.money)[0];
}

/** market 只是全社会存量的只读统计，不是任何人可以随意取用的公共仓库。 */
export function refreshEconomy(world: World): void {
  for (const [id, definition] of Object.entries(goods)) {
    const carried = world.npcs.reduce((sum, npc) => sum + (npc.inventory[id] ?? 0), 0) + (world.player?.inventory[id] ?? 0);
    const stored = Object.values(world.containers).reduce((sum, chest) => sum + chest.items[id].stock, 0);
    const ground = 'groundItems' in world ? (world.groundItems as { good: string; quantity: number }[]).filter(item => item.good === id).reduce((sum, item) => sum + item.quantity, 0) : 0;
    world.market[id] = { ...definition, price: definition.basePrice, stock: carried + stored + ground };
  }
}
export const totalGold = (world: World): number => world.npcs.reduce((sum, npc) => sum + npc.money, 0) + (world.player?.money ?? 0);
export function resetLedger(world: World): void {
  refreshEconomy(world);
  world.dayLedger = Object.fromEntries(Object.entries(world.market).map(([id, good]) => [id, {
    openingStock: good.stock, produced: 0, demand: 0, consumed: 0, unmet: 0, closingStock: good.stock, price: good.price,
  }]));
  world.shortages = [];
}
export function finishDay(world: World): DailyReport {
  refreshEconomy(world);
  for (const [id, entry] of Object.entries(world.dayLedger)) { entry.closingStock = world.market[id].stock; entry.price = world.market[id].price; }
  return { day: world.time.day, goods: structuredClone(world.dayLedger), shortages: structuredClone(world.shortages), gold: totalGold(world), initialGold: world.initialGold, trades: world.trades };
}
