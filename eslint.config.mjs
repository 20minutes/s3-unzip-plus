import baseConfig from '@20minutes/eslint-config'
import tsParser from '@typescript-eslint/parser'

export default [
  ...baseConfig,
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      parser: tsParser,
    },
    settings: {
      react: {
        version: '18.2',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
]
