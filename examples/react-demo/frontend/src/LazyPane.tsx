/**
 * React.lazy 动态导入的目标组件（App.tsx 里 `lazy(() => import("./LazyPane"))`）。
 *
 * 打包事实：`ztron build` 的前端产物是单文件 IIFE，动态 import 会被 Rollup
 * 内联进主包，本组件因此随主 bundle 一起下发（可用产物内的 REACT_LAZY_OK
 * 标记字符串验证）。剪贴板走 core 内建的 plugin:clipboard 命令，无需额外插件。
 */
import { useState } from "react";
import { clipboard } from "@zturnlibs/ztron-api";

const btn =
  "inline-flex items-center rounded-lg border border-black/10 bg-[#f7f8fa] px-3.5 py-1.5 text-[13px] transition-colors hover:border-black/20 disabled:cursor-default disabled:opacity-50 dark:border-white/10 dark:bg-[#161a23] dark:text-[#e6eaf2] dark:hover:border-white/20";
const out =
  "mt-3 w-full whitespace-pre-wrap break-all rounded-lg border border-black/10 bg-[#eef0f4] px-3 py-2.5 font-mono text-[12.5px] dark:border-white/10 dark:bg-[#0d1017]";

export default function LazyPane() {
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  async function roundTrip() {
    setBusy(true);
    try {
      const stamp = `REACT_LAZY_OK ${new Date().toISOString()}`;
      await clipboard.writeText(stamp);
      const back = await clipboard.readText();
      setResult(
        back === stamp ? `剪贴板往返一致：${back}` : `不一致，写入 ${stamp}，读到 ${back}`,
      );
    } catch (err) {
      setResult(`失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1">
      <p className="text-[13px] leading-relaxed text-[#5b6472] dark:text-[#9aa3b2]">
        本组件经 React.lazy 动态加载，演示 IIFE 打包下动态 import 的内联；
        按钮做一次剪贴板写入再读回的往返。
      </p>
      <button className={`${btn} mt-3`} onClick={() => void roundTrip()} disabled={busy}>
        剪贴板写入并读回
      </button>
      {result && <pre className={out}>{result}</pre>}
    </div>
  );
}
