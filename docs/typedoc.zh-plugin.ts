/**
 * Ztron zh-locale TypeDoc plugin (P2 Task 2).
 *
 * During the zh build (`ZTRON_API_LOCALE=zh`, set by
 * `scripts/gen-api-docs.ts`) this overlays Chinese doc text from
 * `docs/translations/api-zh.json` onto the reflection tree before the
 * markdown renderer runs:
 *
 * - keys are qualified names joined from the module reflection down,
 *   e.g. `fs.readFile` (module `fs`, exported function `readFile`).
 *   Class/interface members nest under the class name
 *   (`window.Window.getCurrent`); function/method overload signatures
 *   roll up to their host symbol, so one key covers all overloads.
 * - an entry may carry any subset of `summary`, `params` (map of
 *   parameter name to text) and `returns`; only present parts are
 *   replaced.
 *
 * Symbols with a non-empty doc comment but no JSON key are recorded as
 * *missed*; keys never encountered are *orphans*. Both lists are
 * consumed by `gen-api-docs.ts --check` (strict gate, `gen:api:check`).
 *
 * TypeDoc 0.28 plugin contract: the module must export a `load` function
 * that receives the {@link Application} instance. Reflection/comment
 * shapes verified against typedoc 0.28.20 `dist/types`:
 * - `Comment.summary: CommentDisplayPart[]`
 * - `Comment.blockTags: CommentTag[]` with `CommentTag.tag` (`@param`,
 *   `@returns`), `CommentTag.name?`, `CommentTag.content`.
 *
 * Note: this file is loaded by Node's type-stripping loader
 * (`node --experimental-strip-types`), so it must stay free of
 * non-erasable TypeScript syntax (enums, namespaces, parameter
 * properties). `ReflectionKind` comparisons therefore use the raw enum
 * values (`Project = 1`) instead of the enum object.
 */
import { readFileSync } from "node:fs";
import { CommentTag } from "typedoc";
import type {
  Application,
  Comment,
  CommentDisplayPart,
  DeclarationReflection,
  Reflection,
} from "typedoc";

/** Per-symbol zh overlay; every field is optional (replace what is present). */
export interface ApiTranslationEntry {
  summary?: string;
  params?: Record<string, string>;
  returns?: string;
}

/** `docs/translations/api-zh.json` shape: qualified name → entry. */
export type ApiTranslations = Record<string, ApiTranslationEntry>;

const translationsPath = new URL("./translations/api-zh.json", import.meta.url);

/** Module-level build state (reset in `load` when the zh build starts). */
const state = {
  translations: {} as ApiTranslations,
  /** Qualified names of all symbols with translatable doc comments. */
  encountered: new Set<string>(),
  /** Subset of `encountered` that had a JSON entry applied. */
  translated: new Set<string>(),
};

/** Load + shape-check `docs/translations/api-zh.json`. */
function loadTranslations(): ApiTranslations {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(translationsPath, "utf8"));
  } catch (error) {
    throw new Error(
      `[ztron-zh-plugin] cannot read ${translationsPath.pathname}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `[ztron-zh-plugin] ${translationsPath.pathname}: expected a top-level object`,
    );
  }
  return parsed as ApiTranslations;
}

/**
 * Qualified name (`fs.readFile`, `window.Window.getCurrent`) of a
 * declaration: its own name joined with all ancestor names down to (but
 * excluding) the project reflection (`ReflectionKind.Project = 1`).
 */
function qualifiedName(refl: DeclarationReflection): string {
  const parts: string[] = [];
  for (let cur: Reflection | undefined = refl; cur; cur = cur.parent) {
    if (cur.kind === 1 /* ReflectionKind.Project */) break;
    parts.unshift(cur.name);
  }
  return parts.join(".");
}

/** Signatures carry no identity of their own — key by the host symbol. */
function hostReflection(refl: Reflection): DeclarationReflection | undefined {
  if ((refl as { variant?: string }).variant === "signature") {
    return refl.parent as DeclarationReflection | undefined;
  }
  return refl as DeclarationReflection;
}

/** True when the comment carries anything a translator could replace. */
function isTranslatable(comment: Comment): boolean {
  return comment.summary.length > 0 || comment.blockTags.length > 0;
}

function textPart(text: string): CommentDisplayPart {
  return { kind: "text", text };
}

/** Replace exactly the parts present in `entry` (never the EN fallbacks). */
function applyEntry(comment: Comment, entry: ApiTranslationEntry): void {
  if (typeof entry.summary === "string") {
    comment.summary = [textPart(entry.summary)];
  }
  if (entry.params) {
    for (const tag of comment.blockTags) {
      const paramText = tag.name === undefined ? undefined : entry.params[tag.name];
      if (tag.tag === "@param" && typeof paramText === "string") {
        tag.content = [textPart(paramText)];
      }
    }
  }
  if (typeof entry.returns === "string") {
    const returnsTag = comment.blockTags.find((t) => t.tag === "@returns");
    if (returnsTag) {
      returnsTag.content = [textPart(entry.returns)];
    } else {
      // EN comment had no @returns; add one so zh readers get the text.
      comment.blockTags.push(new CommentTag("@returns", [textPart(entry.returns)]));
    }
  }
}

/** Record the symbol and overlay zh text when a key matches. */
function overlay(refl: Reflection): void {
  const host = hostReflection(refl);
  if (!host) return;
  const key = qualifiedName(host);
  if (!key) return;
  const comment = refl.comment;
  if (!comment || !isTranslatable(comment)) return;
  state.encountered.add(key);
  const entry = state.translations[key];
  if (!entry) return; // missed: counted, EN text stays as fallback
  applyEntry(comment, entry);
  state.translated.add(key);
}

/**
 * TypeDoc plugin entry point. Registers the overlay only for zh builds
 * (the en build keeps the original English comments untouched).
 */
export function load(app: Application): void {
  if (process.env.ZTRON_API_LOCALE !== "zh") return;
  state.translations = loadTranslations();
  state.encountered.clear();
  state.translated.clear();
  app.converter.on("createDeclaration" as never, (_c: unknown, refl: DeclarationReflection) =>
    overlay(refl),
  );
  app.converter.on("createSignature" as never, (_c: unknown, refl: Reflection) =>
    overlay(refl),
  );
}

/** Every symbol seen with a translatable comment during the zh build. */
export function encountered(): string[] {
  return [...state.encountered].sort();
}

/** Symbols whose doc text was actually replaced from the JSON. */
export function translated(): string[] {
  return [...state.translated].sort();
}

/** Symbols seen but without a JSON key — the translation debt list. */
export function missed(): string[] {
  return [...state.encountered]
    .filter((key) => !state.translated.has(key))
    .sort();
}
