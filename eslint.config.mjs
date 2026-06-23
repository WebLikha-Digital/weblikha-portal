import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Prevent accidental console.log left in production code
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Enforce explicit return types on exported functions for clarity
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // Disallow unused variables (underscore-prefix to opt out)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]

export default eslintConfig
