import type { AdventureWorld, Action, ActionResult, Facing, Position } from '../types.js';

import { createWorld, advanceHours } from './world.js';
import { jobs, rules, playerConfig, tiles, dialogues, formatText } from '../data/config.js';
import { carryCapacity, carriedWeight } from './weight.js';
import { buyFromShop, sellToShop, nearby, shopOpen, refreshEconomy, resetLedger, recordUse, totalGold } from './economy.js';
import { moveActor, consume, samePosition, regionId, actorMap } from './actors.js';

/** 在经济世界上装配地图、玩家和交互对象，形成完整的冒险状态。 */
export function createAdventure(options: { automatic?: boolean } = {}): AdventureWorld {
  const base = createWorld();
  const map = base.map!;
  const world: AdventureWorld = {
    ...base,
    clock: { automatic: options.automatic ?? rules.clock.automatic, intervalMs: rules.clock.intervalMs, actionUsed: false },
    map,
    npcs: base.npcs.map(npc => ({ ...npc, position: { ...map.destinations[npc.home] } })),
    player: { ...structuredClone(playerConfig), position: { ...map.destinations[playerConfig.home] } },
    groundItems: structuredClone(rules.groundItems),
    history: [],
  };
  // 通过统一时间入口推进至开局七点，让 NPC 同样经历清晨的需求与移动。
  world.initialGold = totalGold(world);
  resetLedger(world);
  advanceHours(world, rules.startAdvanceHours);
  return world;
}

/** 方向定义同时供移动、检查和状态栏使用，避免各入口对同一方向解释不同。 */
export const facingInfo: Record<Facing, { symbol: string; dx: number; dy: number }> = {
  n: { symbol: '↑', dx: 0, dy: -1 }, s: { symbol: '↓', dx: 0, dy: 1 },
  w: { symbol: '←', dx: -1, dy: 0 }, e: { symbol: '→', dx: 1, dy: 0 },
  self: { symbol: '○', dx: 0, dy: 0 },
};

/** 目标坐标始终处于玩家当前空间，不调用移动规则，不会穿过房门或被障碍阻止。 */
export function targetPosition(world: AdventureWorld): Position {
  const { dx, dy } = facingInfo[world.player.facing];
  return { ...world.player.position, x: world.player.position.x + dx, y: world.player.position.y + dy };
}

/** 状态栏的目标摘要：与检查共用目标坐标，每次绘制读取真实状态，不缓存旧名称。
 * 人物、物品优先于地点和地形；同格多种对象合并显示，已拾取的物品不再列出。 */
export function targetName(world: AdventureWorld): string {
  const position = targetPosition(world);
  const tile = actorMap(world.map, position).rows[position.y]?.[position.x];
  if (tile === undefined) return '地图边界外';
  const names = world.npcs.filter(npc => samePosition(npc.position, position)).map(npc => npc.name);
  for (const item of world.groundItems.filter(item => item.quantity > 0 && samePosition(item.position, position))) {
    names.push(world.market[item.good].name);
  }
  if (names.length) return [...new Set(names)].join('、');
  const entrance = world.map.connections.find(connection => samePosition(connection, position));
  if (entrance) return entrance.kind === 'door' ? `${entrance.name}房门` : entrance.name;
  const placeNames = Object.entries(world.map.places).filter(([, place]) => samePosition(place, position)).map(([id, place]) => place.name ?? id);
  if (placeNames.length) return placeNames.join('、');
  return tiles[tile]?.name ?? '未知地形';
}

/** 检查指定格的实际内容，不修改库存、需求、历史或游戏时间。
 * 物品、居民与场景对象分别收集，保证障碍物及同格多个对象都能被识别。 */
