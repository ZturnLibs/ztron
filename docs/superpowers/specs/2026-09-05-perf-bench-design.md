# Ztron 性能测试与验证方案设计（ztron bench）

- 日期：2026-09-05
- 状态：设计定稿（用户确认"预算 + 回归门禁"目标与整体方案）
- 分支：`feat/perf-bench`
- 依赖现状：`ztron check` 的 TAG 上报管道（86 项已验证）、`ztron doctor` 的 CLI 子命令先例、examples 应用模式

## 1. 目标与非目标

### 目标

为 Ztron 建立**可重复的性能基准 + 预算回归门禁**，评估框架整体效率：

- 一条命令（`ztron bench`）产出 8 项核心指标的结构化测量结果
- 预算文件（`perf-budget.json`）入库；实测超预算 → exit 1（防劣化门禁）
- `--record` 模式建立基线；统计纪律（预热丢弃、中位数、P95）保证数值可信

### 非目标

- 竞品对标（Tauri/Electron 对比）——后续可基于本方案扩展
- 瓶颈剖析（火焰图/阶段深钻）——门禁建立后再按需
- Windows/Linux（平台 host 为骨架）
- 原生链构建计时（`time scripts/build-native.sh` 即可，不进 bench）
- CI 硬门禁（runner 噪声大；预算判定只在本地开发机有效，CI 仅可选跑无 GUI 子集作存档参考）

## 2. 指标清单（首轮 8 项）

| # | 指标 | 测量侧 | 单位 | 方法 |
| --- | --- | --- | --- | --- |
| 1 | 冷启动全链路 | CLI | ms | 清 `.ztron` 构建缓存后 spawn → 解析 stdout `PORT=` → backend connected → `BENCH_READY` |
| 2 | 热启动全链路 | CLI | ms | 复用构建直接 spawn，同上 |
| 3 | invoke 往返 P50 | frontend | ms | 200 次 `invoke("bench:ping")` 往返计时分位数 |
| 4 | invoke 往返 P95 | frontend | ms | 同上 |
| 5 | Channel 吞吐 | frontend | MB/s | 1MB payload 分块流式传输，计总时长（指标字段 `channelMBps`） |
| 6 | 事件往返 | frontend | ms | emit→receive 往返 ×100 取中位数 |
| 7 | 窗口创建中位数 | frontend/CLI | ms | create→visible→destroy ×10 取中位数 |
| 8 | 打包产物体积 | CLI | MB | `ztron build` 产物 .app 目录大小 |

内存（host + backend 进程 RSS 合计，`ps` 采样）作为第 9 项**冒烟指标**：只报告数值不设预算首轮（观察分布后再定）。

## 3. 架构（三个组件）

### 3.1 `examples/bench`（基准应用）

