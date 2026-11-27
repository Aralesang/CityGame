import { goods, rules, maps } from '../data/config.js';
import type { Position, TownMap, Needs, Activity, Creature } from '../types.js';

/** 老调用没有 mapId 时使用配置的默认地图；位置比较必须同时比较空间和坐标。 */
export const regionId = (position: Position) => position.mapId || maps.defaultMapId;
export const samePosition = (a: Position, b: Position) => regionId(a) === regionId(b) && a.x === b.x && a.y === b.y;
/** 根据角色所在空间返回地形；相同 x/y 在不同房屋中互不相邻。 */
export const actorMap = (map: TownMap, position: Position) => map.regions[regionId(position)];

/** 尝试移动一格。先检查地形与角色占格，再处理门的空间跳转。
 * 失败返回 false 且不改位置；成功替换 position，调用者决定是否消耗时间。 */
export function moveActor(actor: { position: Position }, dx: number, dy: number, map: TownMap, occupied: readonly Position[] = []) {
  const x = actor.position.x + dx;
  const y = actor.position.y + dy;
  let position: Position = { x, y, mapId: regionId(actor.position) };
  // 阻挡来自模板与坐标覆盖合并后的实例，不能再直接读取原字符模板的默认值。
  const canStand = (target: Position): boolean => {
    const cell = map.cells[regionId(target)]?.[`${target.x},${target.y}`];
    return Boolean(cell && !cell.blocked);
  };
  if (!canStand(position)) return false;
  // 门口和跳转后的落点都不能被其他角色占用，防止跨空间移动时穿人或重叠。
  if (occupied.some(other => samePosition(other, position))) return false;
  // 道路、房门和室内出口共用连接规则，只处理一次跳转，避免落点再触发连锁传送。
  const connection = map.connections.find(connection => samePosition(connection, position));
  if (connection) {
    position = { ...connection.destination };
    if (!canStand(position)) return false;
  }
  if (occupied.some(other => samePosition(other, position))) return false;
  actor.position = position;
  return true;
}

// 在包含房门连接的空间中寻最短路径；occupied 用于绕过当前被其他角色占用的格子。
export function nextStep(map: TownMap, from: Position, target: Position, occupied: readonly Position[] = []) {
  // 访问标记包含 mapId，避免不同房间相同坐标互相覆盖。
  const key = (position: Position) => `${regionId(position)}:${position.x},${position.y}`;
  // 广度优先搜索逐层扩展，每项只保存起点的第一步，抵达目标即可返回移动方向。
  const queue: { position: Position; first: { dx: number; dy: number } | null }[] = [{ position: from, first: null }];
  const visited = new Set([key(from)]);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (samePosition(current.position, target)) return current.first;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      // 用临时角色调用真实移动规则，让搜索天然支持墙壁和跨房门连接。
      const actor = { position: current.position };
      if (!moveActor(actor, dx, dy, map, occupied) || visited.has(key(actor.position))) continue;
      visited.add(key(actor.position));
      queue.push({ position: actor.position, first: current.first || { dx, dy } });
    }
  }
  return null;
}

/** 所有生物共用逐小时生存规则：饱腹/水分下降，任一归零按对应规则扣血。 */
export function tickNeeds(actor: Pick<Creature, 'needs' | 'activity' | 'health' | 'alive'>) {
  if (!actor.alive) return;
  const change = actor.activity === 'sleep' ? rules.sleepNeedChange : rules.awakeNeedChange;
  for (const need of Object.keys(change) as (keyof Needs)[]) actor.needs[need] = Math.max(rules.needMin, Math.min(rules.needMax, actor.needs[need] + change[need]));
  const damage = (actor.needs.hunger === 0 ? rules.survival.starvationDamage : 0)
    + (actor.needs.thirst === 0 ? rules.survival.dehydrationDamage : 0);
  actor.health = Math.max(0, actor.health - damage);
  if (actor.health === 0) { actor.alive = false; actor.activity = 'dead'; }
}

/** 消耗一份背包食物或饮水，恢复对应需求；原料小麦不能直接食用。
 * 本函数不推进时间，行动入口在成功后统一推进，避免重复计时。 */
export function consume(actor: { needs: Needs; inventory: Record<string, number> }, good: string) {
  const item = Object.hasOwn(goods, good) ? goods[good] : undefined;
  if (!item || !Object.keys(item.effects).length || !(actor.inventory[good] > 0)) return false;
  actor.inventory[good]--;
  // 同一道具可同时恢复多项需求；无 effects 的生产原料仍不可直接使用。
  for (const [need, amount] of Object.entries(item.effects) as [keyof Needs, number][]) {
    actor.needs[need] = Math.max(rules.needMin, Math.min(rules.needMax, actor.needs[need] + (need === 'fatigue' ? -amount : amount)));
  }
  return true;
}
