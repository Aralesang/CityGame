import itemData from '../config/items.json' with { type: 'json' };
import jobData from '../config/jobs.json' with { type: 'json' };
import npcData from '../config/npcs.json' with { type: 'json' };
import mapData from '../config/maps.json' with { type: 'json' };
import tileData from '../config/tiles.json' with { type: 'json' };
import gameData from '../config/game.json' with { type: 'json' };
import dialogueData from '../config/dialogues.json' with { type: 'json' };
import type { Activity, Facing, Good, Job, Needs, Position, Resident, GameTime, Player, AdventureWorld, MapRegion } from '../types.js';

/** JSON 使用明确类型约束，拼错字段或给错基础类型会在编译时报错。
 * 配置仅作初始化来源，世界中的库存、需求和位置必须复制后再修改。 */
export const goods: Record<string, Good> = itemData as Record<string, Good>;
/** 坐标引用只是配置定位方式，不是对象实例 ID；运行时对象身份由 UUID 表示。 */
export function positionKey(position: Position): string { return `${position.mapId}:${position.x},${position.y}`; }
// 兼容现有寻路入口的字符串索引，配置文件本身始终填写明确的地图与坐标。
export const jobs: Record<string, Job> = Object.fromEntries(Object.entries(jobData).map(([key, job]) => [key, { ...job, workplace: positionKey(job.workplace) }]));
export const residents: Resident[] = npcData.map(npc => ({ ...npc, home: positionKey(npc.home) }));
/** tiles 是部件模板；地图中的字符引用模板，坐标覆盖只修改这一格的属性。
 * destination/homeTarget 可用 null 清除模板行为，防止共享模板产生不需要的交互。 */
export interface TileConfig {
  name: string; kind: string; blocked: boolean; description: string; symbol?: string; ownerId?: string; shopOwner?: string; contents?: Record<string, number>;
  destination?: (Position & { mapId: string }) | null; homeTarget?: (Position & { mapId: string }) | null;
}
export type TileOverride = Partial<TileConfig>;
export interface MapDefinition extends MapRegion { overrides?: Record<string, TileOverride> }
export interface ResolvedTile extends TileConfig {
  key: string; position: Position & { mapId: string }; symbol: string;
}
export const maps: { defaultMapId: string; regions: Record<string, MapDefinition> } = mapData;
export const tiles: Record<string, TileConfig> = tileData;

/** 逐格展开模板与覆盖，不修改原配置。仅生成坐标索引，不在配置加载或校验时创建实例 ID。
 * 方位、名称、阻挡、传送与检查统一读取展开结果，不再在别处另造一套场景对象。 */
export function resolveMapTiles(): ResolvedTile[] {
  const result: ResolvedTile[] = [];
  for (const [mapId, region] of Object.entries(maps.regions)) for (const [y, row] of region.rows.entries()) {
    for (const [x, character] of [...row].entries()) {
      const template = tiles[character];
      if (!template) throw new Error(`配置错误：maps.${mapId}.rows (${x},${y}) 未定义 tiles.${character}`);
      const override = region.overrides?.[`${x},${y}`];
      result.push({ ...structuredClone(template), ...structuredClone(override ?? {}),
        key: positionKey({ mapId, x, y }), position: { mapId, x, y }, symbol: override?.symbol ?? template.symbol ?? character });
    }
  }
  return result;
}
/** 数组、字典保持领域类型，清空地面物品列表或增删商品时不会依赖 JSON 推断出的固定键。 */
export interface GameConfig {
  clock: { automatic: boolean; intervalMs: number };
  startTime: GameTime; startAdvanceHours: number; hoursPerDay: number;
  sleepStart: number; sleepEnd: number; wakeHour: number; needMin: number; needMax: number;
  survival: { starvationDamage: number; dehydrationDamage: number; consumeBelow: number; buyBelow: number; purchaseTarget: number }; awakeNeedChange: Needs; sleepNeedChange: Needs;
  maxWaitHours: number; historyLimit: number; nearbyDistance: number;
  player: Omit<Player, 'position'> & { home: string };
  groundItems: AdventureWorld['groundItems'];
  symbols: { player: string; npc: string; item: string };
  activityNames: Record<Activity, string>; summaryGoods: string[]; openingMessage: string;
}
// JSON 的字符串会被推断为 string；收窄方向和活动后，在启动校验中确认实际值有效。
export const rules: GameConfig = { ...gameData, player: {
  ...gameData.player, home: positionKey(gameData.player.home), facing: gameData.player.facing as Facing, activity: gameData.player.activity as Activity,
} };
export const playerConfig = rules.player;
export const dialogues = dialogueData;

