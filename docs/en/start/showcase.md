---
title: Showcase Demo App
---

# Showcase: learn Ztron by clicking

Prerequisite: finish [Installation](/en/start/install) (`ztron doctor` all green).

Showcase is a runnable desktop app that turns Ztron's capabilities into **34
interactive cards**: every button really calls the corresponding API — opening
native dialogs, reading the clipboard, creating a second window, switching the
app theme, going frameless — with the result shown in place, plus a minimal
code snippet and a direct link to the matching docs page. Think Electron API
Demos, built with Ztron.

## Run it

From the repository root (native toolchain built per [Installation](/en/start/install)):

```bash
git clone https://github.com/ZturnLibs/ztron.git && cd ztron  # skip if already cloned
pnpm install
pnpm --filter @zturnlibs/ztron-example-showcase dev
```

The native window titled "Ztron Showcase" is your success signal. Frontend edits
hot-reload; use `ztron build` for packaging.

## Interface tour

- **Sidebar**: 8 categories (Core, Window, FS, Network, Dialogs, Menu & Tray,
  Data, System). Click to switch cards;
- **Each card has three zones**:
  1. **Interaction** — buttons and inputs that really execute;
  2. **Output** — green on success, red on failure; ACL denials and network
     errors are shown verbatim (error-reading is part of the lesson);
  3. **Code** — the minimal usage snippet; the copy button uses Ztron's own
     clipboard API;
- **Docs button** — top-right of every card, linking straight to this site.

## The 34 cards at a glance

| Category | Cards | Highlights |
| --- | --- | --- |
| Core | 4 | invoke (with codegen bindings), events, Channel streaming |
| Window | 5 | control, multi-window, monitors & events, **theme switching**, **frameless window** |
| FS | 3 | text/binary IO, directories & paths, fs.watch |
| Network | 3 | http.fetch, streaming download, WebSocket |
| Dialogs | 4 | open/save, message/ask/confirm, notifications, clipboard |
| Menu & Tray | 3 | app menu, TrayIcon, global shortcuts |
| Data | 3 | Store KV, SQLite, structured logging |
| System | 9 | app/os info, shell, opener, single-instance, deep-link, autostart, window-state, network, updater |

## Two cards to try first

- **Window → Theme switching**: click "Light" and the whole UI recolors
  instantly; pick "Follow system" and flip macOS appearance — the page follows
  live (`Window.setTheme()` plus CSS `prefers-color-scheme`);
- **Window → Frameless window**: titlebar gone, traffic lights moved, click
  through, drag region — every effect auto-restores after a few seconds.

## As a project template

Showcase is itself a standard Ztron app: `ztron.conf.json` (declarative
windows), `capabilities/default.json` (ACL permissions), `src/commands.ts` +
`ztron codegen` (typed command bindings). It mirrors the `ztron init` scaffold,
so new projects can copy from it freely.
Source: [`examples/showcase/`](https://github.com/ZturnLibs/ztron/tree/main/examples/showcase).

## Smoke gate

```bash
cd examples/showcase && ztron check --expect SHOWCASE_OK
```

"34 cards rendered and reported" doubles as a smoke check (exit 0), CI-friendly.

**Next: [Quick Start](/en/start/quick-start) · [Examples](/en/start/examples) · [IPC](/en/guide/ipc) · [Security ACL](/en/guide/security)**
