import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ONLINE_MODELS } from '../src/onlineModels.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const outputDir = path.join(projectRoot, 'public', 'models')
const outputFile = path.join(outputDir, 'models.json')

const normalized = ONLINE_MODELS
  .filter((item) => item && item.id && item.name && item.url && item.sha256)
  .map((item) => ({
    id: String(item.id),
    name: String(item.name),
    url: String(item.url),
    sha256: String(item.sha256)
  }))

await mkdir(outputDir, { recursive: true })
await writeFile(outputFile, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')

console.log(`Generated ${path.relative(projectRoot, outputFile)} (${normalized.length} models)`)
