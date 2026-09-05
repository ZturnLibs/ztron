/** 文档站地址（zh 默认语言，en 挂 /en/ 前缀）。docPath 见规格第 5 节对照表。 */
const DOCS_BASE = "https://zturnlibs.github.io/ztron/docs";

export function docUrl(docPath: string): string {
  return DOCS_BASE + docPath;
}
