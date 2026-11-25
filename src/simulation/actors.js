export const regionId = position => position.mapId || 'town';
export const samePosition = (a, b) => regionId(a) === regionId(b) && a.x === b.x && a.y === b.y;
export const actorMap = (map, position) => regionId(position) === 'town' ? map : map.rooms[regionId(position)];

export function moveActor(actor, dx, dy, map) {
  const x = actor.position.x + dx;
  const y = actor.position.y + dy;
  const region = actorMap(map, actor.position);
  const tile = region?.rows[y]?.[x];
  if (tile === undefined || ['#', 't', 'c'].includes(tile)) return false;
  let position = { x, y, mapId: regionId(actor.position) };
  if (position.mapId === 'town') {
    const door = map.entrances.find(entrance => samePosition(entrance, position));
    if (door) position = { ...door.destination };
  } else if (samePosition(position, { ...region.exit, mapId: position.mapId })) {
    position = { x: region.entrance.x, y: region.entrance.y, mapId: 'town' };
  }
  actor.position = position;
  return true;
}

// 在包含房门连接的空间中寻最短路径；玩家与 NPC 使用同一移动规则。
export function nextStep(map, from, target) {
  const key = position => `${regionId(position)}:${position.x},${position.y}`;
  const queue = [{ position: from, first: null }];
  const visited = new Set([key(from)]);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (samePosition(current.position, target)) return current.first;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const actor = { position: current.position };
      if (!moveActor(actor, dx, dy, map) || visited.has(key(actor.position))) continue;
      visited.add(key(actor.position));
      queue.push({ position: actor.position, first: current.first || { dx, dy } });
    }
  }
  return null;
}

export function tickNeeds(actor) {
  const clamp = value => Math.max(0, Math.min(100, value));
  actor.needs.hunger = clamp(actor.needs.hunger + 2);
  actor.needs.thirst = clamp(actor.needs.thirst + 3);
  actor.needs.fatigue = clamp(actor.needs.fatigue + (actor.activity === 'sleep' ? -8 : 3));
}

export function consume(actor, good) {
  const need = { bread: 'hunger', water: 'thirst' }[good];
  if (!need || !(actor.inventory[good] > 0)) return false;
  actor.inventory[good]--;
  actor.needs[need] = Math.max(0, actor.needs[need] - 25);
  return true;
}
