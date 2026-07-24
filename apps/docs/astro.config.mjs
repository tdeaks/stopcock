import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import starlightBlog from 'starlight-blog'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  site: 'https://stopcock.dev',
  integrations: [
    starlight({
      title: 'stopcock',
      logo: {
        src: './src/assets/stopcock-logo.svg',
        alt: 'stopcock',
      },
      favicon: '/favicon.svg',
      head: [
        {
          tag: 'meta',
          attrs: { property: 'og:image', content: 'https://stopcock.dev/og.png' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image:width', content: '1200' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image:height', content: '630' },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:image', content: 'https://stopcock.dev/og.png' },
        },
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          content: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'stopcock',
            description:
              'High-performance functional programming library for TypeScript with pipeline fusion',
            url: 'https://stopcock.dev',
            applicationCategory: 'DeveloperApplication',
            operatingSystem: 'Any',
            programmingLanguage: 'TypeScript',
            license: 'https://opensource.org/licenses/MIT',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            codeRepository: 'https://github.com/tdeaks/stopcock',
          }),
        },
      ],
      plugins: [
        starlightBlog({
          title: 'Blog',
          postCount: 10,
          recentPostCount: 5,
          authors: {
            tom: {
              name: 'Tom Deakin',
              url: 'https://github.com/tdeaks',
            },
          },
        }),
      ],
      customCss: [
        '@fontsource-variable/inter',
        '@fontsource-variable/jetbrains-mono',
        './src/styles/theme.css',
      ],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/tdeaks/stopcock' }],
      expressiveCode: {
        themes: ['github-dark'],
        styleOverrides: {
          borderRadius: '0',
          borderColor: 'var(--sl-color-gray-6)',
        },
      },
      sidebar: [
        { label: 'Getting Started', slug: 'getting-started' },
        { label: 'Cookbook', slug: 'cookbook' },
        {
          label: 'Concepts',
          items: [
            { label: 'Fusion', slug: 'concepts/fusion' },
            { label: 'explain()', slug: 'concepts/explain' },
            { label: 'Option & Result', slug: 'concepts/option-result' },
          ],
        },
        {
          label: 'fp',
          items: [
            { label: 'Overview', slug: 'libraries/fp' },
            { label: 'Module catalogue', slug: 'api/modules' },
            { label: 'Iter', slug: 'api/iter' },
            {
              label: 'Modules',
              collapsed: true,
              items: [
                { label: 'Array', slug: 'api/array' },
                { label: 'String', slug: 'api/string' },
                { label: 'Number', slug: 'api/number' },
                { label: 'Guards', slug: 'api/guards' },
                { label: 'Object', slug: 'api/object' },
                { label: 'Math', slug: 'api/math' },
                { label: 'Boolean', slug: 'api/boolean' },
                { label: 'Option', slug: 'api/option' },
                { label: 'Result', slug: 'api/result' },
                { label: 'Validation', slug: 'api/validation' },
                { label: 'Schema interop', slug: 'api/schema' },
                { label: 'Algebra', slug: 'api/algebra' },
                { label: 'Optic', slug: 'api/optic' },
              ],
            },
            { label: 'Stream migration', slug: 'libraries/stream' },
          ],
        },
        {
          label: 'FP companions',
          items: [
            { label: 'fp-compiler', slug: 'libraries/fp-compiler' },
            { label: 'fp-interop', slug: 'libraries/fp-interop' },
            { label: 'pattern', slug: 'libraries/pattern' },
            { label: 'parser', slug: 'libraries/parser' },
            { label: 'persistent', slug: 'libraries/persistent' },
            { label: 'fp-testing', slug: 'libraries/fp-testing' },
            { label: 'eslint-plugin-fp', slug: 'libraries/eslint-plugin-fp' },
            { label: 'fp-codemod', slug: 'libraries/fp-codemod' },
          ],
        },
        { label: 'date', slug: 'libraries/date' },
        { label: 'async', slug: 'libraries/async' },
        { label: 'http', slug: 'libraries/http' },
        {
          label: 'Showcases',
          items: [
            { label: 'Color', slug: 'showcases/color' },
            { label: 'Image Processing', slug: 'showcases/img' },
            { label: 'SVG + Color Batch', slug: 'showcases/svg-color-batch' },
          ],
        },
        { label: 'autodiff', slug: 'libraries/autodiff' },
        { label: 'la', slug: 'libraries/la' },
        { label: 'signal', slug: 'libraries/signal' },
        { label: 'diff', slug: 'libraries/diff' },
        { label: 'state', slug: 'libraries/state' },
        {
          label: 'img',
          items: [
            { label: 'Overview', slug: 'libraries/img' },
            { label: 'Showcase', slug: 'showcases/img' },
          ],
        },
        {
          label: 'color',
          items: [
            { label: 'Overview', slug: 'libraries/color' },
            { label: 'Showcase', slug: 'showcases/color' },
          ],
        },
        {
          label: 'svg',
          items: [{ label: 'Overview', slug: 'libraries/svg' }],
        },
        { label: 'Benchmarks', slug: 'performance/benchmarks' },
      ],
    }),
  ],
  output: 'static',
  vite: {
    resolve: {
      alias: [
        {
          find: '@stopcock/la/accel',
          replacement: path.resolve(__dirname, '../../packages/la/src/accel.ts'),
        },
        {
          find: '@stopcock/la/fast',
          replacement: path.resolve(__dirname, '../../packages/la/src/fast.ts'),
        },
        {
          find: '@stopcock/la/primitives',
          replacement: path.resolve(__dirname, '../../packages/la/src/primitives.ts'),
        },
        {
          find: '@stopcock/fp/dual',
          replacement: path.resolve(__dirname, '../../packages/fp/src/dual.ts'),
        },
        {
          find: '@stopcock/fp/option',
          replacement: path.resolve(__dirname, '../../packages/fp/src/option.ts'),
        },
        {
          find: '@stopcock/fp/result',
          replacement: path.resolve(__dirname, '../../packages/fp/src/result.ts'),
        },
        {
          find: '@stopcock/svg/la',
          replacement: path.resolve(__dirname, '../../packages/svg/src/la/index.ts'),
        },
        {
          find: '@stopcock/color',
          replacement: path.resolve(__dirname, '../../packages/color/src/index.ts'),
        },
        {
          find: '@stopcock/autodiff/tape',
          replacement: path.resolve(__dirname, '../../packages/autodiff/src/tape.ts'),
        },
        {
          find: '@stopcock/autodiff',
          replacement: path.resolve(__dirname, '../../packages/autodiff/src/index.ts'),
        },
        {
          find: '@stopcock/la',
          replacement: path.resolve(__dirname, '../../packages/la/src/index.ts'),
        },
        {
          find: '@stopcock/signal',
          replacement: path.resolve(__dirname, '../../packages/signal/src/index.ts'),
        },
        {
          find: '@stopcock/fp',
          replacement: path.resolve(__dirname, '../../packages/fp/src/index.ts'),
        },
        {
          find: '@stopcock/svg',
          replacement: path.resolve(__dirname, '../../packages/svg/src/index.ts'),
        },
      ],
    },
  },
})
