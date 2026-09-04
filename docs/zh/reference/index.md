---
title: 参考
---

# 参考

参考部分是面向查阅的工具书：[CLI 参考](/reference/cli)给出 `ztron` 命令行工具的全部子命令与选项；[命令面参考](/reference/commands)列出运行时注册的全部 `plugin:*|*` 命令（生成自 manifest，与运行时注册面一一对应）；[配置参考](/reference/config)覆盖 `ztron.conf.json` 的全字段（由 `gen:config` 生成，请勿手改）；[API 参考](/reference/api/)是 TypeDoc 生成的 `@zturnlibs/ztron-api` API 文档，中文树为翻译覆盖层。

| 页面 | 说明 |
| --- | --- |
| [CLI 参考](/reference/cli) | `ztron` CLI 的七个主命令（init/dev/build/codegen/check/signer/version）与辅助工具命令 |
| [命令面参考](/reference/commands) | 全部 `plugin:*|*` 命令及权限归属，生成自 manifest（`tests/helpers/manifest.ts`） |
| [配置参考](/reference/config) | `ztron.conf.json` 全字段说明，由 `pnpm --dir docs run gen:config` 生成 |
| [API 参考](/reference/api/) | TypeDoc 生成的 `@zturnlibs/ztron-api` API 文档 · 中文为翻译覆盖层 |

适用版本：`ztron 0.3.1`
