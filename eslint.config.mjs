import next from 'eslint-config-next/core-web-vitals'

/**
 * Flat config (ESLint 9 + Next 16). Replaces the legacy `.eslintrc.json` and the
 * removed `next lint` command. Run with `npm run lint` (`eslint .`).
 */
export default [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...next,
]
