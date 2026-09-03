import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://zturnlibs.github.io',
  base: '/ztron/',
  i18n: { defaultLocale: 'en', locales: ['en', 'zh'] },
});
