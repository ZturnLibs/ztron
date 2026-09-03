---
title: 加密保险库（stronghold）
---

# 概述

`stronghold` 模块提供**加密的持久化键值保险库**（GAP E2），镜像
`plugin:stronghold|*`。上游 Tauri 依赖 Rust IOTA-stronghold；Ztron
按其精神给出**纯 TS 重写**：`scrypt(密码, salt)` 派生密钥，
ChaCha20-Poly1305 AEAD 加密整份快照，文件格式
`"ZTSH1" | salt(16) | N,r,p u32le | nonce(12) | ciphertext | tag(16)`。
密码错误或密文被篡改都会在 Poly1305 tag 校验处 **fail-closed**；
密码学原语在 `tests/unit/stronghold.test.ts` 里与 `node:crypto`
对拍验证。

API 分两层：`stronghold` 命名空间的 11 个路径键函数，以及
`Stronghold` 类（绑定 path、密码随实例保存在会话期，上游
Stronghold 对象精神）。

```ts
import { stronghold, Stronghold, load } from "@zturnlibs/ztron-api/stronghold";
import type { StrongholdStatus } from "@zturnlibs/ztron-api/stronghold";
```

# 权限与 Scope

插件由 `strongholdPlugin(options)` 构造，选项：`path`（`load` 未传
路径时的缺省文件，缺省 `${tjs.tmpDir}/stronghold.bin`）与 `params`
（scrypt 成本 `{ n, r, p }`，缺省 libsodium 风格 "moderate"：
n=2^14、r=8、p=1，约 16 MiB / ~0.5s）。快照文件路径本身不走
`PathScope`（加密容器即边界）；每个已加载保险库的密码保存在进程
内存中（源码注释原话：TS 运行时与上游 keyring 同样暴露于进程内存）。

权限串 11 条 `stronghold:allow-*`（load/get/set/has/remove/keys/
clear/save/save_to/close/reload 一一同名），聚合为
`stronghold:default` 集（"Encrypted vault lifecycle
(load/save/close + kv)"）。hello 示例**未**注册此插件、能力清单也
未声明——它的验证来源是 E2 单测对拍与 fail-closed 实测，而非
hello spike 锚点（README 中没有 STRONGHOLD 锚点，如实说明）。

# 示例

hello 未覆盖此模块，以下为签名级示例（与
`packages/api/src/stronghold.ts` 逐字对齐）：

```ts
// 类面：装载（缺文件即新保险库）→ 读写 → 保存 → 关闭（脏则冲刷并忘记密码）
// 路径按原样传给后端（无 base-dir 展开），用绝对路径最稳。
const vault = await Stronghold.load("/tmp/vault.bin", "correct horse");
await vault.set("token", { secret: "s3cret" });
const token = await vault.get<{ secret: string }>("token");
await vault.saveTo("/tmp/vault-backup.bin"); // 原文件不动
const st = await vault.close();              // { closed: true }

// 函数面（与类面操作同一批文件）
await stronghold.load("/tmp/vault.bin", "correct horse");
const keys = await stronghold.keys("/tmp/vault.bin");
await stronghold.reload("/tmp/vault.bin", "correct horse"); // 丢弃未保存修改，从盘重开
```

各写操作返回 `StrongholdStatus`（`entries?` / `path?` / `saved?` /
`closed?` / `reloaded?` 的子集）。`close` 后再 `get` 会得到
`stronghold: not loaded` 拒绝；换密码或篡改密文在装载时抛
`stronghold: wrong password or corrupted snapshot`。

# 命令一览

`plugin:stronghold|*` 共 **11 条**：

| 命令 | API |
| --- | --- |
| `load` | `stronghold.load` / `Stronghold.load`（返回 `{ path, entries }`） |
| `get` / `set` | `stronghold.get` / `stronghold.set`（实例同名方法） |
| `has` / `remove` / `keys` / `clear` | 同名（`stronghold.*` 与实例方法） |
| `save` | `stronghold.save`（密封快照落盘） |
| `save_to` | `stronghold.saveTo`（密封到另一路径，原文件不动） |
| `close` | `stronghold.close`（脏则冲刷并卸载、忘记密码） |
| `reload` | `stronghold.reload`（丢弃未保存状态，从盘重开） |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/stronghold)。

适用版本：`ztron 0.3.0`