function inspectAt(world: AdventureWorld, position: Position): string {
  const region = actorMap(world.map, position);
  const tile = region.rows[position.y]?.[position.x];
  if (tile === undefined) return '目标位置在地图范围外。';
  const details: string[] = [];
  for (const item of world.groundItems.filter(item => item.quantity > 0 && samePosition(item.position, position))) {
    const good = world.market[item.good];
    details.push(`${good.name} ×${item.quantity}。${good.description} 单件重量 ${good.weight}，当前单价 ${good.price} 金币。站到物品所在格后按 F 拾取。`);
  }
  for (const npc of world.npcs.filter(npc => samePosition(npc.position, position))) {
    details.push(`${npc.name}（${npc.alive ? '存活' : '死亡'}，生命 ${npc.health}/${npc.maxHealth}，负重 ${carriedWeight(npc)}/${npc.maxCarryWeight}）：${npc.personality}，职业为${jobs[npc.job].name}，当前目的地为${npc.destinationName ?? world.map.places[npc.location].name}。面向此人按 F 交谈。`);
  }
  const shop = Object.values(world.shops).find(shop => samePosition(shop.position, position));
  if (shop) {
    const owner = world.npcs.find(npc => npc.id === shop.ownerId)!;
    details.push(`${shop.name}，店主${owner.name}，${shopOpen(world, shop) ? '营业中' : '未营业'}，营业 ${shop.openStart}～${shop.openEnd} 点。出售：${Object.keys(world.containers[shop.containerId].items).filter(id => world.containers[shop.containerId].items[id].stock > 0).map(id => `${world.market[id].name} ${world.market[id].price}金币`).join('、')}。`);
  }
  const container = Object.values(world.containers).find(container => samePosition(container.position, position));
  if (container?.ownerId) details.push(`物资主人：${container.ownerId === world.player.id ? '你' : world.npcs.find(npc => npc.id === container.ownerId)?.name ?? container.ownerId}。`);
  // 对象的名称、用途和交互说明只来自叠加层，底图只在没有对象时提供地形说明。
  for (const object of Object.values(world.map.places).filter(object => samePosition(object, position))) {
    details.push(formatText(object.description ?? object.name ?? '场景对象', { wakeHour: rules.wakeHour }));
  }
  if (!details.length) details.push(tiles[tile].description);
  return details.join(' ');
}

/** 保留单独读取脚下内容的接口；E 键使用 inspectTarget，按当前目标方向检查。 */
export function inspectGround(world: AdventureWorld): string {
  return inspectAt(world, world.player.position);
}

/** ○ 检查脚下，其余方向只检查相邻一格，前方有墙壁也不会继续穿透。 */
export function inspectTarget(world: AdventureWorld): string {
  return inspectAt(world, targetPosition(world));
}