/** 替换配置文本中的命名占位符，不执行任何脚本；未知占位符保留原样。 */
export function formatText(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (token, key: string) => Object.hasOwn(values, key) ? String(values[key]) : token);
}

/** 启动时校验跨表引用及关键数值，错误直接指明配置位置，避免进入世界后才崩溃。
 * 这是加载配置的保护逻辑，不推进世界，也不替开发者执行游戏测试。 */
function validateConfig(): void {
  const requireConfig = (condition: unknown, path: string, reason: string): void => {
    if (!condition) throw new Error(`配置错误：${path} ${reason}`);
  };
  const positive = (value: number) => Number.isFinite(value) && value > 0;
  const whole = (value: number) => Number.isSafeInteger(value) && value >= 0;
  requireConfig(typeof rules.clock.automatic === 'boolean' && whole(rules.clock.intervalMs) && rules.clock.intervalMs >= 100, 'game.clock', 'automatic 必须是布尔值，intervalMs 至少100毫秒');
  const needs = ['hunger', 'thirst', 'fatigue'];
  const cells = resolveMapTiles();
  const cellIds = new Set(cells.map(cell => cell.key));
  requireConfig(cellIds.size === cells.length, 'maps', '地图格子坐标不能重复');
  for (const [character, tile] of Object.entries(tiles)) requireConfig(character.length === 1 && tile.name && tile.kind && typeof tile.blocked === 'boolean', `tiles.${character}`, '模板键必须是单字符，且必须定义名称、类别与阻挡');
  requireConfig(residents.length > 0 && new Set(residents.map(npc => npc.id)).size === residents.length, 'npcs.json', '需要至少一名居民，且 id 不能重复');
  requireConfig(positive(rules.hoursPerDay) && Number.isSafeInteger(rules.hoursPerDay), 'game.hoursPerDay', '必须为正整数');
  requireConfig(whole(rules.startTime.day) && rules.startTime.day > 0, 'game.startTime.day', '必须为正整数');
  requireConfig(Number.isFinite(rules.needMax) && Number.isFinite(rules.needMin) && rules.needMax > rules.needMin, 'game.needMax', '必须大于 needMin');
  for (const [key, value] of Object.entries({ sleepStart: rules.sleepStart, sleepEnd: rules.sleepEnd, wakeHour: rules.wakeHour, startHour: rules.startTime.hour })) {
    requireConfig(whole(value) && value < rules.hoursPerDay, `game.${key}`, '必须在一天的小时范围内');
  }
  requireConfig(whole(rules.startAdvanceHours) && positive(rules.maxWaitHours) && whole(rules.maxWaitHours), 'game', '开局快进和等待上限必须为有效整数');
  requireConfig(positive(rules.historyLimit) && whole(rules.historyLimit) && whole(rules.nearbyDistance), 'game', '历史上限和附近距离无效');
  requireConfig(['n', 's', 'w', 'e', 'self'].includes(playerConfig.facing), 'game.player.facing', '方向无效');
  requireConfig(['sleep', 'work', 'rest', 'leisure'].includes(playerConfig.activity), 'game.player.activity', '活动无效');
  requireConfig(rules.summaryGoods.length <= 2 && rules.summaryGoods.every(id => Object.hasOwn(goods, id)), 'game.summaryGoods', '最多配置两种已存在商品');
  for (const symbol of Object.values(rules.symbols)) requireConfig(symbol.length === 1, 'game.symbols', '显示符号必须为单字符');
  for (const change of [rules.awakeNeedChange, rules.sleepNeedChange]) for (const value of Object.values(change)) requireConfig(Number.isFinite(value), 'game.needChange', '每小时变化必须为有限数值');
  for (const [id, good] of Object.entries(goods)) {
    requireConfig(whole(good.basePrice) && positive(good.basePrice) && positive(good.weight) && Number.isSafeInteger(good.weight * 1000), `items.${id}`, '金币价格须为正整数，单件重量须为正且最多三位小数');
    for (const [need, amount] of Object.entries(good.effects)) requireConfig(needs.includes(need) && positive(amount), `items.${id}.effects.${need}`, '需求名无效或恢复量不是正数');
    if (good.purchaseNeed) requireConfig(needs.includes(good.purchaseNeed) && positive(good.effects[good.purchaseNeed] ?? 0), `items.${id}.purchaseNeed`, '必须对应正数恢复效果');
  }
  for (const [id, job] of Object.entries(jobs)) {
    requireConfig(cellIds.has(job.workplace), `jobs.${id}.workplace`, '引用了不存在的格子坐标');
    requireConfig(whole(job.stockTarget) && positive(job.stockTarget), `jobs.${id}`, '产出库存目标必须是正整数');
    for (const recipe of [job.inputs, job.outputs]) for (const [good, amount] of Object.entries(recipe)) requireConfig(Object.hasOwn(goods, good) && positive(amount) && whole(amount), `jobs.${id}.${good}`, '商品不存在或配方数量无效');
  }
  requireConfig(new Set(residents.map(npc => npc.home)).size === residents.length && !residents.some(npc => npc.home === playerConfig.home), 'npcs.home', '每个角色需独立出生住所，避免开局重叠');
  for (const npc of residents) {
    requireConfig(Object.hasOwn(jobs, npc.job) && cellIds.has(npc.home), `npcs.${npc.id}`, '职业或住所不存在');
    requireConfig(whole(npc.workStart) && whole(npc.workEnd) && npc.workStart <= npc.workEnd && npc.workEnd <= rules.hoursPerDay, `npcs.${npc.id}`, '工作时间无效');
    requireConfig(Number.isFinite(npc.money) && npc.money >= 0, `npcs.${npc.id}.money`, '金钱无效');
  }
  requireConfig(cellIds.has(playerConfig.home), 'game', '玩家住所不存在');
  for (const [good, quantity] of Object.entries(playerConfig.inventory)) requireConfig(Object.hasOwn(goods, good) && whole(quantity), `game.player.inventory.${good}`, '物品不存在或数量无效');
  for (const actor of [playerConfig, ...residents]) for (const [need, value] of Object.entries(actor.needs as Needs)) requireConfig(needs.includes(need) && Number.isFinite(value) && value >= rules.needMin && value <= rules.needMax, `初始需求.${need}`, '数值越界');
  requireConfig(Object.hasOwn(maps.regions, maps.defaultMapId), 'maps.defaultMapId', '默认地图不存在');
  const at = (position: Position): ResolvedTile | undefined => cells.find(cell => cell.position.mapId === position.mapId && cell.position.x === position.x && cell.position.y === position.y);
  const passable = (position: Position, path: string): void => {
    requireConfig(whole(position.x) && whole(position.y) && Boolean(position.mapId), path, '必须显式配置 mapId 和非负整数坐标');
    requireConfig(at(position) && !at(position)!.blocked, path, '目标格不存在或被阻挡');
  };
  for (const [mapId, region] of Object.entries(maps.regions)) {
    requireConfig(region.rows.length > 0 && region.rows[0].length > 0 && region.rows.every(row => row.length === region.rows[0].length), `maps.${mapId}.rows`, '地图不能为空且每行必须等宽');
    for (const key of Object.keys(region.overrides ?? {})) {
      requireConfig(/^(0|[1-9]\d*),(0|[1-9]\d*)$/.test(key), `maps.${mapId}.overrides.${key}`, '坐标键格式必须为 x,y');
      const allowed = ['name', 'kind', 'blocked', 'description', 'symbol', 'destination', 'homeTarget', 'ownerId', 'shopOwner', 'contents'];
      for (const field of Object.keys(region.overrides![key])) requireConfig(allowed.includes(field), `maps.${mapId}.overrides.${key}.${field}`, '未知覆盖字段');
      const [x, y] = key.split(',').map(Number);
      requireConfig(region.rows[y]?.[x] !== undefined, `maps.${mapId}.overrides.${key}`, '覆盖坐标超出地图范围');
    }
  }
  for (const cell of cells) {
    const path = `maps.${cell.position.mapId}.(${cell.position.x},${cell.position.y})`;
    requireConfig(cell.key.length > 0 && cell.symbol.length === 1 && cell.name && cell.kind && typeof cell.blocked === 'boolean', path, '坐标、名称、符号、类别或阻挡无效');
    if (cell.contents !== undefined || cell.ownerId !== undefined) requireConfig(cell.kind === 'container', path, 'contents 和 ownerId 只适用于容器');
    if (cell.ownerId) requireConfig(cell.ownerId === rules.player.id || residents.some(npc => npc.id === cell.ownerId), path, '容器主人不存在');
    for (const [good, quantity] of Object.entries(cell.contents ?? {})) requireConfig(Object.hasOwn(goods, good) && whole(quantity), `${path}.contents.${good}`, '道具不存在或数量无效');
    if (cell.shopOwner) requireConfig(cell.kind === 'door', path, '商店属性只能加在房屋入口上');
    if (cell.shopOwner) requireConfig(residents.some(npc => npc.id === cell.shopOwner), path, '店铺必须引用存在的 NPC');
    const portal = ['door', 'exit', 'path'].includes(cell.kind);
    requireConfig(portal === Boolean(cell.destination), path, '门、出口、道路必须配置 destination，其他类别不能传送');
    if (cell.destination) {
      requireConfig(!cell.blocked, path, '连接触发格不能阻挡');
      passable(cell.destination, `${path}.destination`);
      const target = at(cell.destination)!;
      const returningToDoor = cell.kind === 'exit' && target.kind === 'door' && target.destination?.mapId === cell.position.mapId;
      requireConfig(returningToDoor || !target.destination, `${path}.destination`, '落点不能是其他入口；出口返回原房门除外');
    }
    if (cell.homeTarget) {
      const bed = cells.find(other => other.key === positionKey(cell.homeTarget!));
      requireConfig(bed && bed.kind === 'bed' && !bed.blocked && bed.position.mapId === cell.destination?.mapId, `${path}.homeTarget`, '必须引用目的地图内的可站立床铺');
    }
  }
  for (const home of [playerConfig.home, ...residents.map(npc => npc.home)]) requireConfig(cells.find(cell => cell.key === home)?.homeTarget, `住所.${home}`, '住所必须配置 homeTarget 床铺引用');
  for (const actor of [rules.player, ...residents]) {
    const weight = Object.entries(actor.inventory).reduce((sum, [id, quantity]) => sum + (goods[id]?.weight ?? NaN) * quantity, 0);
    requireConfig(positive(actor.maxCarryWeight) && weight <= actor.maxCarryWeight, '生物负重', '初始背包超重或负重上限无效');
    requireConfig(whole(actor.money) && whole(actor.health) && positive(actor.maxHealth) && actor.health <= actor.maxHealth && actor.alive === (actor.health > 0), '生物初始状态', '金币、生命值或存活状态无效');
    for (const [good, quantity] of Object.entries(actor.inventory)) requireConfig(Object.hasOwn(goods, good) && whole(quantity), '初始背包', '物品不存在或数量无效');
  }
  for (const npc of residents) {
    const chest = at(npc.homeChest);
    requireConfig(chest?.kind === 'container' && chest.ownerId === npc.id, `npcs.${npc.id}.homeChest`, '必须指向自己的箱子');
    requireConfig(chest?.position.mapId === cells.find(cell => cell.key === npc.home)?.destination?.mapId, `npcs.${npc.id}.homeChest`, '家用箱子必须在自己的住所内');
    const shop = at(npc.shop.position);
    requireConfig(shop?.kind === 'door' && shop.shopOwner === npc.id, `npcs.${npc.id}.shop`, '店铺格子或店主不匹配');
    requireConfig(whole(npc.shop.openStart) && whole(npc.shop.openEnd) && npc.shop.openStart < npc.shop.openEnd && npc.shop.openEnd <= rules.hoursPerDay, `npcs.${npc.id}.shop`, '营业时间无效');
    for (const id of [...npc.shop.stockGoods, ...npc.shop.buys]) requireConfig(Object.hasOwn(goods, id), `npcs.${npc.id}.shop`, '交易道具不存在');
    requireConfig(cells.filter(cell => cell.kind === 'door' && cell.shopOwner === npc.id).length === 1, `npcs.${npc.id}.shop`, '当前每名 NPC 必须恰有一间店铺');
    const stockpile = at(npc.shop.stockpile);
    requireConfig(stockpile?.kind === 'container' && stockpile.ownerId === npc.id && stockpile.position.mapId === shop?.destination?.mapId, `npcs.${npc.id}.shop.stockpile`, '货箱必须在店内并属于店主');
    passable(npc.shop.counter, `npcs.${npc.id}.shop.counter`);
    requireConfig(npc.shop.counter.mapId === shop?.destination?.mapId, `npcs.${npc.id}.shop.counter`, '柜台工作位必须在店内');
    requireConfig(npc.shop.counter.mapId === npc.shop.stockpile.mapId && Math.abs(npc.shop.counter.x - npc.shop.stockpile.x) + Math.abs(npc.shop.counter.y - npc.shop.stockpile.y) <= 1, `npcs.${npc.id}.shop`, '柜台工作位须位于货箱旁');
    const targetWeight = Object.entries(npc.carryTarget).reduce((sum, [id, quantity]) => sum + (goods[id]?.weight ?? NaN) * quantity, 0);
    requireConfig(targetWeight < npc.maxCarryWeight * 0.8, `npcs.${npc.id}.carryTarget`, '携带目标重量必须低于自动卸货阈值（上限80%），避免反复取货卸货');
    for (const table of [npc.carryTarget, npc.reserve]) for (const [id, amount] of Object.entries(table)) requireConfig(Object.hasOwn(goods, id) && whole(amount), `npcs.${npc.id}`, '携带目标或保留库存无效');
  }
  for (const [key, value] of Object.entries(rules.survival)) requireConfig(whole(value), `game.survival.${key}`, '必须为非负整数');
  requireConfig(rules.survival.consumeBelow <= rules.needMax && rules.survival.buyBelow <= rules.survival.consumeBelow && rules.survival.purchaseTarget > 0, 'game.survival', '阈值应满足 buyBelow <= consumeBelow <= needMax，采购目标必须大于零');
  requireConfig(rules.awakeNeedChange.hunger <= 0 && rules.awakeNeedChange.thirst <= 0 && rules.sleepNeedChange.hunger <= 0 && rules.sleepNeedChange.thirst <= 0, 'game.needChange', '饱腹和水分应随时间减少');
  requireConfig(Number.isSafeInteger(rules.player.money + residents.reduce((sum, npc) => sum + npc.money, 0)), '初始金币', '全社会金币总量超出安全整数范围');
  requireConfig(new Set(rules.groundItems.map(item => item.id)).size === rules.groundItems.length, 'game.groundItems', '物品堆 id 不能重复');
  for (const item of rules.groundItems) {
    requireConfig(Object.hasOwn(goods, item.good) && whole(item.quantity), `game.groundItems.${item.id}`, '道具不存在或数量无效');
    passable(item.position, `game.groundItems.${item.id}.position`);
    requireConfig(!at(item.position)?.destination, `game.groundItems.${item.id}.position`, '物品不能放在传送触发格');
  }
}
validateConfig();
