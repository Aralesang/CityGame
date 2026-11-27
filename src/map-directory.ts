import type { AdventureWorld, Position } from './types.js';
import { regionId } from './simulation/actors.js';

/** 名称按真实格子坐标组织，渲染层只放大格子，不重新排列或按距离列成清单。 */
export function spatialMapLabels(world: AdventureWorld): Record<string, string[]> {
  const currentMap = regionId(world.player.position);
  const labels: Record<string, string[]> = {};
  const add = (position: Position, name: string): void => {
    if (regionId(position) !== currentMap) return;
    const key = `${position.x},${position.y}`;
    if (!(labels[key] ??= []).includes(name)) labels[key].push(name);
  };
  // 玩家标记优先，脚下的家具或物品仍保留名称，不因覆盖显示而消失。
  add(world.player.position, '【你】');
  for (const place of Object.values(world.map.instances)) {
    if (place.kind && place.kind !== 'terrain') add(place, place.name ?? '未命名对象');
  }
  for (const npc of world.npcs) if (npc.alive) add(npc.position, npc.name);
  for (const item of world.groundItems) if (item.quantity > 0) add(item.position, `${world.market[item.good].name}×${item.quantity}`);
  return labels;
}
