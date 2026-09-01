export { App, AppBuilder } from "./app.js";
export type { AppConfig, AppOptions } from "./app.js";
export { CommandRegistry } from "./commands/index.js";
export type {
  CommandContext,
  CommandHandler,
  CommandHandlers,
  CommandDef,
  CommandName,
  CommandArgs,
  CommandResult,
  CommandNameOf,
} from "./commands/index.js";
export { defineCommand, isCommandDef } from "./commands/index.js";
export { MockRuntime, MockWebviewHandle } from "./testing/mock.js";
export { EventTarget, emitToWebview, isValidEventName } from "./events.js";
export type { Event } from "./events.js";
export { IpcHub } from "./ipc/mod.js";
export type { InvokeHandler, InvokeMessage } from "./ipc/mod.js";
export { ChannelHandle } from "./ipc/channel.js";
export {
  RawResponse,
  RAW_RESPONSE_KEY,
  serializeResult,
  unwrapRawResponse,
} from "./ipc/raw.js";
export { formatCallback } from "./ipc/formatCallback.js";
export { EventManager } from "./ipc/eventManager.js";
export type { EventTarget as EventTargetRef } from "./ipc/eventManager.js";
export { PluginManager } from "./plugin.js";
export type { Plugin } from "./plugin.js";
export { PathScope } from "./scope.js";
export type { PathScopeConfig } from "./scope.js";
export {
  cliPlugin,
  parseArgv,
  fsPlugin,
  pathPlugin,
  httpPlugin,
  osPlugin,
  storePlugin,
  logPlugin,
  shellPlugin,
    openerPlugin,
  updaterPlugin,
  compareVersions,
  compareSemver,
  verifyMinisig,
  parsePublicKeyFile,
  parseSignatureFile,
  parseSecretKeyFile,
  generateKeypair,
  signMinisig,
  dumpSignatureFile,
  dumpPublicKeyFile,
  sqlPlugin,
  autostartPlugin,
  windowStatePlugin,
  singleInstancePlugin,
  websocketPlugin,
  localIpPlugin,
  networkPlugin,
  uploadPlugin,
  persistedScopePlugin,
  localhostPlugin,
  barcodeScannerPlugin,
  biometricPlugin,
  geolocationPlugin,
  hapticsPlugin,
  nfcPlugin,
  PluginUnavailable,
} from "./plugins/index.js";
export type {
  FsPluginOptions,
  DirEntry,
  FileMeta,
  HttpPluginOptions,
  HttpResponse,
  OsInfo,
  StorePluginOptions,
  LogLevel,
  LogPluginOptions,
  ShellPluginOptions,
  ShellScopeEntry,
  ExecResult,
  OpenerPluginOptions,
  UpdaterManifest,
  UpdateCheck,
  UpdaterPluginOptions,
  SqlPluginOptions,
  AutostartPluginOptions,
  WindowStatePluginOptions,
  SingleInstancePluginOptions,
  UploadPluginOptions,
  PersistedScopePluginOptions,
  PathPluginOptions,
  LocalhostPluginOptions,
} from "./plugins/index.js";
export { HttpScope } from "./httpScope.js";
export type { HttpScopeConfig, HttpScopeEntry } from "./httpScope.js";
export type {
  RuntimeAdapter,
  WebviewHandle,
  WindowConfig,
  WindowEvent,
  WindowFrame,
  WindowStateSnapshot,
  WindowStateOp,
  MonitorInfo,
  TrayController,
  TrayOp,
  TrayPayload,
  MenuConfig,
  MenuItemConfig,
  MenuController,
  DialogController,
  ClipboardController,
  NotificationController,
  NotificationOptions,
  GlobalShortcutController,
  DeepLinkController,
  ProcessController,
  ImageController,
  ApplicationController,
  MenuItemsSnapshot,
  TrayEventPayload,
  OpenDialogOptions,
  SaveDialogOptions,
  MessageDialogOptions,
} from "./runtime.js";
export {
  DECLARED_UNSUPPORTED_WINDOW_FIELDS,
  UPSTREAM_WINDOW_FIELDS,
} from "./runtime.js";
export { StateManager } from "./state.js";
export {
  PermissionRegistry,
  ResolvedAcl,
  resolveAcl,
  permissiveAcl,
  parseCapabilityFile,
  loadCapabilitiesFromDir,
  loadCapabilities,
} from "./acl/index.js";
export type {
  Identifier,
  Permission,
  PermissionSet,
  PermissionEntry,
  Capability,
  CapabilityFile,
  PathScopeLike,
  AclDecision,
} from "./acl/index.js";

export { validateProjectConfig } from "./app.js";
export type { ProjectConfigFile } from "./app.js";

export type {
  CliPluginOptions,
  CliMatches,
  CliSchema,
  CliArgDef,
  CliSubcommandDef,
} from "./plugins/index.js";
