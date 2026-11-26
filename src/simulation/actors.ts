import type { Position, TownMap, Needs, Activity } from '../types.js';

/** 老数据没有 mapId 时视为 town；位置比较必须同时比较空间和坐标。 */
export const regionId = (position: Position) => position.mapId || 'town';
export const samePosition = (a: Position, b: Position) => regionId(a) === regionId(b) && a.x === b.x && a.y === b.y;
/** 根据角色所在空间返回地形；相同 x/y 在不同房屋中互不相邻。 */
export const actorMap = (map: TownMap, position: Position) => regionId(position) === 'town' ? map : map.rooms[regionId(position)];

/** 尝试移动一格。先检查落点碰撞，再处理门的空间跳转。
 * 失败返回 false 且不改位置；成功替换 position，调用者决定是否消耗时间。 */
export function moveActor(actor: { position: Position }, dx: number, dy: number, map: TownMap) {
  const x = actor.position.x + dx;
  const y = actor.position.y + dy;
  const region = actorMap(map, actor.position);
  const tile = region?.rows[y]?.[x];
  if (tile === undefined || ['#', 't', 'c'].includes(tile)) return false;
  let position: Position = { x, y, mapId: regionId(actor.position) };
  // 室外踩门进入室内；室内踩出口返回原门位置，不再次触发进入。
  if (position.mapId === 'town') {
    const door = map.entrances.find(entrance => samePosition(entrance, position));
    if (door) position = { ...door.destination };
  } else if (samePosition(position, { ...map.rooms[regionId(position)].exit, mapId: position.mapId })) {
    position = { x: map.rooms[regionId(position)].entrance.x, y: map.rooms[regionId(position)].entrance.y, mapId: 'town' };
  }
  actor.position = position;
  return true;
}

// 在包含房门连接的空间中寻最短路径；玩家与 NPC 使用同一移动规则。
export function nextStep(map: TownMap, from: Position, target: Position) {
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
      if (!moveActor(actor, dx, dy, map) || visited.has(key(actor.position))) continue;
      visited.add(key(actor.position));
      queue.push({ position: actor.position, first: current.first || { dx, dy } });
    }
  }
  return null;
}

/** 每小时增加需求，并统一限制到 0～100；只有实际睡眠才能恢复疲劳。 */
export function tickNeeds(actor: { needs: Needs; activity: Activity }) {
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  actor.needs.hunger = clamp(actor.needs.hunger + 2);
  actor.needs.thirst = clamp(actor.needs.thirst + 3);
  actor.needs.fatigue = clamp(actor.needs.fatigue + (actor.activity === 'sleep' ? -8 : 3));
}

/** 消耗一份背包食物或饮水，恢复对应需求；原料小麦不能直接食用。
 * 本函数不推进时间，行动入口在成功后统一推进，避免重复计时。 */
export function consume(actor: { needs: Needs; inventory: Record<string, number> }, good: string) {
  const need = ({ bread: 'hunger', water: 'thirst' } as const)[good as 'bread' | 'water'];
  if (!need || !(actor.inventory[good] > 0)) return false;
  actor.inventory[good]--;
  actor.needs[need] = Math.max(0, actor.needs[need] - 25);
  return true;
}
