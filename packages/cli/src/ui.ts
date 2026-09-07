/** TTY-aware ANSI helpers: plain passthrough when piped or NO_COLOR is set. */
const enabled = process.stdout.isTTY === true && !process.env.NO_COLOR;

const wrap = (code: string) => (s: string) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : s);

export const green = wrap("32");
export const red = wrap("31");
export const yellow = wrap("33");
export const dim = wrap("2");
export const bold = wrap("1");