// UI 只提交命令、读取结果；撞墙时只更新目标方向，不推进时间或改变位置。
export function act(world: AdventureWorld, action: Action): ActionResult {
  const player = world.player;
  let hours = 1;
  let message: string;
  if (!player.alive && action.type !== 'inspect') return { ok: false, message: '你已经死亡，无法继续行动；Ctrl+C 退出后可重新开始。', reports: [] };
  const timed = ['move', 'pickup', 'transfer', 'buy', 'sell', 'use', 'wait', 'sleep'].includes(action.type);
  if (world.clock.automatic && timed) {
    // 自动睡眠不会瞬间跳到明早，空格可提前醒来；其他实际行动须等待睡醒。
    if (world.clock.sleepUntil && action.type !== 'wait') return { ok: false, message: '正在睡眠，空格可提前醒来，世界仍在运行。', reports: [] };
    if (world.clock.actionUsed) return { ok: false, message: '本时段已行动，请等待下一小时。', reports: [] };
  }
  // interact：F 按位置选择箱子、拾取或床铺，背包由 B 独立打开；仅打开菜单不耗时。
  // backpack：独立打开背包，不要求站在空地，也不触发脚下物品或床铺的交互。
  if (action.type === 'backpack') return { ok: true, menu: 'backpack', message: '打开背包。', reports: [] };
  if (action.type === 'inspect') return { ok: true, message: inspectTarget(world), reports: [] };
  // target-self：只选择脚下，不等待、不移动，方便随时检查当前格物品。
  if (action.type === 'target-self') {
    player.facing = 'self';
    return { ok: true, message: '目标方向 ○（脚下）。', reports: [] };
  }
  // turn：只改变朝向，不移动、不耗时；非法方向不会影响原状态。
  if (action.type === 'turn') {
    if (!['n', 's', 'w', 'e'].includes(action.direction ?? '')) return { ok: false, message: '无效的转向。', reports: [] };
    player.facing = action.direction as Exclude<Facing, 'self'>;
    return { ok: true, message: `原地转向 ${facingInfo[player.facing].symbol}。`, reports: [] };
  }
  // 对话与交易都是 NPC 的交互选项；只在面前目标仍然有效时执行，防止远程打开旧菜单。
  if (action.type === 'talk' || action.type === 'open-trade') {
    const npc = world.npcs.find(npc => npc.id === action.npcId && npc.alive && samePosition(npc.position, targetPosition(world)));
    if (!npc) return { ok: false, message: '请先面向要交互的人物。', reports: [] };
    if (action.type === 'open-trade') {
      const shop = Object.values(world.shops).find(shop => shop.ownerId === npc.id && shopOpen(world, shop));
      if (!shop) return { ok: false, message: '对方现在没有在店内营业，仍可以正常对话。', reports: [] };
      return { ok: true, menu: 'shop', shopId: shop.id, message: `与${npc.name}交易，商品来自店内货箱。`, reports: [] };
    }
    const job = jobs[npc.job];
    const situation = npc.needs.thirst <= rules.survival.buyBelow ? dialogues.thirsty
      : npc.needs.hunger <= rules.survival.buyBelow ? dialogues.hungry
      : npc.activity === 'work' ? dialogues.working
      : npc.activity === 'sleep' ? dialogues.sleeping
      : npc.activity === 'selling' ? dialogues.selling
      : npc.activity === 'hauling' ? dialogues.hauling
      : npc.activity === 'shopping' ? dialogues.shopping : dialogues.leisure;
    const values = { name: npc.name, job: job.name, workplace: world.map.places[job.workplace].name ?? job.name };
    const text = [npc.greeting || dialogues.defaultGreeting,
      formatText(dialogues.introduction, values), formatText(situation, values)].join(' ');
    return { ok: true, message: `你与${npc.name}交谈。`, reports: [], dialogue: { speaker: npc.name, text } };
  }
  if (action.type === 'interact') {
    const npc = player.facing === 'self' ? undefined : world.npcs.find(npc => npc.alive && samePosition(npc.position, targetPosition(world)));
    if (npc) {
      const shop = Object.values(world.shops).find(shop => shop.ownerId === npc.id && shopOpen(world, shop));
      return { ok: true, message: `与${npc.name}交互。`, reports: [], interaction: { npcId: npc.id, name: npc.name, shopId: shop?.id } };
    }
    // 优先打开面向格的容器，也兼容站在可通行箱子上；是否容器取决于 kind，与字符无关。
    const container = Object.values(world.containers).find(container => samePosition(container.position, targetPosition(world)))
      ?? Object.values(world.containers).find(container => samePosition(container.position, player.position));
    if (container) {
      if (container.ownerId && container.ownerId !== player.id) return { ok: false, message: '这是其他居民的私人物资，不能直接拿取；请前往店铺交易。', reports: [] };
      return { ok: true, menu: 'chest', containerId: container.id, message: `打开${container.name}。`, reports: [] };
    }
    const item = world.groundItems.find(item => item.quantity > 0 && samePosition(item.position, player.position));
    if (item) return act(world, { type: 'pickup', itemId: item.id });
    if (Object.values(world.map.places).some(object => object.kind === 'bed' && samePosition(object, player.position))) return act(world, { type: 'sleep' });
    return { ok: false, message: '这里没有可交互的对象；按 B 打开背包。', reports: [] };
  // pickup：按剩余负重拾取脚下物品，装不下的部分保留在地面，不丢失或重复生成。
  } else if (action.type === 'pickup') {
    const item = world.groundItems.find(item => item.id === action.itemId && item.quantity > 0 && samePosition(item.position, player.position));
    if (!item) return { ok: false, message: '脚下没有可拾取的物品。', reports: [] };
    const quantity = Math.min(item.quantity, carryCapacity(player, item.good));
    if (!quantity) return { ok: false, message: '负重已满，无法拾取；请先把物品存入箱子。', reports: [] };
    player.inventory[item.good] = (player.inventory[item.good] || 0) + quantity;
    item.quantity -= quantity;
    message = `拾起 ${quantity} 份${world.market[item.good].name}，负重 ${carriedWeight(player)}/${player.maxCarryWeight}。${item.quantity ? `地上还剩 ${item.quantity} 份。` : ''}`;
  // transfer：先验证距离与物品，再在同一库存和背包之间转移一份。
  } else if (action.type === 'buy' || action.type === 'sell') {
    const shop = world.shops[action.shopId ?? ''];
    const good = action.good ?? '';
    if (!shop || !Object.hasOwn(world.market, good) || !world.npcs.find(npc => npc.id === shop.ownerId && npc.position && nearby(player.position, npc.position))) return { ok: false, message: '请靠近要交易的店铺。', reports: [] };
    const amount = action.type === 'buy' ? buyFromShop(world, player, shop, good) : sellToShop(world, player, shop, good);
    if (!amount) return { ok: false, message: '交易失败：请检查店员是否在柜台、货箱库存、双方金币、收购种类和剩余负重。', reports: [] };
    message = `${action.type === 'buy' ? '买入' : '卖出'}一份${world.market[good].name}，${world.market[good].price} 金币。`;
  } else if (action.type === 'transfer') {
    const container = action.containerId ? world.containers[action.containerId]
      : Object.values(world.containers).find(container => samePosition(container.position, targetPosition(world)) || samePosition(container.position, player.position));
    if (!container || !(samePosition(container.position, player.position) || samePosition(container.position, targetPosition(world)))) return { ok: false, message: '请靠近并面向要操作的容器。', reports: [] };
    if (container.ownerId && container.ownerId !== player.id) return { ok: false, message: '无法存取其他居民的私人物资。', reports: [] };
    const item = Object.hasOwn(container.items, action.good ?? '') ? container.items[action.good ?? ''] : null;
    if (!item || !['take', 'deposit'].includes(action.direction ?? '')) return { ok: false, message: '无效的物品转移。', reports: [] };
    const carried = player.inventory[action.good ?? ''] || 0;
    if (action.direction === 'take') {
      if (carryCapacity(player, action.good!) < 1) return { ok: false, message: '负重不足，无法再从容器取出这件物品。', reports: [] };
      if (item.stock < 1) return { ok: false, message: '箱子里没有这件物品。', reports: [] };
      item.stock--;
      player.inventory[action.good ?? ''] = carried + 1;
      message = '从箱子拿取一份' + item.name + '。';
    } else {
      if (carried < 1) return { ok: false, message: '背包里没有这件物品。', reports: [] };
      player.inventory[action.good ?? '']--;
      item.stock++;
      message = '向箱子存入一份' + item.name + '。';
    }
  // move：方向转换为格子增量；移动规则负责碰撞和门的空间切换。
  } else if (action.type === 'move') {
    const previousRegion = regionId(player.position);
    const directions: Record<string, [number, number]> = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
    const direction = directions[action.direction ?? ''];
    if (!direction) return { ok: false, message: '无效的移动方向。', reports: [] };
    // 先转向再尝试移动：即使目标是墙或家具，E 也能检查这个无法站上的格子。
    player.facing = action.direction as Exclude<Facing, 'self'>;
    if (!moveActor(player, direction[0], direction[1], world.map, world.npcs.filter(npc => npc.alive).map(npc => npc.position))) return { ok: false, message: '前方有阻挡，已转向但未移动；按 E 检查。', reports: [] };
    message = '你向前走了一格。';
    if (previousRegion !== regionId(player.position)) message = `你来到了${actorMap(world.map, player.position).name}。`;
  // take：保留原命令接口，复用 transfer 的验证与记时，不重复修改库存。
  } else if (action.type === 'take') {
    return act(world, { type: 'transfer', direction: 'take', good: action.good });
  // use：无可用物品时立即返回，不消耗时间或增加行动记录。
  } else if (action.type === 'use') {
    if (!consume(player, action.good ?? '')) return { ok: false, message: '背包中没有这种可用物资。', reports: [] };
    recordUse(world, action.good!);
    message = `你使用了一份${world.market[action.good ?? ''].name}。`;
  // wait：限制单次快进范围，所有 NPC 和经济仍逐小时同步推进。
  } else if (action.type === 'wait') {
    hours = action.hours ?? 1;
    if (!Number.isInteger(hours) || hours < 1 || hours > rules.maxWaitHours) return { ok: false, message: `等待时间为 1～${rules.maxWaitHours} 小时。`, reports: [] };
    // 等待只推进世界，保留当前方向；句点键才负责将目标切回脚下。
    if (world.clock.automatic) {
      if (world.clock.sleepUntil) { delete world.clock.sleepUntil; player.activity = 'leisure'; message = '你提前醒来了。'; }
      else message = '你原地等待，世界按固定速度继续运转。';
    } else message = `你等待了 ${hours} 小时。`;
  // sleep：只能在自己的床上睡眠；六点整再次睡眠时推进整整一天。
  } else if (action.type === 'sleep') {
    if (!samePosition(player.position, world.map.destinations[playerConfig.home])) return { ok: false, message: '请进入自己的住所，走到自己的床铺上睡觉。', reports: [] };
    hours = (rules.hoursPerDay + rules.wakeHour - world.time.hour) % rules.hoursPerDay || rules.hoursPerDay;
    player.activity = 'sleep';
    if (world.clock.automatic) {
      const absolute = (world.time.day - 1) * rules.hoursPerDay + world.time.hour + hours;
      world.clock.sleepUntil = { day: Math.floor(absolute / rules.hoursPerDay) + 1, hour: absolute % rules.hoursPerDay };
      message = `开始睡眠，世界继续自动运行，到下次 ${rules.wakeHour} 点醒来；空格可提前醒来。`;
    } else message = `你睡到了下一次 ${rules.wakeHour} 点。`;
  } else return { ok: false, message: '未知行动。', reports: [] };
  // 自动模式只提交行动，真实时钟负责唯一的时间推进；行动模式保留原有快进规则。
  const reports = world.clock.automatic ? [] : advanceHours(world, hours);
  if (world.clock.automatic) { world.clock.actionUsed = true; refreshEconomy(world); }
  if (player.alive && !world.clock.sleepUntil) player.activity = 'leisure';
  world.history.push({ ...world.time, message });
  if (world.history.length > rules.historyLimit) world.history.shift();
  return { ok: true, message, reports };
}

