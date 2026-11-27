# 游戏 JSON 配置说明

此目录是游戏内容的配置源。修改 JSON 后重新执行 `npm start`；命令会重新编译并把 JSON 复制到 `dist/src/config/`。不要直接修改 dist，它会在下次构建时被覆盖。目前不做运行中热更新，已创建的世界不会因修改 JSON 自动变化。

JSON 使用双引号，不支持注释和尾随逗号；中文字段说明集中维护在本文。代码中的行为与配置读取仍带中文注释。`src/data/config.ts` 统一加载并在启动时校验引用、数量、时间和坐标；`npm run build` 只检查编译，不会执行启动校验或游戏。

## 文件分工

| 文件 | 内容 |
| --- | --- |
| items.json | 道具名称、说明、固定金币单价、使用效果和自动消费类型 |
| jobs.json | 职业名称、工作地点、产出库存目标与每小时配方 |
| npcs.json | NPC 身份、性格、住所、职业、工作日程、初始金币/生命/库存/需求、家用箱子、携带目标、店铺和问候 |
| maps.json | 地图字符矩阵、默认地图与各地图的坐标属性覆盖 |
| tiles.json | 所有地图部件的共享模板：地面、树木、建筑、家具、床铺与入口 |
| game.json | 时间、需求和市场规则、玩家初始状态、地面物品、显示符号及摘要商品 |
| dialogues.json | 通用 NPC 对话、状态台词及文本占位符 |

## 道具与生产配方

items 的对象键是稳定的道具类型键（例如 bread），不是实例 UUID。

- weight：单件重量，必须大于零，最多三位小数。maxCarryWeight 与其使用相同重量单位。
- basePrice：固定单价，正整数金币。交易只转移买家和卖家的金币；没有系统发薪、自动回收或价格补贴。
- effects：使用后的恢复量。例如 `{"hunger":25,"thirst":10}` 同时恢复饱腹、水分；fatigue 的正数表示减少疲劳。空对象表示不能直接使用的原料。
- purchaseNeed：NPC 自动消费对应的生存指标，目前使用 hunger（饱腹）或 thirst（水分）。该指标必须有正数 effects。
- description：E 检查说明，修改效果后同步调整文案。

道具不再配置全局 stock 或 targetStock。实际初始物品放在 NPC inventory、家用容器 contents、玩家 inventory 或地面物品堆中。

jobs 的 inputs、outputs 是每个有效工作小时投入、产出的整数数量。workplace 是地图坐标。stockTarget 表示生产者自身背包加家中箱子的产出库存目标，达到后暂停生产；不能凭空补原料。面包师缺小麦会先取自己箱子的存货，没有再到农夫店里用金币购买。产出归本人，不进入公共市场。工资和 priority 已移除，生产不增加金币。

## 地图字符、部件模板与坐标覆盖

所有地图部件统一使用 tiles，已移除 buildings.json。树木、家具、建筑、地面、床铺和出入口都遵循同一套配置方式：

1. 在 tiles.json 中定义字符对应的部件模板。
2. 在 maps.json 的 rows 中直接画出这些字符。
3. 特殊格子在该地图的 overrides 中按 `"x,y"` 覆盖属性，普通格子无需额外配置。

坐标从零开始，x 向右、y 向下。maps 顶层只有 defaultMapId 和 regions；室内外地图都显式列在 regions，每张地图包含 name、indoors、rows 和可选的 overrides。每行必须等宽，不再使用 roomTemplates 或单独对象布局表。

### 模板示例

```json
{
  "T": {
    "name": "树木",
    "kind": "tree",
    "blocked": true,
    "description": "茂密的树干挡住了去路。"
  }
}
```

一片树林只需在 rows 中重复写 T。模板可以被无限次使用，普通树木不用逐个填写 id 和坐标：

```json
{
  "name": "森林",
  "indoors": false,
  "rows": [
    "#######",
    "#T.T..#",
    "#..TT.#",
    "#######"
  ],
  "overrides": {
    "1,1": {
      "name": "古老的橡树",
      "description": "树干上刻着一行文字。"
    },
    "3,2": {
      "name": "倒下的树木",
      "blocked": false
    }
  }
}
```

这段示例中的其他树保持模板默认属性，只有两个坐标需要覆盖。底图不变时，修改 blocked 就会改变实际碰撞，修改 name 就会改变目标名称；显示、检查、寻路和交互都读取同一份合并结果。

### 字段与合并规则

| 字段 | 用途 |
| --- | --- |
| name | 名称，显示在目标摘要和检查界面 |
| kind | 部件类别，bed 支持床铺，door/exit/path 支持踩格传送；其他类别用于标记和展示 |
| blocked | 是否阻挡移动 |
| description | E 检查的说明，支持 `{wakeHour}` 占位符 |
| symbol | 可选的实际显示字符；不填写时显示 rows 中的模板字符 |
| destination | door/exit/path 的传送落点，包含 mapId、x、y |
| homeTarget | 用 `{mapId,x,y}` 指向床铺；创建世界后会关联该床铺自动生成的实例 ID |

