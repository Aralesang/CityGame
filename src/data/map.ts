import { randomUUID } from 'node:crypto';
import type { TownMap, Place } from '../types.js';
import { maps, resolveMapTiles, positionKey } from './config.js';

/** 每个字符生成一个独立格子：先继承 tiles 模板，再应用地图对应坐标的覆盖。
 * 显示、碰撞与交互共用实例；cells 用于按坐标查询，places 是坐标索引，instances 按 UUID 索引，二者不能混为身份。 */
// 仅创建新世界时生成 UUID；未来读档应恢复原 ID 并重建坐标索引，不重新调用此函数生成身份。
export function createMap(): TownMap {
  const map: TownMap = { regions: structuredClone(maps.regions), instances: {}, cells: {}, destinations: {}, places: {}, entrances: [], connections: [] };
  const resolved = resolveMapTiles();
  for (const cell of resolved) {
    const place = { id: randomUUID(), ...cell.position, name: cell.name, kind: cell.kind,
      ownerId: cell.ownerId, shopOwner: cell.shopOwner, contents: structuredClone(cell.contents), description: cell.description, blocked: cell.blocked, symbol: cell.symbol };
    map.places[cell.key] = place;
    map.instances[place.id] = place;
    (map.cells[cell.position.mapId] ??= {})[`${cell.position.x},${cell.position.y}`] = place;
    if (cell.destination) {
      const connection = { ...place, id: place.id, name: cell.name, destination: { ...cell.destination }, kind: cell.kind as 'door' | 'exit' | 'path' };
      map.connections.push(connection);
      if (cell.kind === 'door') map.entrances.push(connection);
    }
  }
  // 住所的寻路终点仍由 homeTarget 显式引用床铺，其他地点直接使用自身坐标。
  for (const cell of resolved) {
    const place = map.places[cell.key];
    const target = cell.homeTarget ? map.places[positionKey(cell.homeTarget)] : place;
    if (cell.homeTarget) place.homeTargetId = target.id;
    map.destinations[cell.key] = { ...target };
  }
  return map;
}
