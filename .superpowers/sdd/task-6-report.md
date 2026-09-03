# Task 6 Report: 写作规范与 docs README

## Status
Complete.

## Files created
- `docs/CONTRIBUTING.md` — 6 sections per brief: 双语流程 (zh canonical, check:locales, --deploy gate, `<!-- i18n:untranslated -->` placeholder rule), 术语表 (Task-5 table verbatim), 代码示例规则 (examples/hello, examples/multiwin, examples/menuprobe; 来源路径注明; 不得凭空编写), 能力主张规则 (验证锚点如 FS_WATCH_OK, 语义见根 README 状态表), 版本标注 (`` 适用版本：`ztron x.y.z` ``, 同 PR 更新), frontmatter (仅 title 必填).
- `docs/README.md` — brief content verbatim, plus one honest note that rspack native-module loading is required for build/dev (this Mac on macOS 26 deadlocks; CI does the build), so local hangs are a known issue, not a config error.

## Verification
- `pnpm --dir docs run check:locales` exits 0 ("OK — zh/en trees match") — both files live at docs/ root, outside zh//en/, invisible to the parity checker as expected.
- Committed scoped: only docs/CONTRIBUTING.md and docs/README.md staged (2 files, 81 insertions).

## Commit
- 3e1b6eb docs(site): contributing guide (bilingual workflow, terms, sample rules) + docs README

## Concerns
None. Root-level .md files are outside the rspress locale routes, matching the plan ("站点路由之外").
