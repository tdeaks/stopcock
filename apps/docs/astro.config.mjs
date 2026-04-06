import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import starlightBlog from 'starlight-blog'

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
            description: 'High-performance functional programming library for TypeScript with pipeline fusion',
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
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/tdeaks/stopcock' },
      ],
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
            { label: 'Option & Result', slug: 'concepts/option-result' },
          ],
        },
        {
          label: 'fp',
          items: [
            { label: 'Overview', slug: 'libraries/fp' },
            { label: 'Stream', slug: 'libraries/stream' },
            {
              label: 'Modules',
              collapsed: true,
              items: [
                { label: 'A (Array)', slug: 'api/array' },
                { label: 'S (String)', slug: 'api/string' },
                { label: 'D (Dict)', slug: 'api/dict' },
                { label: 'N (Number)', slug: 'api/number' },
                { label: 'G (Guards)', slug: 'api/guards' },
                { label: 'Obj (Object)', slug: 'api/object' },
                { label: 'M (Math)', slug: 'api/math' },
                { label: 'B (Boolean)', slug: 'api/boolean' },
                { label: 'Logic', slug: 'api/logic' },
                { label: 'Lenses', slug: 'api/lenses' },
                { label: 'O (Option)', slug: 'api/option' },
                { label: 'R (Result)', slug: 'api/result' },
              ],
            },
          ],
        },
        { label: 'date', slug: 'libraries/date' },
        { label: 'async', slug: 'libraries/async' },
        {
          label: 'img',
          items: [
            { label: 'Overview', slug: 'libraries/img' },
            { label: 'Showcase', slug: 'showcases/img' },
          ],
        },
        { label: 'Benchmarks', slug: 'performance/benchmarks' },
      ],
    }),
  ],
  output: 'static',
})
