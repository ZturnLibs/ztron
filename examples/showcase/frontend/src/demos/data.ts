import { store, Database, logger, attachConsole, path } from "@zturnlibs/ztron-api";
import { act, field, fieldValue, type Demo } from "../demo-ui";
import type { Lang } from "../i18n";

/** 每个模块一个双语字典：可见文案（标题/描述/按钮/输出/代码注释）全覆盖 */
const STR = {
  zh: {
    category: "数据",
    store: {
      title: "键值存储 Store",
      description: "JSON 文件落盘的持久化 KV；写一次，重启应用后读取仍在。",
      code: `import { store } from "@zturnlibs/ztron-api";

const file = await path.tempDir() + "/ztron_store.json";
await store.set(file, "greeting", "hello");
const v = await store.get<string>(file, "greeting");
await store.clear(file);`,
      valueLabel: "要存的值",
      valuePlaceholder: "hello-store",
      set: "set",
      written: (file: string) => `已写入 ${file}`,
      get: "get",
      read: (v: string | null) => `读取：${v}`,
      clear: "clear",
      cleared: "已清空",
    },
    sql: {
      title: "SQLite 数据库",
      description: "Database.load 打开（自动创建）SQLite 文件；execute 建表/插数，select 参数化查询。",
      code: `import { Database, path } from "@zturnlibs/ztron-api";

const db = await Database.load(\`\${await path.tempDir()}/app.db\`);
await db.execute("CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY, text TEXT)");
await db.execute("INSERT INTO notes(text) VALUES(?)", ["hello"]);
const rows = await db.select<{ text: string }>("SELECT * FROM notes");
await db.close();`,
      noteLabel: "便签内容",
      notePlaceholder: "第一条便签",
      insert: "插入一条",
      inserted: (text: string) => `已插入「${text}」`,
      queryAll: "查询全部",
      empty: "(空表)",
    },
    log: {
      title: "结构化日志",
      description: "logger 同时写 stdout/文件/webview 三个 target；attachConsole 把日志回传页面。",
      code: `import { logger, attachConsole } from "@zturnlibs/ztron-api";

await logger.info("来自 showcase");
await logger.error("出错了");

// 把 webview target 的日志接到页面 console
const detach = await attachConsole();
// ...
detach();`,
      msgLabel: "日志内容",
      msgPlaceholder: "hello log",
      write: "写 info / error",
      written: "已写入。终端可见 stdout 版本；文件在 ~/Library/Logs/com.ztron.showcase/",
      errorLine: (m: string) => `${m} (error 级别)`,
      echo: "attachConsole 回显",
      warnMessage: "showcase-log attachConsole 演示",
      received: (m: string) => `页面收到：${m}`,
      notReceived: "未收到回显（可再试一次）",
    },
  },
  en: {
    category: "Data",
    store: {
      title: "Key-value store",
      description:
        "Persistent KV backed by a JSON file on disk; write once and the value survives an app restart.",
      code: `import { store } from "@zturnlibs/ztron-api";

const file = await path.tempDir() + "/ztron_store.json";
await store.set(file, "greeting", "hello");
const v = await store.get<string>(file, "greeting");
await store.clear(file);`,
      valueLabel: "Value to store",
      valuePlaceholder: "hello-store",
      set: "set",
      written: (file: string) => `Written to ${file}`,
      get: "get",
      read: (v: string | null) => `Read: ${v}`,
      clear: "clear",
      cleared: "Cleared",
    },
    sql: {
      title: "SQLite database",
      description:
        "Database.load opens (and creates) a SQLite file; execute creates tables and inserts rows, select runs parameterized queries.",
      code: `import { Database, path } from "@zturnlibs/ztron-api";

const db = await Database.load(\`\${await path.tempDir()}/app.db\`);
await db.execute("CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY, text TEXT)");
await db.execute("INSERT INTO notes(text) VALUES(?)", ["hello"]);
const rows = await db.select<{ text: string }>("SELECT * FROM notes");
await db.close();`,
      noteLabel: "Note content",
      notePlaceholder: "First note",
      insert: "Insert one",
      inserted: (text: string) => `Inserted "${text}"`,
      queryAll: "Query all",
      empty: "(empty table)",
    },
    log: {
      title: "Structured logging",
      description:
        "logger writes to three targets at once: stdout, file, and webview; attachConsole pipes logs back to the page.",
      code: `import { logger, attachConsole } from "@zturnlibs/ztron-api";

await logger.info("from showcase");
await logger.error("something went wrong");

// Attach the webview target logs to the page console
const detach = await attachConsole();
// ...
detach();`,
      msgLabel: "Log message",
      msgPlaceholder: "hello log",
      write: "Write info / error",
      written:
        "Written. The stdout version is visible in the terminal; the file lives in ~/Library/Logs/com.ztron.showcase/",
      errorLine: (m: string) => `${m} (error level)`,
      echo: "attachConsole echo",
      warnMessage: "showcase-log attachConsole demo",
      received: (m: string) => `Page received: ${m}`,
      notReceived: "No echo received (try again)",
    },
  },
};

