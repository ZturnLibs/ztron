import { createApp } from "vue";
import { invoke } from "@zturnlibs/ztron-api";
import App from "./App.vue";
import "./index.css";

// 开发期诊断：把 Vite HMR 事件回传后端日志，作为 Vue SFC 热更新的证据
//（组件热更新会派发 vite:afterUpdate；整页刷新会先派发 vite:beforeFullReload）。
// 监听挂在入口模块自己的 hot 上下文上：入口在被测文件（App.vue）热更新时
// 不会重新执行，监听因此常驻。打包构建时 import.meta.hot 为 undefined，
// 此块整体不生效。
if (import.meta.hot) {
  import.meta.hot.on<{ type?: string }>("vite:afterUpdate", (d) => {
    void invoke("vue-demo:report", {
      received: `VUE_HMR_UPDATE:${d?.type ?? "unknown"}`,
    }).catch(() => {});
  });
  import.meta.hot.on("vite:beforeFullReload", () => {
    void invoke("vue-demo:report", { received: "VUE_HMR_FULL_RELOAD" }).catch(() => {});
  });
}

createApp(App).mount("#root");