- 最小窗口应用：`ztron.conf.json` + `src/main.ts`（注册 `bench:ping`/`bench:sink` 命令与 `bench:report` Channel）+ `frontend/`（自动执行测量序列）
- frontend 就绪后自动跑测量并逐行输出 `BENCH_METRIC:<name>:<value>:<unit>`（对齐 hello 的 TAG 模式，但带数值载荷）
- 测量完成输出 `BENCH_DONE`；任何失败输出 `BENCH_FAIL:<reason>`
- 使用 `@zturnlibs/ztron-*` workspace 依赖（examples/* workspace 成员，与 hello 同模式）

### 3.2 `ztron bench` 子命令（packages/cli）

- 语法：`ztron bench [--runs <n>] [--entry <file>] [--skip-build] [--record] [--no-gui] [--json <path>]`
- 阶段计时（CLI 侧）：spawn 子进程 → 解析 stdout `PORT=` → backend connected 行 → `BENCH_READY` → `BENCH_DONE`，各时间戳差值即阶段耗时；冷启动先删 `.ztron` 目录
- 运行时指标：解析子进程 stdout 的 `BENCH_METRIC:*` 行
- 内存采样：运行期间对 host/backend 进程 `ps -o rss=` 轮询（500ms 间隔）取峰值
- 统计：`--runs` 默认 3（全部为有效轮次；另有固定 1 次预热轮，跑但不计入）；输出中位数与 P95
- 输出：终端对齐表格 + `--json <path>` 落盘（默认 `bench-results.json`，gitignore）
- 门禁：预算文件存在且非 `--record` → 逐项比对（时间/吞吐/内存对中位数；P95 单独比对），超项打印 `FAIL <name>: <actual> > <budget>`，全绿输出 `bench: OK`；预算文件不存在时提示先 `--record`
- `--record`：跳过比对，将本轮中位数写入 `perf-budget.json`（时间 ×1 不加系数——预算系数在比对时应用：时间/内存超基线 ×1.25 判 FAIL，吞吐低于基线 ÷1.25 判 FAIL；系数常量在 CLI 内，可后续参数化）
- `--no-gui` 子集：跳过窗口/前端测量，仅打包体积、tjs compile 时长、backend 内存冒烟

### 3.3 `perf-budget.json`（仓库根，入库）

```json
{
  "_comment": "预算基线；ztron bench --record 重写。比对：时间/内存 ×1.25、吞吐 ÷1.25 内为 PASS",
  "recordedAt": "<iso>",
  "env": { "platform": "darwin", "arch": "arm64", "note": "Apple Silicon 本机基线" },
  "budgets": {
    "coldStartMs": 0, "warmStartMs": 0, "invokeP50Ms": 0, "invokeP95Ms": 0,
    "channelMBps": 0, "eventRoundTripMs": 0, "windowCreateMs": 0, "appSizeMB": 0
  }
}
```

（`--record` 生成时填实测值；字段名即指标名，0 值仅示意。）

## 4. 门禁语义与 CI 策略

- 门禁只在本地开发机有效（同机前后对比消噪）；CI 的 macos job 为 headless 手动触发，可 `ztron bench --no-gui` 作存档参考，**不做硬判断**
- 首轮 PR 只交付 `--record` 产物与门禁机制，预算以本机基线为准；不同机器基线不可比（文档明示）
- 门禁有效性实证：临时在 bench 应用 invoke handler 注入 50ms 延迟 → invoke P95 项 FAIL exit 1 → 移除恢复

## 5. 验收标准

1. `ztron bench` 端到端出全表（真实原生窗口），8 项指标有数值，exit 0
2. `--record` 建基线后复跑 → `bench: OK` exit 0
3. 注入 50ms 延迟复跑 → invoke P95 FAIL exit 1；移除后恢复 OK（门禁双向实证）
4. `perf-budget.json` 入库；`bench-results.json` gitignore；结构可 diff
5. 全仓测试不回退（当前基线 134 测试）；CI 不因本改动回退
6. README 增补 bench 用法；`docs` 不强制（性能页可后续）

## 6. 风险与对策

| 风险 | 对策 |
| --- | --- |
| GUI 时钟噪声导致数值抖动 | 预热丢弃 + 中位数 + 预算系数 1.25 容差；门禁仅本机语义 |
| frontend 测量代码自身开销污染 invoke 计时 | 计时用 `performance.now()` 且循环内不做 DOM 写入；上报批量在测量结束后进行 |
| 窗口 create 计时无法从 frontend 精确感知 visible | 以 backend 收到 `window\|show`/首帧事件为准（CLI 侧 + frontend 侧双口径，取 CLI 侧） |
| 冷/热启动受磁盘缓存影响 | 冷启动定义 = 删 `.ztron` 构建缓存；同机同轮对比，跨机不可比已文档化 |
| budget 与 results 混淆误提交 | results 默认名进 .gitignore；budget 显式 `--record` 才写 |
| 并行会话改动 examples 模式 | bench 应用对齐 hello 现行模式；实施分支独立走 PR |
