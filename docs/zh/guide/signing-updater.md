---
title: 签名与更新器
---

应用自更新依赖两条信任链：发布者用 minisign 私钥给产物签名，应用用
公钥校验。本页覆盖 `ztron signer` 工具、更新清单格式、`updaterPlugin`
配置与 `install()` 流程；API 明细见[应用更新](/plugins/updater)。

## minisign 密钥

`ztron signer` 提供三个子命令（摘自 `packages/cli/src/signer.ts`）：

```bash
ztron signer generate   # --pk-file（缺省 minisign.pub）--sk-file（缺省 minisign.key）
ztron signer sign <file> --secret-key <path> [--password pw]
ztron signer verify <file> --public-key <path>
```

- `generate` 支持 `--comment`（公钥注释，缺省
  `ztron signer public key`）；给出 `--password`（或环境变量
  `ZTRON_SIGNER_PASSWORD`）时私钥以 minisign scrypt 加密格式写入，
  否则明文。
- `sign` 缺省输出 `<file>.minisig`，可用 `--output` 改名，
  `--trusted-comment` / `--comment` 定制签名注释。
- `verify` 缺省读 `minisign.pub` 与 `<file>.minisig`，成功打印
  `signature verified`（及 trusted comment），失败 exit 1。

格式与 jedisct1/minisign 线路级互验（本工具产出的签名可被真正的
`minisign` 验证，反之亦然）；口径同 [CLI 参考](/reference/cli)。

## 更新清单格式

清单是 JSON，`platforms` 按平台键取产物（摘自
`packages/core/src/plugins/updater.ts` 的模块 docstring）：

```json
{
  "version": "1.2.0",
  "notes": "…",
  "platforms": {
    "darwin": { "url": "https://…/app.dmg", "sha256": "…", "signature": "untrusted comment: …\nb64(sig)\ntrusted comment: …\nb64(global)\n" }
  }
}
```

平台键由 `navigator.platform` 归一为 `darwin` / `windows` / `linux`；
`signature` 是对产物文件内容的 minisign `.minisig` 文本。
`ztron build` 在设置 `ZTRON_UPDATER_KEYS=<pub>,<sk>` 时自动对 `.dmg`
（或 `.app`）签名并产出 `latest.json` + `.minisig`（清单 url 前缀取
`ZTRON_UPDATER_BASE`，缺省 `http://localhost:8080`）。

## 配置 updaterPlugin

摘自 `examples/hello/src/main.ts`：

```ts
.plugin(
  updaterPlugin({
    currentVersion: "0.1.0",
    scope: {
      allow: [
        { url: "http://localhost:*/*" },
        { url: "https://httpbin.org/*" },
        { url: "https://api.github.com/*" },
      ],
    },
  }),
)
```

内置 HttpScope 同时约束**清单获取与产物下载**两类请求；`manifestUrl`
指定清单地址（可被每次调用覆盖）；`pubkey` 填入 minisign 公钥文件
文本后启用签名门。

## install() 流程

`install` 是一次性链路：check → download → sha256 与 minisign 双重
校验 → 经 `plugin:process|relaunch` 重启。要点：

- 校验失败在重启**之前**中止——损坏/被替换的产物永远不会落地运行。
- 配置了 `pubkey` 即**失败关闭**：清单里的 `signature` 缺失或不匹配
  都直接抛错。
- 清单没有比 `currentVersion` 更高的版本（SemVer 2.0.0 precedence），
  或缺 `artifactUrl` / `sha256` 时，返回
  `{ ok: false, reason: "no-update" }`。
- 流式变体 `install_stream`（API 名 `downloadAndInstall`）经 Channel
  推送 Started → Progress×N → Finished，落地前过同样的双门。

## 能力项

口径与[应用更新](/plugins/updater)一致：`updater:default` 含
`check` + `download` + `verify` + `verify_signature`（**不含** install
两条）；`updater:allow-install`（一次性安装）与
`updater:allow-install-stream`（流式安装）需要单独授予。

适用版本：`ztron 0.3.0`
