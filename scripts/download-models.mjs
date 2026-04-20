/**
 * Downloads SmartComponents/bge-micro-v2 (quantized ONNX) from HuggingFace
 * into public/models/ so the app never needs network access for AI features.
 *
 * Usage: npm run download-models
 */

import { createWriteStream, existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, '..', 'public', 'models', 'SmartComponents', 'bge-micro-v2')
const HF_BASE = 'https://huggingface.co/SmartComponents/bge-micro-v2/resolve/main/'

const FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'vocab.txt',
  'onnx/model_quantized.onnx',   // ~22 MB
]

async function downloadFile(filename) {
  const dest = join(OUTPUT_DIR, ...filename.split('/'))

  if (existsSync(dest)) {
    console.log(`  ✓ ${filename} (already downloaded)`)
    return
  }

  await mkdir(dirname(dest), { recursive: true })

  const res = await fetch(HF_BASE + filename, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${filename}`)
  if (!res.body) throw new Error(`No body for ${filename}`)

  const total = parseInt(res.headers.get('content-length') ?? '0', 10)
  let downloaded = 0

  const tracker = new TransformStream({
    transform(chunk, ctrl) {
      downloaded += chunk.byteLength
      if (total > 0) {
        const pct = Math.round((downloaded / total) * 100)
        process.stdout.write(`\r  ↓ ${filename}  ${pct}%  `)
      }
      ctrl.enqueue(chunk)
    },
  })

  await pipeline(Readable.fromWeb(res.body.pipeThrough(tracker)), createWriteStream(dest))

  const mb = (downloaded / 1024 / 1024).toFixed(1)
  process.stdout.write(`\r  ✓ ${filename}  (${mb} MB)            \n`)
}

console.log('Downloading SmartComponents/bge-micro-v2 (quantized ONNX)…\n')
for (const file of FILES) {
  await downloadFile(file)
}
console.log('\nDone! Run `npm run tauri dev` to start with the local model.\n')
