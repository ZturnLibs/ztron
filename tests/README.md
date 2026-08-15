# Ztron 测试框架

三层覆盖,目标是 **100% 覆盖所有功能与 API**。

## 分层

| 层                      | 文件                                                                                       | 覆盖                                                                               | 运行                                          |
| ----------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------- |
| **Surface(完整性)**     | `unit/surface.test.ts` + `helpers/manifest.ts`                                             | 框架注册的命令 == 清单;@ztron/api 导出 == 清单(无缺失/无多余)                      | `pnpm test`                                   |
| **Unit(路由/行为)**     | `unit/routing.test.ts`、`unit/scopes.test.ts`、`unit/acl.test.ts`、`unit/coverage.test.ts` | 每个命令经 MockRuntime 路由到 adapter / tjs stub;PathScope/HttpScope 穷举;ACL 穷举 | `pnpm test`                                   |
| **Integration(运行时)** | `examples/hello` spike(62 项确定性,含 2 项 key-window bonus)                          | 真实 host+webview 端到端;tjs:` 模块 / 网络 / 会退出应用的命令                      | 手动 `pnpm --filter @ztron/example-hello dev` |
| **Integration(多窗口)** | `examples/multiwin`(P6.3)                                                             | 运行时第二窗口:建窗→label 路由→窗口 ops→destroy→注册表清理                              | 手动 `pnpm --filter @ztron/example-multiwin dev` |

## 覆盖账本(`unit/coverage.test.ts`)

- 每个清单命令 ∈ **UNIT_COVERED**(单测执行)∪ **INTEGRATION_ONLY**(spike 执行,需 tjs:` 模块/网络/系统副作用)
- 不存在"无覆盖"命令(测试断言)
- 新增 API/命令时:**同时更新 `helpers/manifest.ts`**(完整性契约)+ 对应的 routing 测试或 INTEGRATION_ONLY 声明,否则 surface/coverage 测试失败

## 测试基建

- `helpers/tjs-stub.ts` — 内存版 `tjs`(fs/spawn/serve/env/stat),Node 下驱动纯插件
- `helpers/buildApp.ts` — 注册全部插件 + 无 capability(permissive)的 app
- `MockRuntime` — 记录 window/tray/menu/dialog/clipboard/notification/shortcut/deep-link/process 的路由目标

## 已知跳过

- `core.test.ts` 的 PathScope 用例需真实 `tjs`(txiki)运行时 → Node 下跳过
- `path` 的 join/resolve 等 + `sql` + `http` + `websocket` + `updater` + `shell.open` + `process.exit/relaunch` 由 spike 集成覆盖(见 `coverage.test.ts` 的 `INTEGRATION_ONLY`)

## 运行

```bash
pnpm test          # surface + unit + 原 core.test.ts(50 pass / 1 skip)
pnpm test:unit     # 仅 unit/
```
