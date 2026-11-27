import type { Creature } from '../types.js';
import { goods } from '../data/config.js';

/** 单件重量由道具配置定义，背包只存数量；统一计算，避免购买、拾取、生产各算一套。 */
export function carriedWeight(actor: Pick<Creature, 'inventory'>): number {
  return Math.round(Object.entries(actor.inventory).reduce((sum, [id, quantity]) => sum + (goods[id]?.weight ?? 0) * quantity, 0) * 1000) / 1000;
}
/** 给定当前库存，最多还能容纳几件；只影响随身背包，不对普通箱子添加容量限制。 */
export function carryCapacity(actor: Pick<Creature, 'inventory' | 'maxCarryWeight'>, good: string): number {
  const weight = goods[good]?.weight;
  return weight ? Math.max(0, Math.floor((actor.maxCarryWeight - carriedWeight(actor) + 1e-9) / weight)) : 0;
}
export function productionFits(actor: Pick<Creature, 'inventory' | 'maxCarryWeight'>, inputs: Record<string, number>, outputs: Record<string, number>): boolean {
  const delta = Object.entries(outputs).reduce((sum, [id, quantity]) => sum + goods[id].weight * quantity, 0)
    - Object.entries(inputs).reduce((sum, [id, quantity]) => sum + goods[id].weight * quantity, 0);
  return carriedWeight(actor) + delta <= actor.maxCarryWeight + 1e-9;
}
