import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Allow explicit any for existing codebase patterns (can be gradually fixed)
      '@typescript-eslint/no-explicit-any': 'warn',
      // Discourage deep relative imports (warn level to allow gradual migration)
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['../*/../*'],
              message: 'Prefer using @/ alias for deep imports',
            },
          ],
        },
      ],
    },
  },
)
