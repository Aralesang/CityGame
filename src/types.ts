/** 游戏内时间；只有世界推进函数可以修改，避免界面与模拟各自计时。 */
export interface GameTime { day: number; hour: number }
/** mapId 缺省时使用配置的默认地图（兼容旧调用）；坐标采用行列格子，x 向右、y 向下。 */
export interface Position { x: number; y: number; mapId?: string }
export interface Place extends Position { id?: string; ownerId?: string; shopOwner?: string; contents?: Record<string, number>; homeTargetId?: string; symbol: string; kind?: string; blocked?: boolean; name?: string; description?: string }
/** 室外地图与房间统一为区域，通过 mapId 索引，不再把小镇当成特殊根地图。 */
export interface MapRegion { name: string; rows: string[]; indoors: boolean }
export interface Entrance extends Place { name: string; destination: Position }
/** 每个连接是一个单向踩格传送；各入口由地图格子的 destination 定义，双向道路使用两个入口格。 */
export interface MapConnection extends Entrance { id: string; kind: 'door' | 'exit' | 'path' }
export interface TownMap {
  regions: Record<string, MapRegion>; instances: Record<string, Place>; cells: Record<string, Record<string, Place>>; destinations: Record<string, Position>; places: Record<string, Place>;
  entrances: Entrance[]; connections: MapConnection[];
}
/** self 表示目标为脚下；其余方向指向玩家所在空间的相邻一格。 */
export type Facing = 'n' | 's' | 'w' | 'e' | 'self';
export type Activity = 'sleep' | 'work' | 'rest' | 'leisure' | 'shopping' | 'selling' | 'hauling' | 'dead';
export interface Needs { hunger: number; thirst: number; fatigue: number }
export interface Good { effects: Partial<Needs>; purchaseNeed?: keyof Needs; name: string; description: string; basePrice: number; weight: number }
export interface MarketGood extends Good { stock: number; price: number }
/** 配方按每个有效生产小时计算，产出属于生产者，stockTarget 控制停止生产的库存目标。 */
export interface Job { name: string; workplace: string; stockTarget: number; inputs: Record<string, number>; outputs: Record<string, number> }
/** 所有生物共用生命、饱腹、水分、随身物资和金币状态。 */
export interface Creature { maxCarryWeight: number; health: number; maxHealth: number; alive: boolean; money: number; inventory: Record<string, number>; needs: Needs; activity: Activity }
export interface ShopConfig { counter: Position; stockpile: Position; position: Position; openStart: number; openEnd: number; stockGoods: string[]; buys: string[] }
export interface Resident { maxCarryWeight: number; health: number; maxHealth: number; alive: boolean; inventory: Record<string, number>; carryTarget: Record<string, number>; reserve: Record<string, number>; homeChest: Position; shop: ShopConfig; home: string; money: number; needs: Needs; greeting: string; id: string; name: string; job: string; personality: string; workStart: number; workEnd: number }
export interface Npc extends Resident, Creature { home: string; money: number; needs: Needs; workHours: number; activity: Activity; location: string; position?: Position; destinationName?: string }
export interface Player extends Creature { facing: Facing; id: string; name: string; position: Position; inventory: Record<string, number>; needs: Needs; activity: Activity }
/** 每日商品账本；期初库存取自午夜结算开始时，期末库存包含生产和消费。 */
export interface Ledger { openingStock: number; produced: number; demand: number; consumed: number; unmet: number; closingStock: number; price: number }
export interface DailyReport { gold: number; initialGold: number; trades: number; day: number; goods: Record<string, Ledger>; shortages: { npcId: string; good: string; missing: number }[] }
/** NPC 社会持有地图、个人库存、店铺与容器；冒险模式额外加入玩家和行动历史。 */
export interface World { time: GameTime; market: Record<string, MarketGood>; npcs: Npc[]; lastReport: DailyReport | null; initialGold: number; trades: number; dayLedger: Record<string, Ledger>; shortages: DailyReport['shortages']; containers: Record<string, Container>; shops: Record<string, Shop>; map?: TownMap; player?: Player }
/** 容器只有独立库存，可配置主人；不再与任何公共市场共享物品。 */
export interface Container { id: string; name: string; position: Position; ownerId?: string; items: Record<string, MarketGood> }
export interface Shop extends ShopConfig { containerId: string; id: string; name: string; ownerId: string }
/** 自动时间只由终端时钟推进；actionUsed 限制同一个时段的实际操作次数。 */
export interface WorldClock { automatic: boolean; intervalMs: number; actionUsed: boolean; sleepUntil?: GameTime }
export interface AdventureWorld extends World {
  clock: WorldClock;
  map: TownMap; player: Player; npcs: (Npc & { position: Position })[];
  containers: Record<string, Container>;
  groundItems: { id: string; good: string; quantity: number; position: Position }[];
  history: (GameTime & { message: string })[];
}
export type InventorySide = 'chest' | 'backpack';
export type Menu = InventorySide | 'shop';
/** 对话内容是打开时的快照；阅读或关闭对话不会推进世界。 */
export interface Dialogue { speaker: string; text: string }
/** 与 NPC 交互先选择对话或交易，交易选项只对正在店内工作的店员出现。 */
export interface NpcInteraction { npcId: string; name: string; shopId?: string }
export interface Controls { mapOpen: boolean; mapX: number; mapY: number; interaction: NpcInteraction | null; interactionIndex: number; shopId: string | null; containerId: string | null; dialogue: Dialogue | null; inspection: string | null; menu: Menu | null; side: InventorySide; indices: Record<InventorySide, number> }
/** 命令来自键盘或外部调用，仍须运行时校验未知类型、错误方向与非法数值。 */
export interface Action { type: string; direction?: string; good?: string; itemId?: string; containerId?: string; shopId?: string; npcId?: string; hours?: number }
export interface ActionResult { ok: boolean; message: string; reports: DailyReport[]; menu?: Menu; dialogue?: Dialogue; containerId?: string; shopId?: string; interaction?: NpcInteraction }
/** 浏览菜单、关闭界面和忽略按键不一定产生行动结果，也不推进世界时间。 */
export type KeyResult = Partial<ActionResult>;
