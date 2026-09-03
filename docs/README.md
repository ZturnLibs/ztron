# Ztron Docs

Rspress 双语文档站（zh 默认 / en 镜像）。独立安装，不依赖 workspace。

## 运行

```bash
pnpm install
pnpm dev            # 开发服务器
pnpm build          # 静态构建 -> doc_build/
pnpm preview        # 本地预览构建产物
pnpm test           # scripts 单元测试
pnpm run check:locales          # zh/en 结构一致性
pnpm run check:locales:deploy   # 发布门禁（含占位检测）
```

（根目录等价命令：`pnpm docs:dev` / `pnpm docs:build` / `pnpm docs:check`。）

> 注：`pnpm build` / `pnpm dev` 依赖 rspack 原生模块可正常加载的机器；本机（macOS 26）当前存在死锁问题会导致构建挂起，站点构建由 CI 完成，本地挂起非环境配置错误。

贡献规范见 [CONTRIBUTING.md](./CONTRIBUTING.md)。
