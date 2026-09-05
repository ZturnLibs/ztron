export interface Feature {
  icon: 'runtime' | 'ts' | 'plugins' | 'acl' | 'native' | 'tests';
  title: string;
  body: string;
}
export interface PluginGroup { label: string; plugins: string[] }
export interface StatusRow { platform: 'macOS' | 'Windows' | 'Linux'; status: 'ready' | 'wip'; note: string }
export interface CodeTab { id: string; label: string; code: string }
export interface PackageCard { name: string; role: string }
export interface TerminalLine { prompt?: string; text: string; kind?: 'cmd' | 'ok' }

export interface SiteStrings {
  meta: { title: string; description: string };
  nav: { features: string; architecture: string; plugins: string; status: string; quickstart: string; docs: string; langLabel: string };
  hero: { eyebrow: string; title: string; titleAccent: string; body: string; ctaPrimary: string; ctaSecondary: string };
  terminal: { title: string; lines: TerminalLine[] };
  features: { heading: string; headingAccent: string; sub: string; items: Feature[] };
  arch: { heading: string; sub: string; hostTitle: string; hostBody: string; backendTitle: string; backendBody: string; wireLabel: string; frontendLabel: string; packagingLabel: string };
  plugins: { heading: string; headingAccent: string; sub: string; groups: PluginGroup[] };
  statusm: { heading: string; sub: string; rows: StatusRow[]; checks: string; more: string; moreLabel: string };
  quickstart: { heading: string; headingAccent: string; sub: string; tabs: CodeTab[] };
  packages: { heading: string; sub: string; items: PackageCard[] };
  footer: { license: string; links: { label: string; href: string }[] };
}
