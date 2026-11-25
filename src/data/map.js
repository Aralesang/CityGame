export function createMap() {
  const map = {
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
