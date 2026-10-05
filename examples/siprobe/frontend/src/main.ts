/**
 * siprobe frontend — exists to satisfy the packaged build (ztron build
 * requires a frontend dir). The window itself renders an inline html page
 * (declared in the backend), which bootstraps the self-driving "run"
 * command; this page only mirrors that bootstrap for manual dev runs.
 */
import { invoke } from "@zturnlibs/ztron-api";

invoke("run", {}).catch((e) => console.log("[siprobe] run err", e));
