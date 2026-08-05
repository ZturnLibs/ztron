export type {
  Identifier,
  Permission,
  PermissionSet,
  PermissionEntry,
  Capability,
  CapabilityFile,
  PathScopeLike,
} from "./types.js";
export { PermissionRegistry } from "./registry.js";
export { ResolvedAcl } from "./resolved.js";
export type { AclDecision } from "./resolved.js";
export { resolveAcl, permissiveAcl } from "./resolver.js";
export {
  parseCapabilityFile,
  loadCapabilitiesFromDir,
  loadCapabilities,
} from "./loader.js";
