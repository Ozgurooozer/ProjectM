import { pipeline, env } from '@xenova/transformers'

env.allowLocalModels = false
env.useBrowserCache = true

const MODEL_NAME = 'Xenova/bge-micro-v2'
const TASK = 'feature-extraction'

type WorkerMessage =
  | { type: 'LOAD_MODEL' }
  | { type: 'EMBED'; id: string; text: string }
  | { type: 'EMBED_BATCH'; id: string; texts: string[] }

type WorkerResponse =
  | { type: 'MODEL_LOADING' }
  | { type: 'MODEL_READY' }
  | { type: 'MODEL_ERROR'; error: string }
  | { type: 'EMBED_RESULT'; id: string; vector: number[] }
  | { type: 'EMBED_BATCH_RESULT'; id: string; vectors: number[][] }
  | { type: 'EMBED_ERROR'; id: string; error: string }
  | { type: 'PROGRESS'; status: string; progress: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractor: any = null

async function loadModel() {
  self.postMessage({ type: 'MODEL_LOADING' } satisfies WorkerResponse)

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extractor = await (pipeline as any)(TASK, MODEL_NAME, {
      quantized: true,
      progress_callback: (progress: {
        status: string
        progress?: number
        name?: string
      }) => {
        if (progress.status === 'downloading') {
          self.postMessage({
            type: 'PROGRESS',
            status: `Downloading model: ${progress.name ?? ''}`,
            progress: progress.progress ?? 0,
          } satisfies WorkerResponse)
        }
        if (progress.status === 'loading') {
          self.postMessage({
            type: 'PROGRESS',
            status: 'Loading model into memory...',
            progress: 100,
          } satisfies WorkerResponse)
        }
      },
    })

    self.postMessage({ type: 'MODEL_READY' } satisfies WorkerResponse)
  } catch (err) {
    self.postMessage({
      type: 'MODEL_ERROR',
      error: String(err),
    } satisfies WorkerResponse)
  }
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
  if (magnitude === 0) return vector
  return vector.map((v) => v / magnitude)
}

async function embedText(text: string): Promise<number[]> {
  if (!extractor) throw new Error('Model not loaded')

  const prefixedText = `Represent this sentence: ${text}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const output = await (extractor as any)(prefixedText, { pooling: 'mean', normalize: true })

  return normalizeVector(Array.from((output as { data: Float32Array }).data))
}

self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data

  switch (msg.type) {
    case 'LOAD_MODEL':
      await loadModel()
      break

    case 'EMBED':
      try {
        const vector = await embedText(msg.text)
        self.postMessage({
          type: 'EMBED_RESULT',
          id: msg.id,
          vector,
        } satisfies WorkerResponse)
      } catch (err) {
        self.postMessage({
          type: 'EMBED_ERROR',
          id: msg.id,
          error: String(err),
        } satisfies WorkerResponse)
      }
      break

    case 'EMBED_BATCH':
      try {
        const vectors: number[][] = []
        for (const text of msg.texts) {
          const vector = await embedText(text)
          vectors.push(vector)
        }
        self.postMessage({
          type: 'EMBED_BATCH_RESULT',
          id: msg.id,
          vectors,
        } satisfies WorkerResponse)
      } catch (err) {
        self.postMessage({
          type: 'EMBED_ERROR',
          id: msg.id,
          error: String(err),
        } satisfies WorkerResponse)
      }
      break
  }
})
