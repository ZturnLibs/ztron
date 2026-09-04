# 配置参考 · 全字段

来源：`packages/core/src/app.ts` 的 `ProjectConfigFile` 接口，由 `pnpm --dir docs run gen:config` 生成——请勿手改（漂移由 `gen:config:check` 把关）。未知顶层键不会被拒绝：校验时告警并原样保留，对应下表的 `[key: string]` 索引签名。

共 40 行：top 16 · build 5 · app 2 · app.security 6 · bundle 11。

## 顶层字段（16 项）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `$schema?` | `string` | JSON Schema 声明，供编辑器补全与校验；运行时忽略 |
| `entry?` | `string` | 后端入口文件 |
| `frontend?` | `string` | 前端目录 |
| `identifier?` | `string` | 应用标识 |
| `productName?` | `string` | `appName` 的别名（上游命名） |
| `appName?` | `string` | 应用名 |
| `mainBinaryName?` | `string` | 主二进制名 |
| `version?` | `string` | 版本号 |
| `csp?` | `string` | 旧顶层 CSP，建议改用 `app.security.csp`（两者均可） |
| `capabilities?` | `string[] \| string` | 旧顶层 capability 列表，建议改用 `app.security.capabilities` |
| `build?` | `object` | 构建相关配置（dev server 地址、前端产物目录、构建钩子），字段见下方 `build` 小节 |
| `app?` | `object` | 应用级配置（全局 API 注入、macOS 私有 API、安全项），字段见下方 `app` 与 `app.security` 小节 |
| `bundle?` | `object` | 打包元信息，字段见下方 `bundle` 小节 |
| `plugins?` | `Record<string, unknown>` | 插件配置（`Record<string, unknown>`） |
| `windows?` | `Array<Partial<WindowConfig> & { label?: string }>` | 声明式窗口启动状态；窗口字段（WindowConfig）全表见[窗口](../guide/window) |
| `[key: string]` | `unknown` | 索引签名：允许未知顶层键，校验时告警并原样保留 |

## build（5 项）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `build.devUrl?` | `string` | 开发模式使用的前端 dev server 地址 |
| `build.frontendDist?` | `string` | 前端构建产物目录 |
| `build.beforeDevCommand?` | `string` | 开发启动前执行的构建钩子命令 |
| `build.beforeBuildCommand?` | `string` | 构建前执行的构建钩子命令 |
| `build.beforeBundleCommand?` | `string` | 打包前执行的构建钩子命令 |

## app（2 项）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `app.withGlobalTauri?` | `boolean` | 全局 API 注入开关（在页面 `window` 上暴露内部 API） |
| `app.macOSPrivateApi?` | `boolean` | 启用 macOS 私有 API |

## app.security（6 项）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `app.security.csp?` | `string` | 生产环境 CSP（见[安全模型](../guide/security)） |
| `app.security.devCsp?` | `string` | 开发环境专用 CSP |
| `app.security.capabilities?` | `string[] \| string` | capability 列表（`string[] \| string`） |
| `app.security.assetProtocol.scope?` | `string[] \| string` | 资产协议可访问的路径 scope（`string[] \| string`） |
| `app.security.assetProtocol.requireLiteralLeadingDot?` | `boolean` | 资产协议是否要求字面前导点（控制隐藏文件匹配） |
| `app.security.freezePrototype?` | `boolean` | 冻结原型，防篡改 |

## bundle（11 项）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `bundle.active?` | `boolean` | 是否启用打包步骤 |
| `bundle.targets?` | `string \| string[]` | 打包目标（如 `app`、`dmg`；Windows/Linux 目标尚未提供） |
| `bundle.icon?` | `string \| string[]` | 应用图标（PNG 路径） |
| `bundle.resources?` | `string[]` | 随包分发的附加资源文件列表 |
| `bundle.category?` | `string` | 应用分类 |
| `bundle.publisher?` | `string` | 发布者 |
| `bundle.homepage?` | `string` | 主页 URL |
| `bundle.shortDescription?` | `string` | 简短描述 |
| `bundle.longDescription?` | `string` | 详细描述 |
| `bundle.copyright?` | `string` | 版权信息 |
| `bundle.license?` | `string` | 许可证 |

适用版本：`ztron 0.3.1`
