/**
 * Parses benchmark markdown files into structured JSON for D3 charts.
 * Run: bun packages/docs/src/data/parse-benchmarks.ts
 */

export type BenchmarkEntry = {
  library: string
  opsPerSec: number
  margin: string
  runs: number
  diff: string
}

export type BenchmarkSuite = {
  category: string
  arraySize: number | null
  entries: BenchmarkEntry[]
}

export type BenchmarkData = {
  runtime: string
  suites: BenchmarkSuite[]
}

const resultPattern = /✔\s+(.+?)\s{2,}([\d,]+\.\d+)\s+ops\/sec\s+(±[\d.]+%)\s+\((\d+)\s+runs?\)\s+(.+)/

function parseBenchmarkMarkdown(content: string, runtime: string): BenchmarkData {
  const suites: BenchmarkSuite[] = []
  let currentCategory = ''
  let currentSize: number | null = null
  let currentEntries: BenchmarkEntry[] = []

  const flush = () => {
    if (currentEntries.length > 0) {
      suites.push({ category: currentCategory, arraySize: currentSize, entries: currentEntries })
      currentEntries = []
    }
  }

  for (const line of content.split('\n')) {
    const categoryMatch = line.match(/^###\s+(.+)/)
    if (categoryMatch) {
      flush()
      currentCategory = categoryMatch[1].trim()
      currentSize = null
      continue
    }

    const sizeMatch = line.match(/_n\s*=\s*([\d,]+)_/)
    if (sizeMatch) {
      flush()
      currentSize = parseInt(sizeMatch[1].replace(/,/g, ''))
      continue
    }

    const resultMatch = line.match(resultPattern)
    if (resultMatch) {
      const rawName = resultMatch[1].trim()
      currentEntries.push({
        library: rawName === 'lay-some-pipe' ? 'stopcock' : rawName,
        opsPerSec: parseFloat(resultMatch[2].replace(/,/g, '')),
        margin: resultMatch[3],
        runs: parseInt(resultMatch[4]),
        diff: resultMatch[5].trim(),
      })
    }
  }

  flush()
  return { runtime, suites }
}

if (import.meta.main) {
  const nodeContent = await Bun.file('../../docs/benchmarks-node-dist.md').text()
  const bunContent = await Bun.file('../../docs/benchmarks-bun-dist.md').text()
  const denoContent = await Bun.file('../../docs/benchmarks-deno-dist.md').text()

  const nodeData = parseBenchmarkMarkdown(nodeContent, 'Node.js v22')
  const bunData = parseBenchmarkMarkdown(bunContent, 'Bun 1.3')
  const denoData = parseBenchmarkMarkdown(denoContent, 'Deno')

  await Bun.write('src/data/benchmarks-node.json', JSON.stringify(nodeData, null, 2))
  await Bun.write('src/data/benchmarks-bun.json', JSON.stringify(bunData, null, 2))
  await Bun.write('src/data/benchmarks-deno.json', JSON.stringify(denoData, null, 2))

  console.log(`Parsed ${nodeData.suites.length} Node.js suites, ${bunData.suites.length} Bun suites, ${denoData.suites.length} Deno suites`)
}
