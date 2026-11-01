// Only the Rules of Hooks for now: a hook called after an early return or inside an `if`
// crashes the screen on the render where the branch changes ("Rendered more hooks").
// Inline eslint comments in the code name rules not set up here, so they are ignored
// (noInlineConfig) and `--quiet` hides the notes about that.
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    files: ['App.tsx', 'src/**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error' },
  },
];
