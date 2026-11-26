/** 游戏内时间；只有世界推进函数可以修改，避免界面与模拟各自计时。 */
export interface GameTime { day: number; hour: number }
/** mapId 缺省时表示小镇；坐标采用行列格子，x 向右、y 向下。 */
export interface Position { x: number; y: number; mapId?: string }
export interface Place extends Position { symbol: string }
/** 房间出口连接到小镇入口，寻路和玩家移动共用这份连接信息。 */
export interface Room { name: string; rows: string[]; exit: Position; entrance: Position }
export interface Entrance extends Place { name: string; destination: Position }
export interface TownMap { rows: string[]; places: Record<string, Place>; rooms: Record<string, Room>; entrances: Entrance[] }
export type Activity = 'sleep' | 'work' | 'rest' | 'leisure';
export interface Needs { hunger: number; thirst: number; fatigue: number }
export interface Good { name: string; stock: number; basePrice: number; targetStock: number }
export interface MarketGood extends Good { price: number }
/** 配方数量按每小时计算；priority 较小的职业先结算，保证原料先于加工产出。 */
export interface Job { name: string; workplace: string; priority: number; wage: number; inputs: Record<string, number>; outputs: Record<string, number> }
export interface Resident { id: string; name: string; job: string; personality: string; workStart: number; workEnd: number }
export interface Npc extends Resident { home: string; money: number; needs: Needs; workHours: number; activity: Activity; location: string; position?: Position }
export interface Player { id: string; name: string; position: Position; inventory: Record<string, number>; needs: Needs; activity: Activity }
/** 每日商品账本；期初库存取自午夜结算开始时，期末库存包含生产和消费。 */
export interface Ledger { openingStock: number; produced: number; demand: number; consumed: number; unmet: number; closingStock: number; price: number }
export interface DailyReport { day: number; goods: Record<string, Ledger>; shortages: { npcId: string; good: string; missing: number }[] }
/** 纯经济模拟没有地图和玩家；冒险模式在其上添加空间、交互和历史。 */
export interface World { time: GameTime; market: Record<string, MarketGood>; npcs: Npc[]; lastReport: DailyReport | null; map?: TownMap; player?: Player }
export interface AdventureWorld extends World {
  map: TownMap; player: Player; npcs: (Npc & { position: Position })[];
  chest: { id: string; name: string; position: Position; items: Record<string, MarketGood> };
  groundItems: { id: string; good: string; quantity: number; position: Position }[];
  history: (GameTime & { message: string })[];
}
export type InventorySide = 'chest' | 'backpack';
export interface Controls { menu: InventorySide | null; side: InventorySide; indices: Record<InventorySide, number> }
/** 命令来自键盘或外部调用，仍须运行时校验未知类型、错误方向与非法数值。 */
export interface Action { type: string; direction?: string; good?: string; itemId?: string; hours?: number }
export interface ActionResult { ok: boolean; message: string; reports: DailyReport[]; menu?: InventorySide }
/** 浏览菜单和忽略按键不一定产生行动结果，退出也不推进世界时间。 */
export type KeyResult = Partial<ActionResult> & { quit?: boolean };
