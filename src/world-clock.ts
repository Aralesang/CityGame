import type { AdventureWorld, Controls, DailyReport } from './types.js';
import { advanceHours } from './simulation/world.js';
import { samePosition } from './simulation/actors.js';
import { targetPosition } from './simulation/adventure.js';
import { nearby, shopOpen } from './simulation/economy.js';
import { rules } from './data/config.js';

/** 玩家操作和自动时间共用日报格式，避免自动跨午夜的报告被界面遗漏。 */
export function appendReports(world: AdventureWorld, messages: string[], reports: DailyReport[]): void {
  for (const report of reports) {
    const summary = rules.summaryGoods.map(id => `${world.market[id].name}全村存量 ${report.goods[id].closingStock}`).join('；');
    messages.push(`第 ${report.day} 天结束：${summary}。生存危机 ${report.shortages.length} 项，社会金币 ${report.gold}/${report.initialGold}。`);
  }
  if (messages.length > 10) messages.splice(0, messages.length - 10);
}

/** 自动推进后校正会随时间失效的菜单，防止继续与已离开的 NPC 或闭店店员交易。 */
function syncLiveMenus(world: AdventureWorld, ui: Controls, messages: string[]): void {
  if (ui.interaction) {
    const npc = world.npcs.find(npc => npc.id === ui.interaction!.npcId && npc.alive && npc.position && samePosition(npc.position, targetPosition(world)));
    if (!npc) { ui.interaction = null; messages.push('人物已离开交互位置。'); }
    else {
      ui.interaction.shopId = Object.values(world.shops).find(shop => shop.ownerId === npc.id && shopOpen(world, shop))?.id;
      if (!ui.interaction.shopId) ui.interactionIndex = 0;
    }
  }
  if (ui.menu === 'shop') {
    const shop = world.shops[ui.shopId ?? ''];
    const clerk = shop && world.npcs.find(npc => npc.id === shop.ownerId);
    if (!shop || !shopOpen(world, shop) || !clerk?.position || !nearby(world.player.position, clerk.position)) {
      ui.menu = null; ui.shopId = null;
      messages.push('店员已离岗或交易条件变化，交易界面已关闭。');
    }
  }
}

/** 每个入口只安装一个时钟；切换模式仅改变开关，不叠加定时器。
 * 单次推进同步执行，不会与输入回调交叉修改世界；所有菜单都不会暂停计时。
 * Node 事件循环阻塞时回调可能延迟，不一次补跑大量小时，避免恢复时突然死亡。
 */
export function startWorldClock(world: AdventureWorld, ui: Controls, messages: string[], render: () => void, onError: (error: unknown) => void): () => void {
  const timer = setInterval(() => {
    if (!world.clock.automatic) return;
    try {
      const wasAlive = world.player.alive;
      const reports = advanceHours(world, 1);
      world.clock.actionUsed = false;
      if (world.clock.sleepUntil && (world.time.day > world.clock.sleepUntil.day
        || (world.time.day === world.clock.sleepUntil.day && world.time.hour >= world.clock.sleepUntil.hour))) {
        delete world.clock.sleepUntil;
        if (world.player.alive) { world.player.activity = 'leisure'; messages.push('你醒来了。'); }
      }
      if (wasAlive && !world.player.alive) {
        delete world.clock.sleepUntil;
        messages.push('你已经死亡，世界仍会继续运转；Ctrl+C 退出。');
      }
      syncLiveMenus(world, ui, messages);
      appendReports(world, messages, reports);
      render();
    } catch (error) { clearInterval(timer); onError(error); }
  }, world.clock.intervalMs);
  return () => clearInterval(timer);
}
