import type { TownMap } from '../types.js';

/** 创建独立地图：# 为障碍，. 为地板，^ 为可通行野外。
 * 地形与地点标记分开存放，画面叠加符号不会改变底层碰撞规则。 */
export function createMap(): TownMap {
  const map: TownMap = {
    rows: [
      '#############',
      '#...........#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#.......^^^^#',
      '#.......^^^^#',
      '#.......^^^^#',
      '#############',
    ],
    places: {
      '你的住所': { x: 2, y: 2, symbol: 'H' },
      '公共箱子': { x: 4, y: 2, symbol: 'C' },
      '农田': { x: 6, y: 2, symbol: 'F' },
      '面包坊': { x: 4, y: 4, symbol: 'B' },
      '水井': { x: 6, y: 4, symbol: 'W' },
      '阿林的家': { x: 5, y: 1, symbol: 'h' },
      '小麦的家': { x: 3, y: 4, symbol: 'h' },
      '阿河的家': { x: 7, y: 4, symbol: 'h' },
      '阿秋的家': { x: 7, y: 2, symbol: 'h' },
    },
    rooms: {},
    entrances: [],
  };
  // 每座房屋生成独立房间。保留室外门坐标，再将住所目的地改成室内床铺，
  // 因此 NPC 回家会寻路到床，而不是停在室外门口。
  for (const name of ['你的住所', '阿林的家', '小麦的家', '阿河的家', '阿秋的家']) {
    const entrance = { ...map.places[name], mapId: 'town' };
    const mapId = `home:${name}`;
    map.rooms[mapId] = {
      name,
      rows: ['#######', '#...t.#', '#.....#', '#..c..#', '#.b...#', '###D###'],
      exit: { x: 3, y: 5 },
      entrance,
    };
    map.entrances.push({ ...entrance, name, destination: { x: 3, y: 4, mapId } });
    map.places[name] = { x: 2, y: 4, mapId, symbol: 'b' };
  }
  return map;
}
