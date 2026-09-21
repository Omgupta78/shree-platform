import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

/**
 * Flat config. eslint-config-next v16 ships flat configs directly, so the
 * FlatCompat shim is not needed.
 */
const config = [
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  { ignores: ['.next/**', '.next-db/**', 'node_modules/**', 'next-env.d.ts', 'supabase/**'] },
];

// Named, so `npm run lint` passes its own --max-warnings=0: an anonymous
// default export is the one thing the Next config set warns about here.
export default config;
