import { createHighlighter } from 'shiki';

let highlighter: Awaited<ReturnType<typeof createHighlighter>> | null = null;

export async function highlight(code: string, lang = 'bash'): Promise<string> {
  highlighter ??= await createHighlighter({
    themes: ['github-dark-default'],
    langs: [lang],
  });
  return highlighter.codeToHtml(code, { lang, theme: 'github-dark-default' });
}