/** 生成只读视图：复制地形后按地点、地面物品、NPC、玩家的顺序覆盖符号。
 * 仅渲染当前空间，附近居民也必须同处该空间；观察不会推进世界时间。 */
export function observe(world: AdventureWorld) {
  const region = actorMap(world.map, world.player.position);
  const currentRegion = regionId(world.player.position);
  const rows = region.rows.map(row => [...row]);
  for (const place of Object.values(world.map.places)) {
    if (regionId(place) === currentRegion) rows[place.y][place.x] = place.symbol;
  }
  for (const connection of world.map.connections) if (regionId(connection) === currentRegion) rows[connection.y][connection.x] = connection.symbol;
  for (const item of world.groundItems) if (item.quantity > 0 && regionId(item.position) === currentRegion) rows[item.position.y][item.position.x] = rules.symbols.item;
  for (const npc of world.npcs.filter(npc => npc.alive)) if (regionId(npc.position) === currentRegion) rows[npc.position.y][npc.position.x] = rules.symbols.npc;
  rows[world.player.position.y][world.player.position.x] = rules.symbols.player;
  return {
    time: { ...world.time }, map: rows.map(row => row.join('')).join('\n'),
    regionName: region.name,
    indoors: region.indoors,
    places: Object.entries(world.map.places).filter(([, place]) => samePosition(place, world.player.position)).map(([id, place]) => place.name ?? id)
      .concat(world.map.connections.filter(connection => samePosition(connection, world.player.position)).map(connection => connection.name)),
    nearby: world.npcs.filter(npc => npc.alive && regionId(npc.position) === currentRegion && Math.abs(npc.position.x - world.player.position.x) + Math.abs(npc.position.y - world.player.position.y) <= rules.nearbyDistance)
      .map(npc => ({ name: npc.name, activity: npc.activity, position: { ...npc.position }, destination: npc.destinationName ?? world.map.places[npc.location].name ?? npc.location })),
  };
}
