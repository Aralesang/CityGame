// 程序入口只决定显示模式，游戏规则由 simulation 模块统一实现。
// 重定向输入或输出时保留逐行命令模式，便于脚本和测试使用。
if (!process.stdin.isTTY || !process.stdout.isTTY || process.argv.includes('--commands')) {
  await import('./command-cli.js');
} else {
  await import('./terminal-game.js');
}
