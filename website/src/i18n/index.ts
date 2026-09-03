import type { SiteStrings } from './types';
import { en } from './en';
import { zh } from './zh';

export function getStrings(locale: 'en' | 'zh'): SiteStrings {
  return locale === 'zh' ? zh : en;
}
