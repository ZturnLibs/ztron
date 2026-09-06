import { fs, path } from "@zturnlibs/ztron-api";
import { act, field, fieldValue, type Demo } from "../demo-ui";
import type { Lang } from "../i18n";

/** 每个模块一个双语字典：可见文案（标题/描述/按钮/输出/代码注释）全覆盖 */
const STR = {
  zh: {
    category: "文件",
    readWrite: {
      title: "文件读写",
      description: "fs 写/读文本与二进制；路径受 ACL scope 约束（本应用放行 $TMP/**）。",
      code: `import { fs } from "@zturnlibs/ztron-api";

await fs.writeText("$TMP/ztron_demo.txt", "你好 Ztron");
const text = await fs.readText("$TMP/ztron_demo.txt");

const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
await fs.writeFile("$TMP/ztron_demo.bin", bytes);
const back = await fs.readFile("$TMP/ztron_demo.bin");`,
      contentLabel: "文件内容",
      contentPlaceholder: "你好 Ztron",
      writeRead: "写入并读回",
      readBack: (text: string) => `读回：${text}`,
      binary: "二进制写读",
      binaryDone: (n: number, same: boolean) => `读回 ${n} 字节，逐字节一致：${same}`,
    },
    dirs: {
      title: "目录列表与路径",
      description: "readDir 列目录；path 拼路径并取系统目录（临时/家/应用数据）。",
      code: `import { fs, path } from "@zturnlibs/ztron-api";

const entries = await fs.readDir("$TMP");   // { name, isDirectory, isFile }[]
const temp = await path.tempDir();
const home = await path.homeDir();
const appData = await path.appDataDir();    // ~/Library/Application Support/<appId>
const joined = await path.join(temp, "a", "b.txt");`,
      listTmp: "列出临时目录前 8 项",
      dirTag: "[目录] ",
      fileTag: "[文件] ",
      tmpSummary: (count: number, names: string) => `$TMP 共 ${count} 项：\n${names}${count > 8 ? "\n…" : ""}`,
      sysDirs: "系统目录",
    },
    watch: {
      title: "文件监听 watch",
      description: "fs.watch 监听文件变化（底层 FSEvents），返回取消监听函数。",
      code: `import { fs } from "@zturnlibs/ztron-api";

const unwatch = await fs.watch("$TMP/ztron_watch.txt", (ev) => {
  console.log(ev.type, ev.path);   // "modify" | ...
});
await fs.writeText("$TMP/ztron_watch.txt", "v2");  // 触发 modify
unwatch();`,
      run: "监听并改写文件",
      event: (type: string) => `事件：${type}`,
      done: (count: number, types: string[]) => `共 ${count} 个事件（${types.join("、")}），已取消监听`,
      none: "未捕获事件（可再试一次）",
    },
  },
  en: {
    category: "FS",
    readWrite: {
      title: "File read/write",
      description:
        "fs writes and reads text and binary files; paths are constrained by ACL scopes (this app allows $TMP/**).",
      code: `import { fs } from "@zturnlibs/ztron-api";

await fs.writeText("$TMP/ztron_demo.txt", "Hello Ztron");
const text = await fs.readText("$TMP/ztron_demo.txt");

const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
await fs.writeFile("$TMP/ztron_demo.bin", bytes);
const back = await fs.readFile("$TMP/ztron_demo.bin");`,
      contentLabel: "File content",
      contentPlaceholder: "Hello Ztron",
      writeRead: "Write and read back",
      readBack: (text: string) => `Read back: ${text}`,
      binary: "Binary write/read",
      binaryDone: (n: number, same: boolean) => `Read back ${n} bytes, byte-for-byte identical: ${same}`,
    },
    dirs: {
      title: "Directory listing and paths",
      description:
        "readDir lists directory entries; path joins paths and resolves system directories (temp / home / app data).",
      code: `import { fs, path } from "@zturnlibs/ztron-api";

const entries = await fs.readDir("$TMP");   // { name, isDirectory, isFile }[]
const temp = await path.tempDir();
const home = await path.homeDir();
const appData = await path.appDataDir();    // ~/Library/Application Support/<appId>
const joined = await path.join(temp, "a", "b.txt");`,
      listTmp: "List first 8 entries of $TMP",
      dirTag: "[dir] ",
      fileTag: "[file] ",
      tmpSummary: (count: number, names: string) => `$TMP has ${count} entries:\n${names}${count > 8 ? "\n…" : ""}`,
      sysDirs: "System directories",
    },
    watch: {
      title: "File watching: fs.watch",
      description:
        "fs.watch watches a file for changes (backed by FSEvents) and returns a function to stop watching.",
      code: `import { fs } from "@zturnlibs/ztron-api";

const unwatch = await fs.watch("$TMP/ztron_watch.txt", (ev) => {
  console.log(ev.type, ev.path);   // "modify" | ...
});
await fs.writeText("$TMP/ztron_watch.txt", "v2");  // triggers a modify
unwatch();`,
      run: "Watch and rewrite the file",
      event: (type: string) => `Event: ${type}`,
      done: (count: number, types: string[]) => `${count} events in total (${types.join(", ")}), unwatched`,
      none: "No events captured (try again)",
    },
  },
};

