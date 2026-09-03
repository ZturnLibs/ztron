---
title: CLI 参考
---

`ztron` CLI 提供 `init`/`dev`/`build`/`codegen`/`check`/`signer`/
`version` 七个主命令（另有 `icon`/`info`/`add`/`migrate` 辅助工具命令，
见文末）。命令集以 `packages/cli/src/index.ts` 的分发 switch 为准
（USAGE 字符串尚未收录 codegen/signer）。

```text
ztron init [dir]                  在 [dir] 脚手架新项目（默认当前目录）
ztron dev [--entry <file>]        构建 + 在原生 host + tjs backend 下运行
ztron build [--entry <file>]      产出独立可执行文件与 .app
ztron codegen                     扫描 defineCommand，生成 src/ztron-commands.ts 类型绑定
ztron check [--entry <file>] [--timeout <ms>] [--expect TAGS]
                                  回归运行：解析应用上报检查项，FULL_OK 且 0 FAIL 才 exit 0；
                                  --expect 逗号分隔强制要求的 tag
ztron signer <sub> [--pk-file f] [--sk-file f]
                                  minisign 兼容密钥生成/签名/验证（generate 等子命令；
                                  与 jedisct1/minisign 互验）
ztron version                     打印版本
```

## ztron init

```text
ztron init [dir]
```

在目标目录（缺省为当前目录）脚手架新项目：生成 `src/main.ts` 入口与
`frontend/` 前端骨架，以及 `ztron.conf.json`。

```bash
node packages/cli/dist/index.js init my-app
```

## ztron dev

```text
ztron dev [--entry <file>]
```

构建前端（vite）并在原生 host + tjs backend 下运行应用；
`--entry` 缺省为 `./src/main.ts`。

```bash
node ../packages/cli/dist/index.js dev --entry src/main.ts
```

## ztron build

```text
ztron build [--entry <file>]
```

`tjs compile` 打包后端为独立可执行文件，并产出 macOS `.app`
（ad-hoc 签名；亦支持 `.dmg`）。

```bash
pnpm --filter @zturnlibs/ztron-example-hello build
```

## ztron codegen

扫描 `src/` 下全部 `.ts` 文件中的 `defineCommand` 声明，按命令名去重
（后者胜）后生成 `src/ztron-commands.ts` 类型绑定，供前端
`g.invoke("my:greet", {...})` 类型化调用。

```bash
node ../packages/cli/dist/index.js codegen
# [ztron] codegen: 3 command(s) -> src/ztron-commands.ts
```

## ztron check

```text
ztron check [--entry <file>] [--timeout <ms>] [--expect TAGS]
```

回归运行：走完整 dev 流程启动应用，解析其上报的检查项
（hello 风格的 `frontend reported` 与裸 `TAG_OK` 行）。只有达到
`FULL_OK` 且 0 个 FAIL 才 exit 0；harness 的判定覆盖子进程退出码。
`--expect` 用逗号分隔强制要求的 tag，`--timeout`（毫秒）限定总时长。

```bash
node packages/cli/dist/index.js check --expect SECOND_WINDOW_OK,STRESS_OK
```

## ztron signer

```text
ztron signer <sub> [--pk-file f] [--sk-file f]
```

minisign 兼容的密钥生成/签名/验证，格式与 jedisct1/minisign 线路级
互验（本工具产出的签名可被真正的 `minisign` 验证，反之亦然）。
`generate` 子命令额外支持 `--password`（或环境变量
`ZTRON_SIGNER_PASSWORD`）以 scrypt 加密写入私钥。

```bash
ztron signer generate
# signer: generated key pair
#   public key: minisign.pub
#   secret key: minisign.key
```

## ztron version

```bash
ztron version   # ztron 0.1.0
```

## 辅助工具命令

switch 中另有：`ztron icon [input] [-o outDir]`（生成 icns/iconset/
多尺寸 png）、`ztron info`（打印环境信息）、`ztron add <plugin>`
（向项目添加插件）、`ztron migrate`（迁移旧配置）。

适用版本：`ztron 0.1.0`