合并顺序为“tiles 模板 → 本地图 overrides 坐标项”。覆盖只影响单格，不修改模板或其他同类格子。destination 是完整替换，需要同时写 mapId、x、y；destination 和 homeTarget 可设 null 清除。取消传送时应同时把 kind 改为非传送类别。

每个地图格子在创建新世界时自动生成随机 UUID，地图覆盖不再接受 id。重开新世界的 ID 会不同；移动或切图不会重新生成已有对象的 ID。`地图ID:x,y` 仅是内部坐标查询键，不是对象身份。

配置中的 home、workplace 和 homeTarget 都使用 `{mapId,x,y}`，例如 `{"mapId":"town","x":2,"y":2}`。配置负责说明“在哪里”，不要求预先知道运行时 UUID。创建世界后，实例保存在 instances 中，住所对床铺的身份关联为 homeTargetId。

目前尚未实现存档。未来存档需保存实例 UUID、属性与关联；读档恢复原 ID，并从实例重建坐标索引，不应重新创建一套 UUID。道具类型键（如 bread）、职业类型键、地图 ID 等配置标识仍保持固定，它们不是地图对象的实例 ID。

### 房门、出口与道路

H/h 是房门模板，D 是出口模板，>/< 是道路模板。它们通过坐标覆盖指定各自 destination，不再单独配置连接数组。例：

```json
{
  "24,8": {
    "name": "通往森林",
    "destination": { "mapId": "forest", "x": 1, "y": 4 }
  }
}
```

双向道路需在两张地图各画一个入口，并分别配置落点。落点通常放在返回入口旁，不能直接落在另一个触发入口上；房间出口返回原房门是允许的特例。每次移动只传送一次，起点和落点均检查合并后的阻挡和角色占格。

新增民居时，直接在 regions 增加室内地图，画出床、家具与出口；室外房门覆盖 destination 和 homeTarget；homeTarget 直接填写床铺坐标，无需给床铺命名 ID；室内出口覆盖返回位置。床的位置以明确的坐标引用为准，不根据第一个 b 字符或房间名字猜测。

当前配置保留小镇、森林及所有房间：小镇 `(24,8)` 的 > 进入森林；森林 `(0,4)` 的 < 返回小镇；森林 `(7,2)` 是小屋，`(4,4)` 是路牌，`(3,4)` 有两份可拾取饮水。

NPC 和可携带道具仍分别由 npcs/items/game.groundItems 定义；它们会覆盖显示在部件地图上。当前终端没有滚动相机，超大地图仍需扩展布局。

## 私人容器 C 与店铺 M

C 是通用独立容器，模板里的 contents 默认为空。地图坐标覆盖可设置 name、contents、ownerId：

```json
{
  "3,2": {
    "name": "阿林的箱子",
    "ownerId": "lin",
    "contents": { "wheat": 12, "bread": 3, "water": 4 }
  }
}
```

没有公共仓库或 storage:village 属性。ownerId 是 NPC 配置身份键或 player；玩家只能操作自己的和无主容器。NPC 到自家箱子附近才补货或存货，每人当前配置一个家用箱子，homeChest 必须指向它。

### 商店是房屋，店员是普通 NPC

M 模板现在是 kind=door 的普通房屋入口，额外通过 shopOwner 指定商店主人。该格 destination 指向独立店内地图，走上去进入；出口 D 配置返回原房门。地图中直接画货箱 C、柜台岗位 s，所有特殊参数仍使用坐标覆盖。

NPC 的 shop 配置：

- position：室外房门坐标，格子须为 door，且 shopOwner 与 NPC id 相同。
- counter：店内可站立的售货岗位。
- stockpile：店内专门货箱的坐标，该箱 ownerId 为店主，且必须在 counter 旁。
- openStart/openEnd：计划售货时间。实际营业还需要店员存活、activity=selling 且站在 counter；赶路、补货或外出采购时不营业。
- stockGoods：优先搬运到货箱的成品类型，不是销售白名单。货箱里任意有数量的商品都可销售。
- buys：店员愿意收购的物品类型，收购实际扣除店员金币，物品进入货箱。

每家店有独立室内地图和货箱库存。玩家进入店内，面向店员按 F，使用 ↑/↓ 选择“对话”或“交易”，F 确认。店员不在岗时仍保留普通 NPC 的对话、生存、移动与碰撞属性，只是不提供交易选项。NPC 顾客也必须走进店铺到店员附近交易。

买货从货箱出库，卖货进入货箱，不会增减店员的随身物品。初始店铺库存来自店内 C 的 contents；实际运行补货必须由店主亲自搬运，不能远程复制家中或背包里的物资。店员个人食物和原料需要时也从箱子按负重取回。

## 随身重量

items.weight 配置单件重量，玩家和每个 NPC 配置 maxCarryWeight。重量只根据随身 inventory 实时计算，不把家中、商店箱子和金币计入负重。

