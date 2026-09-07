# Ztron README 重设计（产品门面型，双语）

- 日期：2026-09-07
- 状态：设计定稿（方案 A；用户委托自主推进，非响应式会话模式）
- 交付物：`README.md`（中文主）+ `README.en.md`（英文镜像）+ `assets/ztron-logo.svg` + 里程碑台账迁入 `DESIGN.md` §7

## 1. 目标与非目标

### 目标

让 GitHub 访问者 10 秒明白 Ztron 是什么、30 秒能跑起来；内容与刚落地的一次安装体验对齐；双语与 docs 站（zh 默认 + en 镜像）模式一致。

### 非目标

- 不改 DESIGN.md / ROADMAP.md / docs/ 的既有内容（除 §7 里程碑表接收迁移）
- 不做 README 的构建门禁/链接检查自动化（人工核对相对链接）
- 不新造品牌资产（复用 docs/public 的渐变 Z 与官网 favicon 体系）

## 2. 现状问题（设计依据）

1. 40 行里程碑台账占 README 约 60% 篇幅，内部检查标签（`M1_EVENTS_CHANNEL_WINDOW_OK`）对访客无意义
2. 一次安装 Quick start 被埋在文末（L107+），最大卖点不可见
3. 无 Logo、无 badges、无特性亮点、无平台支持表
4. 测试数过时（110 → 实际 150/1skip）
5. 英文 README 与中文用户/文档站 zh 默认不匹配

## 3. 信息架构（两语言镜像，自上而下）

1. 语言切换行：`简体中文 | English`（互链）
2. Hero：居中渐变 Z Logo（`assets/ztron-logo.svg`，80px）+ 一句话定位
3. Badges ×5：CI（ci.yml/main）、npm `@zturnlibs/ztron-cli` version、平台（macOS Apple Silicon verified）、License MIT、Docs
4. 「为什么是 Ztron」4 条卖点：纯 TypeScript 全栈 / ~2MB tjs + 系统 WebView / Tauri API 兼容移植 / 插件+ACL+updater 完整生态
5. 30 秒上手：`npm i -g` → `ztron init`（含 --template 一行）→ `ztron dev`；附 `ztron doctor` 与平台声明
6. 特性亮点表（8 条）：声明式窗口 / 全模块 HMR / typed codegen / ACL / 多窗口 / fs.watch+drag-drop / updater+签名+dmg / showcase
7. 架构：保留现有 ASCII 双进程图
8. 包家族表（现有 5 包，精简）
9. 示例与模板：4 模板 + 8 示例表，突出 showcase；链接 docs examples 页
10. 平台支持表：macOS ✅ / Windows 🚧 / Linux 🚧
11. 贡献者区（压缩）：monorepo dev 命令 + 三层测试一句话 + bench 一句话
12. 状态一行（M0–P30、86 项检查）+ 链接 DESIGN.md §7
13. License：MIT

## 4. 里程碑台账迁移

README 的 M0–P30 全表（40 行）迁入 `DESIGN.md` §7「里程碑」，替换其中过时的 M0–M4 小表；§7 补一行「完整开发日志见本表」。

## 5. 语言与镜像规则

- `README.md`：简体中文（主）
- `README.en.md`：英文，章节一一对应
- 两文件首行互设语言链接；代码块、命令、包名、链接完全一致

## 6. 验证

- 相对链接存在性人工核对（README.en.md、assets/、DESIGN.md、docs/）
- badge URL 拼写核对（shields.io / GitHub Actions 徽章格式）
- `docs:check` 不受影响（README 不在 docs 树）
- 合并后在 GitHub 仓库页确认渲染效果
