import { createWorld, advanceHours } from './world.js';
import { createMap } from '../data/map.js';
import { moveActor, consume, samePosition, regionId, actorMap } from './actors.js';

export function createAdventure() {
  const world = createWorld();
  world.map = createMap();
  for (const npc of world.npcs) npc.position = { ...world.map.places[npc.home] };
  world.player = { id: 'player', name: '旅人', position: { ...world.map.places['你的住所'] },
    inventory: { bread: 0, water: 0 }, needs: { hunger: 0, thirst: 0, fatigue: 0 }, activity: 'leisure' };
  world.chest = { id: 'public-chest', name: '公共箱子', position: { ...world.map.places['公共箱子'] }, items: world.market };
  world.groundItems = [{ id: 'starter-bread', good: 'bread', quantity: 1, position: { x: 1, y: 4, mapId: 'home:你的住所' } }];
  world.history = [];
  advanceHours(world, 7);
  return world;
}

// UI 只提交命令、读取结果；无效行动不改变世界或时间。
export function act(world, action) {
  const player = world.player;
  let hours = 1;
  let message;
  if (action.type === 'interact') {
    if (samePosition(player.position, world.chest.position)) return { ok: true, menu: 'chest', message: '打开箱子。', reports: [] };
    const item = world.groundItems.find(item => item.quantity > 0 && samePosition(item.position, player.position));
    if (item) return act(world, { type: 'pickup', itemId: item.id });
    if (actorMap(world.map, player.position).rows[player.position.y][player.position.x] === 'b') return act(world, { type: 'sleep' });
    return { ok: true, menu: 'backpack', message: '打开背包。', reports: [] };
  } else if (action.type === 'pickup') {
    const item = world.groundItems.find(item => item.id === action.itemId && item.quantity > 0 && samePosition(item.position, player.position));
    if (!item) return { ok: false, message: '脚下没有可拾取的物品。', reports: [] };
    player.inventory[item.good] = (player.inventory[item.good] || 0) + item.quantity;
    message = '拾起了 ' + item.quantity + ' 份' + world.market[item.good].name + '。';
    item.quantity = 0;
  } else if (action.type === 'transfer') {
    if (!samePosition(player.position, world.chest.position)) return { ok: false, message: '请站在箱子上操作。', reports: [] };
    const item = Object.hasOwn(world.chest.items, action.good) ? world.chest.items[action.good] : null;
    if (!item || !['take', 'deposit'].includes(action.direction)) return { ok: false, message: '无效的物品转移。', reports: [] };
    const carried = player.inventory[action.good] || 0;
    if (action.direction === 'take') {
      if (item.stock < 1) return { ok: false, message: '箱子里没有这件物品。', reports: [] };
      item.stock--;
      player.inventory[action.good] = carried + 1;
      message = '从箱子拿取一份' + item.name + '。';
    } else {
      if (carried < 1) return { ok: false, message: '背包里没有这件物品。', reports: [] };
      player.inventory[action.good]--;
      item.stock++;
      message = '向箱子存入一份' + item.name + '。';
    }
  } else if (action.type === 'move') {
    const previousRegion = regionId(player.position);
    const direction = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[action.direction];
    if (!direction || !moveActor(player, ...direction, world.map)) return { ok: false, message: '无法向那里移动。', reports: [] };
    message = '你向前走了一格。';
    if (previousRegion !== regionId(player.position)) message = regionId(player.position) === 'town'
      ? '你走出房门，回到了小镇。' : `你进入了${actorMap(world.map, player.position).name}。`;
  } else if (action.type === 'take') {
    return act(world, { type: 'transfer', direction: 'take', good: action.good });
  } else if (action.type === 'use') {
    if (!consume(player, action.good)) return { ok: false, message: '背包中没有这种可用物资。', reports: [] };
    message = `你使用了一份${world.market[action.good].name}。`;
  } else if (action.type === 'wait') {
    hours = action.hours ?? 1;
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) return { ok: false, message: '等待时间为 1～168 小时。', reports: [] };
    message = `你等待了 ${hours} 小时。`;
  } else if (action.type === 'sleep') {
    if (!samePosition(player.position, world.map.places['你的住所'])) return { ok: false, message: '请进入自己的住所，走到床铺 b 处睡觉。', reports: [] };
    hours = (30 - world.time.hour) % 24 || 24;
    player.activity = 'sleep';
    message = '你睡到了早晨六点。';
  } else return { ok: false, message: '未知行动。', reports: [] };
  const reports = advanceHours(world, hours);
  player.activity = 'leisure';
  world.history.push({ ...world.time, message });
  if (world.history.length > 100) world.history.shift();
  return { ok: true, message, reports };
}

export function observe(world) {
  const region = actorMap(world.map, world.player.position);
  const currentRegion = regionId(world.player.position);
  const rows = region.rows.map(row => [...row]);
  for (const place of Object.values(world.map.places)) {
    if (regionId(place) === currentRegion) rows[place.y][place.x] = place.symbol;
  }
  if (currentRegion === 'town') for (const door of world.map.entrances) rows[door.y][door.x] = door.symbol;
  for (const item of world.groundItems) if (item.quantity > 0 && regionId(item.position) === currentRegion) rows[item.position.y][item.position.x] = '!';
  for (const npc of world.npcs) if (regionId(npc.position) === currentRegion) rows[npc.position.y][npc.position.x] = 'N';
  rows[world.player.position.y][world.player.position.x] = '@';
  return {
    time: { ...world.time }, map: rows.map(row => row.join('')).join('\n'),
    regionName: currentRegion === 'town' ? '小镇' : region.name,
    indoors: currentRegion !== 'town',
    places: currentRegion === 'town' ? Object.entries(world.map.places).filter(([, place]) => samePosition(place, world.player.position)).map(([name]) => name)
      : [region.name, region.rows[world.player.position.y][world.player.position.x] === 'b' ? '床铺' : '室内'],
    nearby: world.npcs.filter(npc => regionId(npc.position) === currentRegion && Math.abs(npc.position.x - world.player.position.x) + Math.abs(npc.position.y - world.player.position.y) <= 2)
      .map(npc => ({ name: npc.name, activity: npc.activity, position: { ...npc.position }, destination: npc.location })),
  };
}
