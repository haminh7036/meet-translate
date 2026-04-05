import pluginVue from 'eslint-plugin-vue'
import tsESLint from 'typescript-eslint'
import globals from 'globals'

export default tsESLint.config(
  {
    files: ['src/**/*.ts', 'src/**/*.vue'],
    languageOptions: {
      globals: {
        ...globals.browser,
        chrome: 'readonly',
      },
      parserOptions: {
        parser: tsESLint.parser,
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
  },
  ...tsESLint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off',
    },
  }
)