所有增物入口使用同一套负重计算：地面拾取、个人容器取物、玩家购买、NPC 采购、家中补给、店铺取料和生产产出。NPC 达到 80% 负重或生产后会超重时优先卸货，生产不能直接越过上限。

carryTarget 是每种物品的数量目标，其总重量须低于 maxCarryWeight 的 80%。否则配置会在启动时报告错误，避免 NPC 无休止地补货/卸货。箱子当前不限制容量；重量修改后应同步检查所有初始背包是否仍合法。

## NPC、生存与初始物资

NPC 配置字段：

- id：NPC 的配置身份键，用于 ownerId/shopOwner，不是地图实例 UUID。
- name、personality、greeting：显示与对白。
- home：住所房门坐标，归家目的地通过该格 homeTarget 找床铺。
- homeChest：自家容器坐标，必须位于自己的室内地图。
- job、workStart、workEnd：职业和工作区间（左闭右开）。
- inventory：初始随身物资；money：初始非负整数金币。
- needs：hunger=饱腹，thirst=水分，100 为充足，0 为耗尽；fatigue 是疲劳，越低越好。
- health、maxHealth、alive：生命、上限和初始存活状态；alive 必须与 health>0 一致。
- carryTarget：在家取物时的随身携带目标，下班后超出部分存回；生产者可在工作时暂时携带更多产出。
- reserve：对出售库存的保留量，防止把自己的全部口粮卖光。
- shop：房屋入口、店内柜台岗位、独立货箱、营业时段、补货种类和收购种类。
- maxCarryWeight：最大随身负重。

当前四位 NPC 各 60 初始金币；玩家也有 60，总计 300。改初始金额会改变新世界的金币总量，但运行后不会自动补钱。职业收益完全来自真实交易，死亡也不销毁其遗留的金币和物资。

NPC 自动食用随身物资，家中取货、生产、采购和睡眠均随世界小时推进。无钱、无货或道路阻塞会影响生存，系统不隐式赠送物资；当前对话不会改变金币或库存。

## 世界规则 game.json

- clock.automatic：新游戏是否默认自动模式，当前为 false；T 可随时切换模式。
- clock.intervalMs：真实计时间隔，每次推进一小时，当前为 2000 毫秒，至少 100。自动时钟只由终端入口安装，不在核心 world 中创建，批量模拟仍由调用方手动推进。
- 自动模式：玩家实际行动不额外推进世界，每时段一次；界面打开时继续运行；睡眠持续到目标时间，不立即跳时。
- 行动模式：保留每次行动推进一小时、睡眠快进的行为。

- startTime、startAdvanceHours：初始世界时间与冒险开局快进。
- hoursPerDay、sleepStart、sleepEnd、wakeHour：一天时长、夜间区间和玩家睡醒时刻。
- needMin/needMax：默认 0/100。awakeNeedChange、sleepNeedChange：逐小时变化，饱腹与水分为负数，疲劳可按睡眠状态恢复。
- survival.consumeBelow：NPC 低于此值自动食用随身物资。
- survival.buyBelow：低于此值且携带不足时优先找家中补给或采购。
- survival.purchaseTarget：未单独设置 carryTarget 时的采购数量目标。
- survival.starvationDamage、dehydrationDamage：饱腹/水分为零时每小时扣血，两者叠加。生命为零则死亡，停止移动、生产、购物和继续消耗。
- player：初始身份、金币、背包、饱腹/水分/疲劳、生命与朝向。
- groundItems：初始掉落物，每堆实际存在，拾取只转移到背包，不生成金币。
- maxWaitHours、historyLimit、nearbyDistance：等待上限、记录条数和附近人物距离。
- symbols、activityNames、summaryGoods、openingMessage：界面符号、活动名称、摘要物品及开局提示。

纯批量模拟与冒险模式复用相同 NPC、地图、生产、采购与生存逻辑；冒险额外加入玩家与地面物品。world.market 是数量和价格的统计视图，不允许将其当库存存取。日报记录生产和实际消费，同时报告金币总量；金币转账入口和逐小时守恒检查均在代码中统一处理。

目前没有存档、税收、贷款、工资、遗产分配、物品损耗和动态定价；这些都不会被隐式模拟。长期供需和自动社会表现需由开发者手动运行确认。本次默认只执行编译，不运行游戏或测试。

## 文字地图与大地图显示

小镇当前为 25×15；扩大或移动部件时，需同步所有引用其坐标的 NPC home、job.workplace、shop.position 和返回出口 destination。室内坐标与室外地图独立，不应一起缩放。普通部件直接改 rows；具有特殊行为的部件同时调整 overrides 的坐标键。

M 界面直接读取运行中格子实例、人物和掉落物，按真实坐标显示名称，无需另写地标表。每个格子放大为固定大小的文字区域，名称在本格换行；kind=terrain 保留地形轮廓，其他部件显示名称，同格对象合并标注。方向键平移，Home 定位玩家，M/Q 关闭。主界面的字符视野会跟随玩家，地图扩大后不再要求整张地图塞进固定左栏。
