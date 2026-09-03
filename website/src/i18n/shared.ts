export const ANCHORS = {
  features: '#features',
  architecture: '#architecture',
  plugins: '#plugins',
  status: '#status',
  quickstart: '#quickstart',
} as const;

export const REPO = 'https://github.com/ZturnLibs/ztron';
export const repoDoc = (file: string) => `${REPO}/blob/main/${file}`;
