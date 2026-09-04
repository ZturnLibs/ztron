### Task 7: `examples.md` 微调 + 端到端验收 + PR

**Files:**
- Modify: `docs/zh/start/examples.md`, `docs/en/start/examples.md`（仅开头定位句 + 结尾链接）

**Interfaces:**
- Consumes: Task 2 doctor、Task 6 教程页

- [ ] **Step 1: 微调 examples（zh/en）**

`docs/zh/start/examples.md` 顶部加一句：

```markdown
> `examples/` 属于框架仓库（贡献者/开发者视角）。普通应用开发请从[快速开始](/start/quick-start)的 `ztron init` 路径进入。
```

结尾追加：

```markdown
**深入：[架构](/guide/architecture) · [IPC](/guide/ipc) · [安全 ACL](/guide/security) · [API 参考](/en/reference/api/) · [命令参考](/reference/commands)**
```

en 版对应英译。

- [ ] **Step 2: 端到端验收（spec §7）**

1. 干净目录 init → dev → build（Task 6 Step 3 已覆盖，复核 exit 0）
2. `ztron doctor` 三态：仓库根全绿 exit 0；`PATH=/nonexistent cd /tmp && node <cli>/index.js doctor` → tjs/host/webview FAIL + hint + exit 1
3. 门禁 + 全仓：`pnpm --dir docs run check:locales:deploy && pnpm test 2>&1 | tail -3` → 门禁 OK、126+ pass / 0 fail
4. 检查 `npm view @zturnlibs/ztron-cli` ——若用户已配 `NPM_TOKEN` 并打 tag 发布则可见；未发布则在 PR 描述标注"npmjs 通道待 token"

- [ ] **Step 3: 双语门禁 + 构建最终复核**

Run: `pnpm --dir docs run check:locales:deploy && pnpm --dir docs run build 2>&1 | tail -1`
Expected: OK + 构建成功

- [ ] **Step 4: Commit + 推分支 + PR**

```bash
git add docs/zh/start/examples.md docs/en/start/examples.md
git commit -m "docs(start): examples positioning + deep-dive links (zh/en)"
git push -u origin feat/onboarding
gh pr create --base main --head feat/onboarding --title "feat: tauri-style onboarding (npmjs channel, ztron doctor, start/ journey)" --body "Spec: docs/superpowers/specs/2026-09-03-onboarding-journey-design.md. W1 publish-npm job (needs NPM_TOKEN secret), W2 ztron doctor + init guidance, W3 start/ journey rewrite (zh/en). Acceptance: clean-dir init->dev->build, doctor 3-state, locale gate, full tests."
```

- [ ] **Step 5: 合并后线上验证**

合并 main 后等 website.yml 绿，验证 `https://zturnlibs.github.io/ztron/docs/start/quick-start.html` 与 `/zh/` 对应页 200 且为新内容（grep `ztron init my-app`）。

---

