import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const docsDir = path.resolve(scriptDir, '../src/content/docs')
const publicDir = path.resolve(scriptDir, '../public')
const site = 'https://stopcock.dev'

const categoryOrder = [
  'Guides',
  'Concepts',
  'Libraries',
  'API',
  'Showcases',
  'Performance',
  'Blog',
]

const categoryFor = (relativePath) => {
  const root = relativePath.split('/')[0]
  if (root === 'concepts') return 'Concepts'
  if (root === 'libraries') return 'Libraries'
  if (root === 'api') return 'API'
  if (root === 'showcases') return 'Showcases'
  if (root === 'performance') return 'Performance'
  if (root === 'blog') return 'Blog'
  return 'Guides'
}

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(target) : [target]
  }))
  return files.flat()
}

const parseFrontmatter = (source) => {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?/)
  const frontmatter = match?.[1] ?? ''
  const value = (key) => {
    const field = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? ''
    return field.replace(/^['"]|['"]$/g, '')
  }
  return {
    title: value('title'),
    description: value('description'),
    body: match ? source.slice(match[0].length) : source,
  }
}

const cleanBody = (body) => {
  const lines = body.split('\n')
  let scanningPreamble = true
  const kept = []

  for (const line of lines) {
    if (scanningPreamble && line.trim() === '') continue
    if (scanningPreamble && line.startsWith('import ')) continue
    scanningPreamble = false
    if (/^\s*<[A-Z][A-Za-z0-9]*(?:\s[^>]*)?\s*\/>\s*$/.test(line)) continue
    kept.push(line)
  }

  return kept.join('\n').trim()
}

const toRoute = (relativePath) => {
  const withoutExtension = relativePath.replace(/\.mdx$/, '')
  if (withoutExtension === 'index') return '/'
  return `/${withoutExtension.replace(/\/index$/, '')}/`
}

const files = (await walk(docsDir))
  .filter((file) => file.endsWith('.mdx'))
  .sort()

const pages = await Promise.all(files.map(async (file) => {
  const relativePath = path.relative(docsDir, file)
  const source = await readFile(file, 'utf8')
  const parsed = parseFrontmatter(source)
  return {
    ...parsed,
    body: cleanBody(parsed.body),
    category: categoryFor(relativePath),
    route: toRoute(relativePath),
  }
}))

const intro = `# stopcock

> Fast, composable TypeScript packages for functional programming, dates, async work, HTTP, state, diffing, linear algebra, automatic differentiation, signal processing, color, SVG, and image processing.

Packages are independently installable under the \`@stopcock\` scope.

## Install

\`\`\`bash
bun add @stopcock/fp
\`\`\``

const indexLines = [intro]
for (const category of categoryOrder) {
  const entries = pages.filter((page) => page.category === category && page.route !== '/')
  if (entries.length === 0) continue
  const links = entries.map((page) => {
    const detail = page.description ? `: ${page.description}` : ''
    return `- [${page.title}](${site}${page.route})${detail}`
  })
  indexLines.push(`## ${category}\n\n${links.join('\n')}`)
}

const fullSections = pages.map((page) => [
  '---',
  `# ${page.title}`,
  '',
  `Source: ${site}${page.route}`,
  page.description ? `\n${page.description}` : '',
  page.body ? `\n${page.body}` : '',
].join('\n').trim())

await Promise.all([
  writeFile(path.join(publicDir, 'llms.txt'), `${indexLines.join('\n\n')}\n`),
  writeFile(path.join(publicDir, 'llms-full.txt'), `${intro}\n\n${fullSections.join('\n\n')}\n`),
])
