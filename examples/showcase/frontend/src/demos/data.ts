import { store, Database, logger, attachConsole, path } from "@zturnlibs/ztron-api";
import { act, field, fieldValue, type Demo } from "../demo-ui";

const storeDemo: Demo = {
  id: "data.store",
  title: "键值存储 Store",
  description: "JSON 文件落盘的持久化 KV；写一次，重启应用后读取仍在。",
  code: `import { store } from "@zturnlibs/ztron-api";

const file = await path.tempDir() + "/ztron_store.json";
await store.set(file, "greeting", "hello");
const v = await store.get<string>(file, "greeting");
await store.clear(file);`,
  docPath: "/plugins/store.html",
  mount(area, out) {
    const kv = field("要存的值", "hello-store");
    area.append(
      kv,
      act(out, "set", async () => {
        const file = `${await path.tempDir()}/ztron_showcase_store.json`;
        await store.set(file, "greeting", fieldValue(kv) || "hello");
        out.ok(`已写入 ${file}`);
      }),
      act(out, "get", async () => {
        const file = `${await path.tempDir()}/ztron_showcase_store.json`;
        out.ok(`读取：${await store.get<string>(file, "greeting")}`);
      }),
      act(out, "clear", async () => {
        const file = `${await path.tempDir()}/ztron_showcase_store.json`;
        await store.clear(file);
        out.ok("已清空");
      }),
    );
  },
};

const sqlDemo: Demo = {
  id: "data.sql",
  title: "SQLite 数据库",
  description: "Database.load 打开（自动创建）SQLite 文件；execute 建表/插数，select 参数化查询。",
  code: `import { Database, path } from "@zturnlibs/ztron-api";

const db = await Database.load(\`\${await path.tempDir()}/app.db\`);
await db.execute("CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY, text TEXT)");
await db.execute("INSERT INTO notes(text) VALUES(?)", ["hello"]);
const rows = await db.select<{ text: string }>("SELECT * FROM notes");
await db.close();`,
  docPath: "/plugins/sql.html",
  mount(area, out) {
    const note = field("便签内容", "第一条便签");
    area.append(
      note,
      act(out, "插入一条", async () => {
        const db = await Database.load(`${await path.tempDir()}/ztron_showcase.db`);
        await db.execute("CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY, text TEXT)");
        await db.execute("INSERT INTO notes(text) VALUES(?)", [fieldValue(note)]);
        await db.close();
        out.ok(`已插入「${fieldValue(note)}」`);
      }),
      act(out, "查询全部", async () => {
        const db = await Database.load(`${await path.tempDir()}/ztron_showcase.db`);
        const rows = await db.select<{ id: number; text: string }>(
          "SELECT id, text FROM notes ORDER BY id",
        );
        await db.close();
        out.ok(rows.length ? rows.map((r) => `${r.id}: ${r.text}`).join("\n") : "(空表)");
      }),
    );
  },
};

const logDemo: Demo = {
  id: "data.log",
  title: "结构化日志",
  description: "logger 同时写 stdout/文件/webview 三个 target；attachConsole 把日志回传页面。",
  code: `import { logger, attachConsole } from "@zturnlibs/ztron-api";

await logger.info("来自 showcase");
await logger.error("出错了");

// 把 webview target 的日志接到页面 console
const detach = await attachConsole();
// ...
detach();`,
  docPath: "/plugins/log.html",
  mount(area, out) {
    const msg = field("日志内容", "hello log");
    area.append(
      msg,
      act(out, "写 info / error", async () => {
        await logger.info(fieldValue(msg));
        await logger.error(`${fieldValue(msg)} (error 级别)`);
        out.ok("已写入。终端可见 stdout 版本；文件在 ~/Library/Logs/com.ztron.showcase/");
      }),
      act(out, "attachConsole 回显", async () => {
        let seen: string | null = null;
        const detach = await attachConsole({
          logger: (m: string) => {
            if (m.includes("showcase-log")) seen = m;
          },
        });
        await logger.warn("showcase-log attachConsole 演示");
        await new Promise((r) => setTimeout(r, 500));
        detach();
        out.ok(seen ? `页面收到：${seen}` : "未收到回显（可再试一次）");
      }),
    );
  },
};

export const dataDemos: Demo[] = [storeDemo, sqlDemo, logDemo];
