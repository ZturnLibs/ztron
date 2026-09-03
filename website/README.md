# Ztron Website (GitHub Pages)

Astro 双语落地页：英文 `/`，中文 `/zh/`。部署到 https://zturnlibs.github.io/ztron/

## 本地开发

    pnpm --filter @zturnlibs/ztron-website dev      # http://localhost:4321/ztron/
    pnpm --filter @zturnlibs/ztron-website build    # astro check && astro build（漏译即失败）
    pnpm --filter @zturnlibs/ztron-website preview

## 双语规则

所有文案在 `src/i18n/{en,zh}.ts`，受 `SiteStrings` 接口约束——新增 key 必须两份
字典同时补齐，否则构建失败。命令/包名/插件名不翻译。

## 部署

push 到 main 且 `website/**` 变更时由 `.github/workflows/website.yml` 自动部署。
一次性设置：仓库 Settings → Pages → Source 选择 "GitHub Actions"。

[![website](https://github.com/ZturnLibs/ztron/actions/workflows/website.yml/badge.svg)](https://github.com/ZturnLibs/ztron/actions/workflows/website.yml)
