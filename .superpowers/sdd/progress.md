# onboarding journey progress
Task 1: complete (7c34324..cb33571, review clean; minors: env-restore hygiene in locate tests, unused findNativeFile import)
Task 2: complete (cb33571..ef56d4c, review clean; minors: finder env-parameterization deferred, darwin platform line cosmetic)
Task 3: complete (ef56d4c..a0ae398, review clean; minors: stale 'next:' line, test doesn't pin conditional note, dylib name hardcoded)
Task 4: complete (a0ae398..a8cbf3c, review clean; pre-existing: GH Packages publish job may lack NODE_AUTH_TOKEN env - check before next v* tag)
Task 5: complete (a8cbf3c..2f0e300 incl. fix wave, review clean; fix: build-native.sh copies tjs -> native/libs)
Task 6: complete (2f0e300..8ab13cb, review clean; 6 tutorial corrections all verified; carry to T7: examples.md 86->85 checks; concern: npmjs 404 until publish lands, pnpm>=10 esbuild postinstall issue)
Task 7: complete (8ab13cb..c27192a; examples positioning + deep links + 86->85; acceptance: doctor 3-state live OK, locale gate OK, pnpm test 134/133pass/0fail/1skip, docs build OK, npmjs E404 noted; PR #8 feat/onboarding->main; pending: merge + website.yml live check, NPM_TOKEN secret)
Task 7: complete (8ab13cb..c27192a + PR #8; acceptance: doctor 3-state, locale gate, 133/0 tests, npmjs E404 awaits NPM_TOKEN)
Final review: NEEDS FIXES (no critical); wave: N1 stale next line + cd hint, N2 doctor in cli.md, GH publish NODE_AUTH_TOKEN, index.md 86->85, doctor hint wording
Task 1: complete (files committed; local build blocked by macOS 26 native-dlopen deadlock - build verification deferred to CI docs job, see ledger)
Task 1: complete (commit fc944f5, review approved; build verification deferred to CI - macOS26 dlopen deadlock; i18n.json shape to confirm at CI)
Task 2: complete (commit 0673e0e, review approved; minors deferred to final review: findPlaceholders skips .mdx, double-walk in --deploy)
Task 3: complete (commit f38a442, review approved; minors for final review: README/ROADMAP blob-links, cd-line in quick-start)
Task 4: complete (commit 2aaead3, review approved; deviations: 13 WindowEventNames, 11 CLI cmds documented; minor: tauri-migration duplicated table-header rows -> fix delegated to Task 5)
Task 5: complete (commit 7146b43, review approved; parity gates green; minors: events.md wording, under-construction parentheticals, H1/H2 style mix -> final review)
PR #1 created: https://github.com/ZturnLibs/ztron/pull/1 (feat/home-page -> main; merged main d575107, synced copy to @zturnlibs/ztron-* rename, tests 126/0)

Task 1: complete (files committed; local build blocked by macOS 26 native-dlopen deadlock - build verification deferred to CI docs job, see ledger)
Task 1: complete (commit fc944f5, review approved; build verification deferred to CI - macOS26 dlopen deadlock; i18n.json shape to confirm at CI)
Task 2: complete (commit 0673e0e, review approved; minors deferred to final review: findPlaceholders skips .mdx, double-walk in --deploy)
Task 3: complete (commit f38a442, review approved; minors for final review: README/ROADMAP blob-links, cd-line in quick-start)
Task 4: complete (commit 2aaead3, review approved; deviations: 13 WindowEventNames, 11 CLI cmds documented; minor: tauri-migration duplicated table-header rows -> fix delegated to Task 5)
Task 5: complete (commit 7146b43, review approved; parity gates green; minors: events.md wording, under-construction parentheticals, H1/H2 style mix -> final review)
Task 6: complete (commit 3e1b6eb, review approved; minors: 'this machine' phrasing in docs README -> final review)
Task 7: complete (commit 7ee455d on feat/docs via worktree .worktrees/docs, review pending; deviation: build verification deferred to CI; IMPORTANT merge-time item: main renamed packages to @zturnlibs/ztron-* and bumped 0.3.0 - docs content refresh needed at merge (refresh committed on feat/docs))
Task 8: complete (commit bd0fb74, review approved; minor: setup-node cache:pnpm omitted per plan - if added later needs cache-dependency-path docs/pnpm-lock.yaml)
Task 9: complete (commit 02ea3f5, review approved; minors: trap-after-key-write, mirror-blocks-pages ordering per plan -> final review)
Task 10: local verification green (5/5 docs tests, parity x2 exit 0, root 125/126+1skip; build+routing deferred to CI; content spot-checks pass)
Final review: NEEDS-FIXES (C1 sidebar _meta shape v2->v1 build-breaking; C2 _nav.json dead in v1, need per-locale root _meta.json; FIX: stale under-construction x6, ROADMAP deep-link, trap-before-key-write, continue-on-error mirror; DEFER: mdx scan, double-walk, events wording, H1/H2, cache:pnpm, favicon base, ICP both-locales, local deploy cmd)
Final review re-check: READY-TO-MERGE (fix commit 3a52744 verified; residuals non-blocking, listed in review output)
Local verification wave (user-requested): macOS native-dlopen deadlock RESOLVED ITSELF (syspolicyd-style recovery) - rspack/fsevents/mdx-rs now load. Fixed 3 real build bugs local run exposed: (1) import.meta.url/node:url in rspress.config.ts broke client bundling -> root: __dirname (home-site-proven pattern); (2) rspress v1 default root is <cwd>/docs, must set root explicitly; (3) root==docs dir made scanner self-pollute (doc_build artifacts, CONTRIBUTING/README, rspress.config.ts routed) -> route.exclude additions. Upgraded zh/en index to pageType:home (hero+features) which enables HomeFooter/ICP (v1 renders footer only on home layout). VERIFIED LOCALLY: double build exit 0 (idempotent), 27 pages (13x2+404), zh/en nav+hero+ICP rendered, base /ztron/ applied, dev server HTTP 200 smoke. Commit ad390a9.
Task: mirror dropped (commit fbedba5; workflow slimmed, deploy-mirror.sh deleted, spec decision 6 amended)
Merge+refresh wave: merged origin/main (38c8d37; 22 conflicts - sources theirs, README/pkg manual); content refreshed to 0.3.0 (0843fec, 26 files, ZtronEvent/ztron:// + @zturnlibs/ztron-* names); cli/hello version strings aligned (e2770f3); pages unified into website.yml single artifact, docs base /ztron/docs/, docs-deploy.yml deleted (19b35c1). E2E verified: website build + docs build + assemble (dist/docs/index.html, asset paths /ztron/docs/), root tests 126 pass, parity x2 green.
PR wave complete: PR #2 MERGED to main (07:58Z, CI all green incl. fixed docs job). Accidental direct main push (a956a88, ci.yml docs job fix - cwd reset to main checkout between calls) was folded into feat/docs by parallel session (5b41a8b). Docs now at /ztron/docs/ subpath, deployed with homepage via website.yml single artifact.
Pages confirmed live (workflow-type Pages; website run 33730834432 from PR #2 merge deployed homepage+docs; live markers 0.3.0/ICP/ztron:// verified). feat/docs fast-forwarded 5b41a8b->094f7ff (origin/main latest) and pushed.
P2 Task 1: complete (commit 5c00cb9, review approved; 47 en api pages; minors->T2: log count off-by-one, index-link strip assert)
P2 Task 2: complete (commit c64e274, review approved; overlay env-gated zh-only, strict soft in CI; minors: assert style, as-never casts, tag-only comments counted — batch authors beware)
P2 Task 3: complete (commit 24a0694, review approved; 40 groups/324 commands, hard drift gate; minors: warn on unmapped group -> final review)
P2 Task 4: complete (commit 0d62d4f, review approved; 40 fields faithful, dual-failure-mode gate; minors->T5: _meta trailing newline, stale guide 后续 paragraph; minors->final: windows en fallback note, $schema key shape)
P2 Task 5: complete (commit f58f7e6, review approved; reference order cli→commands→config→api; plugins nav live (404 until T6); REMINDER: landing index.md plugins features entry deferred -> fold into T6)
P2 Task 6: complete (51e7e0f + fix 863225b; reviewer-Important dpi SizeLike error fixed and controller-verified vs window.ts:471/497 + dpi.ts; coverage 297/578; minors fixed: honest attributions, merged imports)
P2 Task 7: complete (bc5e777 + fix 92eaf48; coverage 387/578; attribution class fixed incl bonus network.md; report corrected)
P2 Task 8: complete (commit ff13b85, review APPROVED first pass; coverage 524/578; self-audited attribution held; minor: report should name docs-vs-root test suite)
P2 Task 9: complete (3c6624c + fix 23221e4; coverage 578/578 STRICT HARD GREEN; store:default/on_change fact corrected)
P2 COMPLETE: PR #3 merged (T1-T9: typedoc bilingual api ref 578/578 strict hard, commands/config generators, 38 plugin pages x2); PR #4 merged (website.yml gen:api step - api pages were 404 on Pages). LIVE verified: /docs/plugins/* /docs/reference/api/* /commands /config all 200 with zh translations rendering. feat/docs synced to origin/main.
Section-index 404 fix: PR #5 merged (3b3e9f8) - 4 landing pages x2 locales + reference sidebar api dir entry; live 8/8 section URLs 200; build warnings zeroed
P3 COMPLETE: PR #6 merged (three ship/debug guides zh+en, signer generate keypair-mismatch source bug fixed with TDD roundtrip test 128/0, nav wiring, en polish incl events direction check). Live: /docs/guide/{bundling,signing-updater,debugging}.html 200. Spec §9 P1+P2+P3 fully delivered.
RELEASE v0.3.1 DONE: tag on main (28ef8fe+fixes), GPR published all 6 packages 0.3.1 (run 33855889118; subsequent E409 = expected idempotency), GitHub Release created with notes; npmjs public publishing blocked on NPM_TOKEN secret (user action); publish.yml root-caused + fixed (3 commits: pnpm-pack+npm-publish split, NODE_AUTH_TOKEN env, tarball-name cwd)