/** 按语言构建本分类目录；语言切换时 main.ts 会重建 */
export function dataCatalog(lang: Lang): { category: string; demos: Demo[] } {
  const t = STR[lang];

  const storeDemo: Demo = {
    id: "data.store",
    title: t.store.title,
    description: t.store.description,
    code: t.store.code,
    docPath: "/plugins/store.html",
    mount(area, out) {
      const kv = field(t.store.valueLabel, t.store.valuePlaceholder);
      area.append(
        kv,
        act(out, t.store.set, async () => {
          const file = `${await path.tempDir()}/ztron_showcase_store.json`;
          await store.set(file, "greeting", fieldValue(kv) || "hello");
          out.ok(t.store.written(file));
        }),
        act(out, t.store.get, async () => {
          const file = `${await path.tempDir()}/ztron_showcase_store.json`;
          out.ok(t.store.read(await store.get<string>(file, "greeting")));
        }),
        act(out, t.store.clear, async () => {
          const file = `${await path.tempDir()}/ztron_showcase_store.json`;
          await store.clear(file);
          out.ok(t.store.cleared);
        }),
      );
    },
  };

  const sqlDemo: Demo = {
    id: "data.sql",
    title: t.sql.title,
    description: t.sql.description,
    code: t.sql.code,
    docPath: "/plugins/sql.html",
    mount(area, out) {
      const note = field(t.sql.noteLabel, t.sql.notePlaceholder);
      area.append(
        note,
        act(out, t.sql.insert, async () => {
          const db = await Database.load(`${await path.tempDir()}/ztron_showcase.db`);
          await db.execute("CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY, text TEXT)");
          await db.execute("INSERT INTO notes(text) VALUES(?)", [fieldValue(note)]);
          await db.close();
          out.ok(t.sql.inserted(fieldValue(note)));
        }),
        act(out, t.sql.queryAll, async () => {
          const db = await Database.load(`${await path.tempDir()}/ztron_showcase.db`);
          const rows = await db.select<{ id: number; text: string }>(
            "SELECT id, text FROM notes ORDER BY id",
          );
          await db.close();
          out.ok(rows.length ? rows.map((r) => `${r.id}: ${r.text}`).join("\n") : t.sql.empty);
        }),
      );
    },
  };

  const logDemo: Demo = {
    id: "data.log",
    title: t.log.title,
    description: t.log.description,
    code: t.log.code,
    docPath: "/plugins/log.html",
    mount(area, out) {
      const msg = field(t.log.msgLabel, t.log.msgPlaceholder);
      area.append(
        msg,
        act(out, t.log.write, async () => {
          await logger.info(fieldValue(msg));
          await logger.error(t.log.errorLine(fieldValue(msg)));
          out.ok(t.log.written);
        }),
        act(out, t.log.echo, async () => {
          let seen: string | null = null;
          const detach = await attachConsole({
            logger: (m: string) => {
              if (m.includes("showcase-log")) seen = m;
            },
          });
          await logger.warn(t.log.warnMessage);
          await new Promise((r) => setTimeout(r, 500));
          detach();
          out.ok(seen ? t.log.received(seen) : t.log.notReceived);
        }),
      );
    },
  };

  return { category: t.category, demos: [storeDemo, sqlDemo, logDemo] };
}
