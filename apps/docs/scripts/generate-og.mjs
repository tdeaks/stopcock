import sharp from 'sharp'

const width = 1200
const height = 630
const logoDim = 140
const bg = '#0e100e'
const accent = '#34d26a'
const text = '#e9ebe8'

const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${bg}"/>
  <text x="${width / 2}" y="${height / 2 + 50}"
        font-family="system-ui, sans-serif" font-size="64" font-weight="700"
        fill="${text}" text-anchor="middle" letter-spacing="-2">
    stopcock
  </text>
  <text x="${width / 2}" y="${height / 2 + 100}"
        font-family="system-ui, sans-serif" font-size="24" font-weight="400"
        fill="${accent}" text-anchor="middle">
    Functional TypeScript with pipeline fusion
  </text>
</svg>`

const logo = await sharp('src/assets/stopcock-logo.svg')
  .resize(logoDim, logoDim)
  .toBuffer()

await sharp(Buffer.from(svg))
  .composite([{
    input: logo,
    top: Math.round(height / 2 - logoDim - 30),
    left: Math.round(width / 2 - logoDim / 2),
  }])
  .png()
  .toFile('public/og.png')

console.log('wrote public/og.png')
