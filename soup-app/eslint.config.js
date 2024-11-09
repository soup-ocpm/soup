// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const simpleImportSort = require('eslint-plugin-simple-import-sort');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = tseslint.config(
  {
    files: ['**/*.ts'],
    ignores: [],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
      eslintPluginPrettierRecommended,
      {
        plugins: {
          'simple-import-sort': simpleImportSort
        },
        rules: {
          'simple-import-sort/imports': [
            'error',
            {
              groups: [['^\\u0000'], ['^@?(?!baf)\\w'], ['^@baf?\\w'], ['^\\w'], ['^[^.]'], ['^\\.']]
            }
          ],
          'simple-import-sort/exports': 'error'
        }
      }
    ],
    processor: angular.processInlineTemplates,
    rules: {
      'prettier/prettier': [
        'error',
        {},
        {
          usePrettierrc: true
        }
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          style: 'kebab-case'
        }
      ],
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          style: 'camelCase'
        }
      ],
      'no-multiple-empty-lines': [
        'error',
        {
          max: 1,
          maxEOF: 1,
          maxBOF: 0
        }
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
          filter: {
            regex: '^(ts-jest|\\^.*)$',
            match: false
          }
        },
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow'
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow'
        },
        {
          selector: 'typeLike',
          format: ['PascalCase']
        },
        {
          selector: 'enumMember',
          format: ['PascalCase']
        },
        {
          selector: 'property',
          format: null,
          filter: {
            regex: '^(host)$',
            match: false
          }
        }
      ],
      complexity: [
        'error',
        {
          max: 60
        }
      ],
      'space-in-parens': ['warn', 'never'],
      'block-spacing': 'off',
      'comma-spacing': 'off',
      'comma-dangle': 'off',
      'func-call-spacing': 'off',
      'key-spacing': 'off',
      'keyword-spacing': 'off',
      'lines-around-comment': 'off',
      'lines-between-class-members': 'off',
      'space-before-blocks': 'off',
      'space-before-function-paren': 'off',
      'space-infix-ops': 'off',
      indent: 'off',
      'arrow-spacing': 'off',
      'no-use-before-define': 'off',
      'no-new-wrappers': 'error',
      'no-throw-literal': 'error',
      'no-shadow': 'off',
      'no-invalid-this': 'off',
      'no-empty-function': 'off',
      '@angular-eslint/template/label-has-associated-control': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-invalid-this': ['warn'],
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/consistent-type-definitions': 'error',
      "@typescript-eslint/comma-dangle'": 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      '@angular-eslint/no-host-metadata-property': 'off',
      '@angular-eslint/no-inputs-metadata-property': 'off',
      '@angular-eslint/no-outputs-metadata-property': 'off',
      '@angular-eslint/component-class-suffix': 'off',
      '@angular-eslint/directive-class-suffix': 'off',
      '@typescript-eslint/prefer-for-of': 'off'
    }
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {
      '@angular-eslint/template/eqeqeq': 'off',
      '@angular-eslint/template/alt-text': 'off',
      '@angular-eslint/template/label-has-associated-control': 'off',
      '@angular-eslint/template/interactive-supports-focus': 'off',
      '@angular-eslint/template/click-events-have-key-events': 'off',
      '@angular-eslint/template/mouse-events-have-key-events': 'off'
    }
  }
);