/** 按语言构建本分类目录；语言切换时 main.ts 会重建 */
export function fsCatalog(lang: Lang): { category: string; demos: Demo[] } {
  const t = STR[lang];

  const readWrite: Demo = {
    id: "fs.rw",
    title: t.readWrite.title,
    description: t.readWrite.description,
    code: t.readWrite.code,
    docPath: "/plugins/fs.html",
    mount(area, out) {
      const content = field(t.readWrite.contentLabel, t.readWrite.contentPlaceholder);
      area.append(
        content,
        act(out, t.readWrite.writeRead, async () => {
          await fs.writeText("$TMP/ztron_showcase.txt", fieldValue(content));
          const back = await fs.readText("$TMP/ztron_showcase.txt");
          out.ok(t.readWrite.readBack(back));
        }),
        act(out, t.readWrite.binary, async () => {
          const magic = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
          await fs.writeFile("$TMP/ztron_showcase.bin", magic);
          const back = await fs.readFile("$TMP/ztron_showcase.bin");
          const same = magic.every((b, i) => back[i] === b);
          out.ok(t.readWrite.binaryDone(back.length, same));
        }),
      );
    },
  };

  const dirs: Demo = {
    id: "fs.path",
    title: t.dirs.title,
    description: t.dirs.description,
    code: t.dirs.code,
    docPath: "/plugins/path.html",
    mount(area, out) {
      area.append(
        act(out, t.dirs.listTmp, async () => {
          const entries = await fs.readDir("$TMP");
          const names = entries
            .slice(0, 8)
            .map((e) => `${e.isDirectory ? t.dirs.dirTag : t.dirs.fileTag}${e.name}`);
          out.ok(t.dirs.tmpSummary(entries.length, names.join("\n")));
        }),
        act(out, t.dirs.sysDirs, async () => {
          const [temp, home, appData] = await Promise.all([
            path.tempDir(),
            path.homeDir(),
            path.appDataDir(),
          ]);
          out.ok(`temp: ${temp}\nhome: ${home}\nappData: ${appData}`);
        }),
      );
    },
  };

  const watchDemo: Demo = {
    id: "fs.watch",
    title: t.watch.title,
    description: t.watch.description,
    code: t.watch.code,
    docPath: "/plugins/fs.html",
    mount(area, out) {
      area.append(
        act(out, t.watch.run, async () => {
          await fs.writeText("$TMP/ztron_showcase_watch.txt", "v1");
          const events: string[] = [];
          const unwatch = await fs.watch("$TMP/ztron_showcase_watch.txt", (ev) => {
            events.push(ev.type);
            out.info(t.watch.event(ev.type));
          });
          await new Promise((r) => setTimeout(r, 400));
          await fs.writeText("$TMP/ztron_showcase_watch.txt", "v2");
          await new Promise((r) => setTimeout(r, 1500));
          unwatch();
          out.ok(events.length > 0 ? t.watch.done(events.length, [...new Set(events)]) : t.watch.none);
        }),
      );
    },
  };

  return { category: t.category, demos: [readWrite, dirs, watchDemo] };
}
