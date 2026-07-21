import { defineConfig } from 'vite-plus'

export default defineConfig({
  fmt: {
    ignorePatterns: [
      '**/dist/**',
      '**/coverage/**',
      '**/.astro/**',
      '**/target/**',
      'packages/fp/src/*.gen.tsx',
      'packages/fp/src/*.res.js',
    ],
    singleQuote: true,
    semi: false,
  },
  lint: {
    plugins: ['eslint', 'typescript', 'oxc', 'vitest'],
    categories: {
      correctness: 'error',
      suspicious: 'off',
      perf: 'off',
    },
    ignorePatterns: [
      '**/dist/**',
      '**/coverage/**',
      '**/.astro/**',
      '**/target/**',
      'benchmarks/**',
      'examples/**',
      '**/__tests__/**',
      '**/*.{test,spec}.{js,jsx,ts,tsx}',
      '**/*.test-d.ts',
      '**/*.bench.{js,jsx,ts,tsx}',
      'packages/fp/codegen/defs/**',
      'packages/fp/src/*.gen.tsx',
      'packages/fp/src/*.res.js',
    ],
    rules: {
      'eslint/no-unused-vars': 'off',
      'eslint/no-unused-expressions': [
        'error',
        {
          allowShortCircuit: true,
          allowTernary: true,
          allowTaggedTemplates: true,
        },
      ],
      'vitest/expect-expect': 'off',
      'vitest/no-conditional-expect': 'off',
      'vitest/require-mock-type-parameters': 'off',
      'vitest/require-to-throw-message': 'off',
      'typescript/no-duplicate-type-constituents': 'warn',
      'typescript/no-implied-eval': 'warn',
      'typescript/no-misused-spread': 'warn',
      'typescript/no-redundant-type-constituents': 'warn',
      'typescript/require-array-sort-compare': 'warn',
      'typescript/unbound-method': 'warn',
      'vite-plus/prefer-vite-plus-imports': 'error',
    },
    overrides: [
      {
        files: ['apps/**/*.{ts,tsx,js,jsx}'],
        env: {
          browser: true,
        },
      },
      {
        files: ['apps/docs/**/*.astro'],
        env: {
          astro: true,
          browser: true,
        },
      },
      {
        files: [
          'apps/demo/**/*.{ts,tsx,js,jsx}',
          'packages/state/src/react.ts',
          'packages/state/src/__tests__/react.test.ts',
        ],
        plugins: ['eslint', 'typescript', 'oxc', 'vitest', 'react'],
        rules: {
          'react/react-in-jsx-scope': 'off',
          'react/only-export-components': [
            'warn',
            {
              allowConstantExport: true,
            },
          ],
        },
      },
      {
        files: ['apps/synth-studio/**/*.{ts,tsx}'],
        rules: {
          'eslint/no-unassigned-vars': 'off',
        },
      },
      {
        files: ['**/*.{test,spec}.{ts,tsx,js,jsx}', '**/*.test-d.ts'],
        env: {
          vitest: true,
        },
      },
      {
        files: ['benchmarks/**/*.{ts,tsx,js,jsx}'],
        rules: {
          'eslint/no-unused-expressions': 'off',
        },
      },
      {
        files: [
          'packages/fp/src/array.ts',
          'packages/fp/src/fuse.ts',
          'packages/fp/src/pipe.ts',
          'packages/fp/src/stream.ts',
        ],
        rules: {
          'typescript/no-implied-eval': 'off',
        },
      },
      {
        files: ['**/*.config.{js,mjs,cjs,ts,mts,cts}', 'packages/fp/codegen/**/*.{js,ts}'],
        env: {
          node: true,
        },
      },
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: 'vite-plus',
        specifier: 'vite-plus/oxlint-plugin',
      },
    ],
  },
  run: {
    cache: {
      scripts: false,
      tasks: true,
    },
    tasks: {
      build: {
        command: 'vp run -r --concurrency-limit 2 build',
      },
      'build:packages': {
        command:
          "vp run --filter './packages/*' --filter '!@stopcock/synth' --fail-if-no-match --concurrency-limit 2 build",
      },
      'docs:build': {
        command: 'vp run --filter @stopcock/docs... --fail-if-no-match --concurrency-limit 2 build',
      },
      'docs:dev': {
        command: 'vp run --no-cache --filter @stopcock/docs --fail-if-no-match dev',
        cache: false,
      },
    },
  },
})
